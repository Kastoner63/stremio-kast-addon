const { config } = require('./config');
const { clean } = require('./security');

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const tmdbCache = new Map();

function getTmdbConfig(userConfig = {}) {
  const accessToken = clean(userConfig.tmdbAccessToken) || clean(config.tmdb.accessToken);
  const apiKey = clean(userConfig.tmdbApiKey) || clean(config.tmdb.apiKey);
  return {
    accessToken,
    apiKey,
    language: clean(userConfig.tmdbLanguage) || config.tmdb.language || 'fr-FR',
    imageSizePoster: config.tmdb.imageSizePoster || 'w500',
    imageSizeBackdrop: config.tmdb.imageSizeBackdrop || 'w1280',
    enabled: Boolean(accessToken || apiKey),
  };
}

function isTmdbEnabled(userConfig = {}) {
  return getTmdbConfig(userConfig).enabled;
}

function buildImageUrl(filePath, size) {
  if (!filePath) return undefined;
  return `${TMDB_IMAGE_BASE_URL}/${size}${filePath}`;
}

function cacheGet(key) {
  const entry = tmdbCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    tmdbCache.delete(key);
    return null;
  }

  return entry.value;
}

function cacheSet(key, value) {
  tmdbCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function tmdbFetch(pathname, query = {}, userConfig = {}) {
  const auth = getTmdbConfig(userConfig);
  if (!auth.enabled) return null;

  const authKey = auth.accessToken ? `token:${auth.accessToken.slice(-8)}` : `key:${auth.apiKey.slice(-8)}`;
  const cacheKey = `${pathname}?${JSON.stringify(query)}:${auth.language}:${authKey}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = new URL(`${TMDB_API_BASE_URL}${pathname}`);
  url.searchParams.set('language', auth.language);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    'User-Agent': 'KastPrivateStremioAddon/1.0',
    Accept: 'application/json',
  };

  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  } else if (auth.apiKey) {
    url.searchParams.set('api_key', auth.apiKey);
  }

  const response = await fetch(url, { headers });

  if (response.status === 404) {
    cacheSet(cacheKey, null);
    return null;
  }

  if (!response.ok) {
    console.warn(`[TMDB] Erreur HTTP ${response.status} pour ${pathname}`);
    return null;
  }

  const json = await response.json();
  cacheSet(cacheKey, json);
  return json;
}


async function findTmdbByImdbId(imdbId, mediaType, userConfig = {}) {
  const cleanImdbId = String(imdbId || '').trim();
  if (!/^tt\d+$/i.test(cleanImdbId)) return null;

  const result = await tmdbFetch(
    `/find/${encodeURIComponent(cleanImdbId)}`,
    { external_source: 'imdb_id' },
    userConfig
  );

  if (!result) return null;

  if (mediaType === 'movie') {
    const movie = Array.isArray(result.movie_results) ? result.movie_results[0] : null;
    return movie && movie.id ? String(movie.id) : null;
  }

  if (mediaType === 'series') {
    const series = Array.isArray(result.tv_results) ? result.tv_results[0] : null;
    return series && series.id ? String(series.id) : null;
  }

  const movie = Array.isArray(result.movie_results) ? result.movie_results[0] : null;
  if (movie && movie.id) return String(movie.id);

  const series = Array.isArray(result.tv_results) ? result.tv_results[0] : null;
  if (series && series.id) return String(series.id);

  return null;
}

async function getMovieDetails(tmdbId, userConfig = {}) {
  if (!tmdbId) return null;
  return tmdbFetch(`/movie/${encodeURIComponent(tmdbId)}`, {}, userConfig);
}

async function getSeriesDetails(tmdbId, userConfig = {}) {
  if (!tmdbId) return null;
  return tmdbFetch(`/tv/${encodeURIComponent(tmdbId)}`, {}, userConfig);
}

function formatRuntime(minutes) {
  if (!minutes || !Number.isFinite(Number(minutes))) return undefined;
  const total = Number(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h}h`;
  return `${h}h ${m}min`;
}

function firstDateYear(value) {
  const text = String(value || '');
  const match = text.match(/^(\d{4})/);
  return match ? match[1] : undefined;
}

function movieFieldsFromTmdb(details, userConfig = {}) {
  if (!details) return {};
  const auth = getTmdbConfig(userConfig);

  return {
    name: details.title || details.original_title || undefined,
    poster: buildImageUrl(details.poster_path, auth.imageSizePoster),
    background: buildImageUrl(details.backdrop_path, auth.imageSizeBackdrop),
    logo: buildImageUrl(details.poster_path, auth.imageSizePoster),
    description: details.overview || undefined,
    releaseInfo: firstDateYear(details.release_date),
    imdbRating: details.vote_average ? String(Number(details.vote_average).toFixed(1)) : undefined,
    runtime: formatRuntime(details.runtime),
  };
}

function seriesFieldsFromTmdb(details, userConfig = {}) {
  if (!details) return {};
  const auth = getTmdbConfig(userConfig);

  return {
    name: details.name || details.original_name || undefined,
    poster: buildImageUrl(details.poster_path, auth.imageSizePoster),
    background: buildImageUrl(details.backdrop_path, auth.imageSizeBackdrop),
    logo: buildImageUrl(details.poster_path, auth.imageSizePoster),
    description: details.overview || undefined,
    releaseInfo: firstDateYear(details.first_air_date),
    imdbRating: details.vote_average ? String(Number(details.vote_average).toFixed(1)) : undefined,
  };
}

async function enrichMovie(item, userConfig = {}) {
  const details = await getMovieDetails(item.tmdbId, userConfig);
  return movieFieldsFromTmdb(details, userConfig);
}

async function enrichSeries(itemOrTmdbId, userConfig = {}) {
  const tmdbId = typeof itemOrTmdbId === 'string' ? itemOrTmdbId : itemOrTmdbId.tmdbId;
  const details = await getSeriesDetails(tmdbId, userConfig);
  return seriesFieldsFromTmdb(details, userConfig);
}

module.exports = {
  isTmdbEnabled,
  findTmdbByImdbId,
  getMovieDetails,
  getSeriesDetails,
  enrichMovie,
  enrichSeries,
  buildImageUrl,
  getTmdbConfig,
};
