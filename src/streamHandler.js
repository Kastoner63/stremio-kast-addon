const { config } = require('./config');
const { loadPasteLibrary } = require('./pasteService');
const { parseId } = require('./idHelpers');
const { resolvePrivateLinkId } = require('./streamResolver');
const { findTmdbByImdbId } = require('./tmdbService');

function buildNoResolverStream(title, description) {
  if (!config.exposeUnresolvedStreams) return null;

  return {
    title,
    name: 'Kast Alldebrid',
    description: `${description}\nResolver non configuré. Ajoute CUSTOM_RESOLVER_BASE_URL dans .env.`,
    url: 'https://www.stremio.com/',
  };
}

async function streamsForLink(linkId, context, userConfig = {}) {
  const resolvedStreams = await resolvePrivateLinkId(linkId, context, userConfig);

  if (resolvedStreams.length > 0) {
    return resolvedStreams;
  }

  const fallback = buildNoResolverStream(context.title, context.description || context.title);
  return fallback ? [fallback] : [];
}

async function streamsForMovieLike(movie, mediaType, userConfig = {}) {
  if (!movie) return { streams: [] };

  const nestedStreams = await Promise.all(
    movie.linkIds.map((linkId, index) => {
      const quality = movie.qualities[index] || `Version ${index + 1}`;
      return streamsForLink(linkId, {
        type: mediaType,
        tmdbId: movie.tmdbId,
        localTitle: movie.title,
        quality,
        title: quality,
        name: 'Kast Alldebrid',
        description: `${movie.title} - ${quality}`,
      }, userConfig);
    })
  );

  return { streams: nestedStreams.flat() };
}

async function streamsForSeriesEpisode(season, parsed, mediaType, userConfig = {}) {
  const linkId = season && season.episodes[parsed.episode];
  if (!season || !linkId) return { streams: [] };

  const label = `S${parsed.season}E${parsed.episode} - ${season.quality}`;
  return {
    streams: await streamsForLink(linkId, {
      type: mediaType,
      tmdbId: season.tmdbId,
      season: parsed.season,
      episode: parsed.episode,
      localTitle: season.title,
      quality: season.quality,
      title: label,
      name: 'Kast Alldebrid',
      description: `${season.title} - ${label}`,
    }, userConfig),
  };
}


function findMovieLikeByTmdbId(library, tmdbId) {
  const id = String(tmdbId || '');
  if (!id) return [];

  return [
    { item: library.movies.find((movie) => movie.tmdbId === id), mediaType: 'movie' },
    { item: library.cartoons.find((movie) => movie.tmdbId === id), mediaType: 'cartoon' },
    { item: library.documentaries.find((movie) => movie.tmdbId === id), mediaType: 'documentary' },
    { item: library.spectacles.find((movie) => movie.tmdbId === id), mediaType: 'spectacle' },
    { item: library.concerts.find((movie) => movie.tmdbId === id), mediaType: 'concert' },
  ].filter((entry) => entry.item);
}

function findSeriesSeasonsByTmdbId(library, tmdbId, seasonNumber) {
  const id = String(tmdbId || '');
  if (!id) return [];

  const seasonFilter = (season) => season.tmdbId === id && season.season === seasonNumber;
  return [
    { item: library.series.find(seasonFilter), mediaType: 'series' },
    { item: library.cartoonSeries.find(seasonFilter), mediaType: 'cartoon-series' },
    { item: library.documentarySeries.find(seasonFilter), mediaType: 'documentary-series' },
  ].filter((entry) => entry.item);
}

function parsePublicStremioId(id) {
  const value = String(id || '').replace(/\.json$/i, '').trim();

  // IDs classiques Cinemeta/Stremio : tt1234567 ou tt1234567:1:2
  const imdbMatch = value.match(/^(tt\d+)(?::(\d+):(?:(\d+)))?$/i);
  if (imdbMatch) {
    return {
      source: 'imdb',
      imdbId: imdbMatch[1],
      season: imdbMatch[2] ? Number.parseInt(imdbMatch[2], 10) : undefined,
      episode: imdbMatch[3] ? Number.parseInt(imdbMatch[3], 10) : undefined,
    };
  }

  // Support additionnel : tmdb:movie:12345, tmdb:series:12345, tmdb:tv:12345:1:2
  const tmdbMatch = value.match(/^tmdb:(movie|series|tv):(\d+)(?::(\d+):(?:(\d+)))?$/i);
  if (tmdbMatch) {
    return {
      source: 'tmdb',
      tmdbId: tmdbMatch[2],
      mediaHint: tmdbMatch[1].toLowerCase() === 'movie' ? 'movie' : 'series',
      season: tmdbMatch[3] ? Number.parseInt(tmdbMatch[3], 10) : undefined,
      episode: tmdbMatch[4] ? Number.parseInt(tmdbMatch[4], 10) : undefined,
    };
  }

  return null;
}

async function streamsForPublicMovieId(library, publicId, userConfig = {}) {
  const parsed = parsePublicStremioId(publicId);
  if (!parsed) return { streams: [] };

  let tmdbId = parsed.tmdbId;
  if (!tmdbId && parsed.source === 'imdb') {
    tmdbId = await findTmdbByImdbId(parsed.imdbId, 'movie', userConfig);
  }

  if (!tmdbId) return { streams: [] };

  const matches = findMovieLikeByTmdbId(library, tmdbId);
  const nestedStreams = await Promise.all(
    matches.map((entry) => streamsForMovieLike(entry.item, entry.mediaType, userConfig))
  );

  return { streams: nestedStreams.flatMap((result) => result.streams || []) };
}

async function streamsForPublicSeriesEpisodeId(library, publicId, userConfig = {}) {
  const parsed = parsePublicStremioId(publicId);
  if (!parsed || !parsed.season || !parsed.episode) return { streams: [] };

  let tmdbId = parsed.tmdbId;
  if (!tmdbId && parsed.source === 'imdb') {
    tmdbId = await findTmdbByImdbId(parsed.imdbId, 'series', userConfig);
  }

  if (!tmdbId) return { streams: [] };

  const matches = findSeriesSeasonsByTmdbId(library, tmdbId, parsed.season);
  const nestedStreams = await Promise.all(
    matches.map((entry) => streamsForSeriesEpisode(entry.item, parsed, entry.mediaType, userConfig))
  );

  return { streams: nestedStreams.flatMap((result) => result.streams || []) };
}

async function streamHandler(args, userConfig = {}) {
  const library = await loadPasteLibrary();
  const parsed = parseId(args.id);

  if (args.type === 'movie' && parsed.namespace === 'kast' && parsed.entity === 'movie') {
    const movie = library.movies.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'movie', userConfig);
  }

  if (args.type === 'movie' && parsed.namespace === 'kast' && parsed.entity === 'cartoon') {
    const movie = library.cartoons.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'cartoon', userConfig);
  }

  if (args.type === 'movie' && parsed.namespace === 'kast' && parsed.entity === 'documentary') {
    const movie = library.documentaries.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'documentary', userConfig);
  }

  if (args.type === 'movie' && parsed.namespace === 'kast' && parsed.entity === 'spectacle') {
    const movie = library.spectacles.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'spectacle', userConfig);
  }

  if (args.type === 'movie' && parsed.namespace === 'kast' && parsed.entity === 'concert') {
    const movie = library.concerts.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'concert', userConfig);
  }

  if (args.type === 'series' && parsed.namespace === 'kast' && parsed.entity === 'episode') {
    const season = library.series.find(
      (item) => item.tmdbId === parsed.tmdbId && item.season === parsed.season
    );
    return streamsForSeriesEpisode(season, parsed, 'series', userConfig);
  }

  if (args.type === 'series' && parsed.namespace === 'kast' && parsed.entity === 'cartoonepisode') {
    const season = library.cartoonSeries.find(
      (item) => item.tmdbId === parsed.tmdbId && item.season === parsed.season
    );
    return streamsForSeriesEpisode(season, parsed, 'cartoon-series', userConfig);
  }

  if (args.type === 'series' && parsed.namespace === 'kast' && parsed.entity === 'documentaryepisode') {
    const season = library.documentarySeries.find(
      (item) => item.tmdbId === parsed.tmdbId && item.season === parsed.season
    );
    return streamsForSeriesEpisode(season, parsed, 'documentary-series', userConfig);
  }

  // Compatibilité avec les fiches générales Stremio/Cinemeta/Populaire.
  // Exemple film : tt1234567
  // Exemple épisode : tt1234567:1:2
  if (args.type === 'movie') {
    return streamsForPublicMovieId(library, args.id, userConfig);
  }

  if (args.type === 'series') {
    return streamsForPublicSeriesEpisodeId(library, args.id, userConfig);
  }

  return { streams: [] };
}


module.exports = { streamHandler };
