const { loadPasteLibrary } = require('./pasteService');
const {
  movieId,
  cartoonId,
  documentaryId,
  spectacleId,
  concertId,
  seriesId,
  cartoonSeriesId,
  documentarySeriesId,
} = require('./idHelpers');
const { genreNames } = require('./genreMap');
const { enrichMovie, enrichSeries, isTmdbEnabled } = require('./tmdbService');

const PAGE_SIZE = 100;

function applySearch(items, search) {
  const query = String(search || '').trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => item.title.toLowerCase().includes(query));
}

function applyPagination(items, skip) {
  const offset = Number.parseInt(skip, 10) || 0;
  return items.slice(offset, offset + PAGE_SIZE);
}

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  );
}

function idForMovieKind(item) {
  if (item.kind === 'cartoons') return cartoonId(item.tmdbId);
  if (item.kind === 'documentaries') return documentaryId(item.tmdbId);
  if (item.kind === 'spectacles') return spectacleId(item.tmdbId);
  if (item.kind === 'concerts') return concertId(item.tmdbId);
  return movieId(item.tmdbId);
}

async function toMoviePreview(item, userConfig = {}) {
  const tmdb = isTmdbEnabled(userConfig) ? await enrichMovie(item, userConfig) : {};

  return removeUndefined({
    id: idForMovieKind(item),
    type: 'movie',
    name: tmdb.name || item.title,
    releaseInfo: tmdb.releaseInfo || (item.year ? String(item.year) : undefined),
    poster: tmdb.poster,
    background: tmdb.background,
    logo: tmdb.logo,
    genres: genreNames(item.genres),
    imdbRating: tmdb.imdbRating,
    description: tmdb.description || `${item.qualities.length} version(s) disponible(s)`,
  });
}

function groupSeriesByTmdb(seriesSeasons, kind = 'series') {
  const grouped = new Map();

  for (const season of seriesSeasons) {
    if (!grouped.has(season.tmdbId)) {
      grouped.set(season.tmdbId, {
        tmdbId: season.tmdbId,
        title: season.title,
        year: season.year,
        genres: season.genres,
        kind,
        seasonsCount: 0,
        episodesCount: 0,
      });
    }

    const item = grouped.get(season.tmdbId);
    item.seasonsCount += 1;
    item.episodesCount += Object.keys(season.episodes).length;
  }

  return [...grouped.values()];
}

function idForSeriesKind(item) {
  if (item.kind === 'cartoonSeries') return cartoonSeriesId(item.tmdbId);
  if (item.kind === 'documentarySeries') return documentarySeriesId(item.tmdbId);
  return seriesId(item.tmdbId);
}

async function toSeriesPreview(item, userConfig = {}) {
  const tmdb = isTmdbEnabled(userConfig) ? await enrichSeries(item, userConfig) : {};

  return removeUndefined({
    id: idForSeriesKind(item),
    type: 'series',
    name: tmdb.name || item.title,
    releaseInfo: tmdb.releaseInfo || (item.year ? String(item.year) : undefined),
    poster: tmdb.poster,
    background: tmdb.background,
    logo: tmdb.logo,
    genres: genreNames(item.genres),
    imdbRating: tmdb.imdbRating,
    description: tmdb.description || `${item.seasonsCount} saison(s), ${item.episodesCount} épisode(s)`,
  });
}

async function mapWithLimitedConcurrency(items, mapper, limit = 8) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function movieCatalog(items, search, skip, userConfig = {}) {
  const page = applyPagination(applySearch(items, search), skip);
  return { metas: await mapWithLimitedConcurrency(page, (item) => toMoviePreview(item, userConfig)) };
}

async function seriesCatalog(items, search, skip, kind, userConfig = {}) {
  const grouped = groupSeriesByTmdb(items, kind);
  const page = applyPagination(applySearch(grouped, search), skip);
  return { metas: await mapWithLimitedConcurrency(page, (item) => toSeriesPreview(item, userConfig)) };
}

async function catalogHandler(args, userConfig = {}) {
  const library = await loadPasteLibrary();
  const search = args.extra && args.extra.search;
  const skip = args.extra && args.extra.skip;

  if (args.type === 'movie' && args.id === 'kast-movies') {
    return movieCatalog(library.movies, search, skip, userConfig);
  }

  if (args.type === 'movie' && args.id === 'kast-cartoons') {
    return movieCatalog(library.cartoons, search, skip, userConfig);
  }

  if (args.type === 'movie' && args.id === 'kast-documentaries') {
    return movieCatalog(library.documentaries, search, skip, userConfig);
  }

  if (args.type === 'movie' && args.id === 'kast-spectacles') {
    return movieCatalog(library.spectacles, search, skip, userConfig);
  }

  if (args.type === 'movie' && args.id === 'kast-concerts') {
    return movieCatalog(library.concerts, search, skip, userConfig);
  }

  if (args.type === 'series' && args.id === 'kast-series') {
    return seriesCatalog(library.series, search, skip, 'series', userConfig);
  }

  if (args.type === 'series' && args.id === 'kast-cartoon-series') {
    return seriesCatalog(library.cartoonSeries, search, skip, 'cartoonSeries', userConfig);
  }

  if (args.type === 'series' && args.id === 'kast-documentary-series') {
    return seriesCatalog(library.documentarySeries, search, skip, 'documentarySeries', userConfig);
  }

  return { metas: [] };
}

module.exports = { catalogHandler, groupSeriesByTmdb };
