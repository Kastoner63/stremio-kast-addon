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

function applyGenre(items, genre) {
  const selected = String(genre || '').trim().toLocaleLowerCase('fr');
  if (!selected) return items;
  return items.filter((item) =>
    genreNames(item.genres).some((name) => name.toLocaleLowerCase('fr') === selected)
  );
}

function applyYear(items, year) {
  const selected = String(year || '').trim();
  if (!/^\d{4}$/.test(selected)) return [];
  const target = Number.parseInt(selected, 10);
  return items.filter((item) => Number(item.year) === target);
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

async function movieCatalog(items, search, skip, userConfig = {}, genre = '', byYear = false) {
  const searched = applySearch(items, search);
  const page = applyPagination(byYear ? applyYear(searched, genre) : applyGenre(searched, genre), skip);
  return { metas: await mapWithLimitedConcurrency(page, (item) => toMoviePreview(item, userConfig)) };
}

async function seriesCatalog(items, search, skip, kind, userConfig = {}, genre = '', byYear = false) {
  const grouped = groupSeriesByTmdb(items, kind);
  const searched = applySearch(grouped, search);
  const page = applyPagination(byYear ? applyYear(searched, genre) : applyGenre(searched, genre), skip);
  return { metas: await mapWithLimitedConcurrency(page, (item) => toSeriesPreview(item, userConfig)) };
}

async function catalogHandler(args, userConfig = {}) {
  const library = await loadPasteLibrary();
  const search = args.extra && args.extra.search;
  const skip = args.extra && args.extra.skip;
  const genre = args.extra && args.extra.genre;
  const requestedId = String(args.id || '');
  const byYear = requestedId.endsWith('-by-year');
  const catalogId = byYear ? requestedId.slice(0, -'-by-year'.length) : requestedId;

  if (args.type === 'movie' && catalogId === 'kast-movies') {
    return movieCatalog(library.movies, search, skip, userConfig, genre, byYear);
  }

  if (args.type === 'movie' && catalogId === 'kast-cartoons') {
    return movieCatalog(library.cartoons, search, skip, userConfig, genre, byYear);
  }

  if (args.type === 'movie' && catalogId === 'kast-documentaries') {
    return movieCatalog(library.documentaries, search, skip, userConfig, genre, byYear);
  }

  if (args.type === 'movie' && catalogId === 'kast-spectacles') {
    return movieCatalog(library.spectacles, search, skip, userConfig, genre, byYear);
  }

  if (args.type === 'movie' && catalogId === 'kast-concerts') {
    return movieCatalog(library.concerts, search, skip, userConfig, genre, byYear);
  }

  if (args.type === 'series' && catalogId === 'kast-series') {
    return seriesCatalog(library.series, search, skip, 'series', userConfig, genre, byYear);
  }

  if (args.type === 'series' && catalogId === 'kast-cartoon-series') {
    return seriesCatalog(library.cartoonSeries, search, skip, 'cartoonSeries', userConfig, genre, byYear);
  }

  if (args.type === 'series' && catalogId === 'kast-documentary-series') {
    return seriesCatalog(library.documentarySeries, search, skip, 'documentarySeries', userConfig, genre, byYear);
  }

  return { metas: [] };
}

module.exports = { catalogHandler, groupSeriesByTmdb };
