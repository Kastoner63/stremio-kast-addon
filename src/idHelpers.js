function movieId(tmdbId) {
  return `kast:movie:${tmdbId}`;
}

function cartoonId(tmdbId) {
  return `kast:cartoon:${tmdbId}`;
}

function documentaryId(tmdbId) {
  return `kast:documentary:${tmdbId}`;
}

function spectacleId(tmdbId) {
  return `kast:spectacle:${tmdbId}`;
}

function concertId(tmdbId) {
  return `kast:concert:${tmdbId}`;
}

function seriesId(tmdbId) {
  return `kast:series:${tmdbId}`;
}

function cartoonSeriesId(tmdbId) {
  return `kast:cartoonseries:${tmdbId}`;
}

function documentarySeriesId(tmdbId) {
  return `kast:documentaryseries:${tmdbId}`;
}

function episodeId(tmdbId, season, episode) {
  return `kast:episode:${tmdbId}:${season}:${episode}`;
}

function cartoonEpisodeId(tmdbId, season, episode) {
  return `kast:cartoonepisode:${tmdbId}:${season}:${episode}`;
}

function documentaryEpisodeId(tmdbId, season, episode) {
  return `kast:documentaryepisode:${tmdbId}:${season}:${episode}`;
}

function parseId(id) {
  const parts = String(id || '').split(':');
  return {
    namespace: parts[0],
    entity: parts[1],
    tmdbId: parts[2],
    season: parts[3] ? Number.parseInt(parts[3], 10) : undefined,
    episode: parts[4] ? Number.parseInt(parts[4], 10) : undefined,
  };
}

module.exports = {
  movieId,
  cartoonId,
  documentaryId,
  spectacleId,
  concertId,
  seriesId,
  cartoonSeriesId,
  documentarySeriesId,
  episodeId,
  cartoonEpisodeId,
  documentaryEpisodeId,
  parseId,
};
