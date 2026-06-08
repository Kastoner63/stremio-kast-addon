const { config } = require('./config');
const { loadPasteLibrary } = require('./pasteService');
const { getMovieDetails, getSeriesDetails, buildImageUrl } = require('./tmdbService');

async function main() {
  if (!config.tmdb.enabled) {
    console.error('TMDB non configuré. Ajoute TMDB_ACCESS_TOKEN ou TMDB_API_KEY dans .env');
    process.exit(1);
  }

  const library = await loadPasteLibrary(true);
  const firstMovie = library.movies[0] || library.cartoons[0];
  const firstSeries = library.series[0];

  console.log('TMDB configuré:', {
    language: config.tmdb.language,
    posterSize: config.tmdb.imageSizePoster,
    backdropSize: config.tmdb.imageSizeBackdrop,
    auth: config.tmdb.accessToken ? 'access_token' : 'api_key',
  });

  if (firstMovie) {
    const movie = await getMovieDetails(firstMovie.tmdbId);
    console.log('\nTest film:');
    console.log({
      localTitle: firstMovie.title,
      tmdbId: firstMovie.tmdbId,
      tmdbTitle: movie && (movie.title || movie.original_title),
      poster: movie && buildImageUrl(movie.poster_path, config.tmdb.imageSizePoster),
      backdrop: movie && buildImageUrl(movie.backdrop_path, config.tmdb.imageSizeBackdrop),
    });
  }

  if (firstSeries) {
    const series = await getSeriesDetails(firstSeries.tmdbId);
    console.log('\nTest série:');
    console.log({
      localTitle: firstSeries.title,
      tmdbId: firstSeries.tmdbId,
      tmdbTitle: series && (series.name || series.original_name),
      poster: series && buildImageUrl(series.poster_path, config.tmdb.imageSizePoster),
      backdrop: series && buildImageUrl(series.backdrop_path, config.tmdb.imageSizeBackdrop),
    });
  }
}

main().catch((error) => {
  console.error('Erreur TMDB:', error.message);
  process.exit(1);
});
