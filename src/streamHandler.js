const { config } = require('./config');
const { loadPasteLibrary } = require('./pasteService');
const { parseId } = require('./idHelpers');
const { resolvePrivateLinkId } = require('./streamResolver');

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

async function streamHandler(args, userConfig = {}) {
  const library = await loadPasteLibrary();
  const parsed = parseId(args.id);

  if (args.type === 'movie' && parsed.entity === 'movie') {
    const movie = library.movies.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'movie', userConfig);
  }

  if (args.type === 'movie' && parsed.entity === 'cartoon') {
    const movie = library.cartoons.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'cartoon', userConfig);
  }

  if (args.type === 'movie' && parsed.entity === 'documentary') {
    const movie = library.documentaries.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'documentary', userConfig);
  }

  if (args.type === 'movie' && parsed.entity === 'spectacle') {
    const movie = library.spectacles.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'spectacle', userConfig);
  }

  if (args.type === 'movie' && parsed.entity === 'concert') {
    const movie = library.concerts.find((item) => item.tmdbId === parsed.tmdbId);
    return streamsForMovieLike(movie, 'concert', userConfig);
  }

  if (args.type === 'series' && parsed.entity === 'episode') {
    const season = library.series.find(
      (item) => item.tmdbId === parsed.tmdbId && item.season === parsed.season
    );
    return streamsForSeriesEpisode(season, parsed, 'series', userConfig);
  }

  if (args.type === 'series' && parsed.entity === 'cartoonepisode') {
    const season = library.cartoonSeries.find(
      (item) => item.tmdbId === parsed.tmdbId && item.season === parsed.season
    );
    return streamsForSeriesEpisode(season, parsed, 'cartoon-series', userConfig);
  }

  if (args.type === 'series' && parsed.entity === 'documentaryepisode') {
    const season = library.documentarySeries.find(
      (item) => item.tmdbId === parsed.tmdbId && item.season === parsed.season
    );
    return streamsForSeriesEpisode(season, parsed, 'documentary-series', userConfig);
  }

  return { streams: [] };
}

module.exports = { streamHandler };
