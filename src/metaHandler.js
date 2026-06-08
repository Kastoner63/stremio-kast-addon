const { loadPasteLibrary } = require('./pasteService');
const { genreNames } = require('./genreMap');
const { parseId, episodeId, cartoonEpisodeId, documentaryEpisodeId } = require('./idHelpers');
const { enrichMovie, enrichSeries, isTmdbEnabled } = require('./tmdbService');

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

async function movieMeta(item, id, userConfig = {}) {
  const tmdb = isTmdbEnabled(userConfig) ? await enrichMovie(item, userConfig) : {};

  return removeUndefined({
    id,
    type: 'movie',
    name: tmdb.name || item.title,
    releaseInfo: tmdb.releaseInfo || (item.year ? String(item.year) : undefined),
    poster: tmdb.poster,
    background: tmdb.background,
    logo: tmdb.logo,
    genres: genreNames(item.genres),
    imdbRating: tmdb.imdbRating,
    runtime: tmdb.runtime,
    description: tmdb.description || `Versions disponibles : ${item.qualities.join(', ')}`,
  });
}

async function seriesMeta(seasons, id, options = {}, userConfig = {}) {
  const first = seasons[0];
  const tmdb = isTmdbEnabled(userConfig) ? await enrichSeries(first, userConfig) : {};
  const buildEpisodeId = options.cartoonSeries
    ? cartoonEpisodeId
    : options.documentarySeries
      ? documentaryEpisodeId
      : episodeId;

  const videos = seasons
    .slice()
    .sort((a, b) => a.season - b.season)
    .flatMap((season) =>
      Object.keys(season.episodes)
        .map(Number)
        .sort((a, b) => a - b)
        .map((episode) => ({
          id: buildEpisodeId(season.tmdbId, season.season, episode),
          title: `S${String(season.season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`,
          season: season.season,
          episode,
        }))
    );

  return removeUndefined({
    id,
    type: 'series',
    name: tmdb.name || first.title,
    releaseInfo: tmdb.releaseInfo || (first.year ? String(first.year) : undefined),
    poster: tmdb.poster,
    background: tmdb.background,
    logo: tmdb.logo,
    genres: genreNames(first.genres),
    imdbRating: tmdb.imdbRating,
    videos,
    description: tmdb.description || `${seasons.length} saison(s), ${videos.length} épisode(s)`,
  });
}

async function metaHandler(args, userConfig = {}) {
  const library = await loadPasteLibrary();
  const parsed = parseId(args.id);

  if (args.type === 'movie' && parsed.entity === 'movie') {
    const item = library.movies.find((movie) => movie.tmdbId === parsed.tmdbId);
    return { meta: item ? await movieMeta(item, args.id, userConfig) : null };
  }

  if (args.type === 'movie' && parsed.entity === 'cartoon') {
    const item = library.cartoons.find((movie) => movie.tmdbId === parsed.tmdbId);
    return { meta: item ? await movieMeta(item, args.id, userConfig) : null };
  }

  if (args.type === 'movie' && parsed.entity === 'documentary') {
    const item = library.documentaries.find((movie) => movie.tmdbId === parsed.tmdbId);
    return { meta: item ? await movieMeta(item, args.id, userConfig) : null };
  }

  if (args.type === 'movie' && parsed.entity === 'spectacle') {
    const item = library.spectacles.find((movie) => movie.tmdbId === parsed.tmdbId);
    return { meta: item ? await movieMeta(item, args.id, userConfig) : null };
  }

  if (args.type === 'movie' && parsed.entity === 'concert') {
    const item = library.concerts.find((movie) => movie.tmdbId === parsed.tmdbId);
    return { meta: item ? await movieMeta(item, args.id, userConfig) : null };
  }

  if (args.type === 'series' && parsed.entity === 'series') {
    const seasons = library.series.filter((season) => season.tmdbId === parsed.tmdbId);
    return { meta: seasons.length ? await seriesMeta(seasons, args.id, {}, userConfig) : null };
  }

  if (args.type === 'series' && parsed.entity === 'cartoonseries') {
    const seasons = library.cartoonSeries.filter((season) => season.tmdbId === parsed.tmdbId);
    return { meta: seasons.length ? await seriesMeta(seasons, args.id, { cartoonSeries: true }, userConfig) : null };
  }

  if (args.type === 'series' && parsed.entity === 'documentaryseries') {
    const seasons = library.documentarySeries.filter((season) => season.tmdbId === parsed.tmdbId);
    return { meta: seasons.length ? await seriesMeta(seasons, args.id, { documentarySeries: true }, userConfig) : null };
  }

  return { meta: null };
}

module.exports = { metaHandler };
