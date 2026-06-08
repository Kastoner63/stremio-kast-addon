const { config } = require('./config');
const { loadPasteLibrary } = require('./pasteService');

function printSourceConfig() {
  console.log('Sources configurées:');
  console.log({
    localMovies: config.localFiles.moviesPath || null,
    localCartoons: config.localFiles.cartoonsPath || null,
    localSeries: config.localFiles.seriesPath || null,
    pasteMovies: config.paste.moviesUrl || null,
    pasteCartoons: config.paste.cartoonsUrl || null,
    pasteSeries: config.paste.seriesUrl || null,
  });
}

loadPasteLibrary(true)
  .then((library) => {
    console.log('Parser OK');
    printSourceConfig();
    console.log('Diagnostics:');
    console.log(library.diagnostics);
    console.log({
      loadedAt: library.loadedAt,
      movies: library.movies.length,
      cartoons: library.cartoons.length,
      seriesSeasons: library.series.length,
    });

    console.log('Premier film:', library.movies[0]);
    console.log('Premier cartoon:', library.cartoons[0]);
    console.log('Première saison:', library.series[0]);

    if (!library.movies.length && !library.cartoons.length && !library.series.length) {
      console.warn('\nAucune donnée parsée. Vérifie ton .env : URLs RAW Paste ou chemins LOCAL_* valides.');
    }
  })
  .catch((error) => {
    console.error('Erreur parser:', error.message);
    process.exit(1);
  });
