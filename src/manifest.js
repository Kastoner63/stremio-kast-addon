const { genreOptions } = require('./genreMap');

function catalog(type, id, name) {
  return {
    type,
    id,
    name,
    extra: [
      { name: 'search', isRequired: false },
      { name: 'skip', isRequired: false },
      { name: 'genre', isRequired: false, options: genreOptions() },
    ],
  };
}

// Stremio présente les options de 'genre' dans Découvrir ; des catalogues
// Années distincts utilisent ce sélecteur avec des années, comme Cinemeta.
function yearOptions() {
  const lastYear = new Date().getUTCFullYear() + 1;
  return Array.from({ length: lastYear - 1899 }, (_, index) => String(lastYear - index));
}

function yearCatalog(type, id, name) {
  return {
    type,
    id: `${id}-by-year`,
    name: `${name} - Années`,
    extra: [
      { name: 'genre', isRequired: true, options: yearOptions() },
      { name: 'skip', isRequired: false },
    ],
  };
}

const baseManifest = {
  id: 'com.kasttech.private.paste.library.public.v1',
  name: 'Kast Alldebrid',
  version: '1.0.3',
  description: 'Addon Stremio configurable basé sur un master index Paste, TMDB et un resolver AllDebrid intégré.',
  logo: '/assets/logo-v2.png',
  background: '/assets/logo-v2.png',
  types: ['movie', 'series'],

  catalogs: [
    catalog('movie', 'kast-movies', 'Kast Movies'),
    catalog('movie', 'kast-cartoons', 'Kast Cartoons'),
    catalog('movie', 'kast-documentaries', 'Kast Documentaires'),
    catalog('movie', 'kast-spectacles', 'Kast Spectacles'),
    catalog('movie', 'kast-concerts', 'Kast Concerts'),
    catalog('series', 'kast-series', 'Kast Series'),
    catalog('series', 'kast-cartoon-series', 'Kast Cartoon Series'),
    catalog('series', 'kast-documentary-series', 'Kast Docu Series'),

    // Vues Années séparées : les 8 catalogues Genre restent inchangés.
    yearCatalog('movie', 'kast-movies', 'Kast Movies'),
    yearCatalog('movie', 'kast-cartoons', 'Kast Cartoons'),
    yearCatalog('movie', 'kast-documentaries', 'Kast Documentaires'),
    yearCatalog('movie', 'kast-spectacles', 'Kast Spectacles'),
    yearCatalog('movie', 'kast-concerts', 'Kast Concerts'),
    yearCatalog('series', 'kast-series', 'Kast Series'),
    yearCatalog('series', 'kast-cartoon-series', 'Kast Cartoon Series'),
    yearCatalog('series', 'kast-documentary-series', 'Kast Docu Series'),
  ],

  resources: [
    'catalog',
    {
      name: 'meta',
      types: ['movie', 'series'],
      idPrefixes: ['kast:'],
    },
    // Pas d'idPrefixes sur stream : Stremio peut ainsi appeler l'addon
    // depuis les fiches générales Cinemeta/Populaire avec des IDs IMDb
    // comme tt1234567 ou tt1234567:1:2.
    {
      name: 'stream',
      types: ['movie', 'series'],
    },
  ],

  // Les catalogues Kast gardent leurs IDs internes kast:..., mais la ressource
  // stream accepte aussi les IDs publics Stremio/Cinemeta.
  idPrefixes: ['kast:', 'tt'],

  // Stremio affiche le bouton engrenage/configuration quand configurable=true.
  behaviorHints: {
    configurable: true,
    configurationRequired: false,
  },

  // Stremio peut lire ces champs, mais la vraie page de configuration personnalisée
  // est servie par /configure.
  config: [
    { key: 'alldebridApiKey', type: 'password', title: 'Clé API AllDebrid', required: false },
    { key: 'tmdbAccessToken', type: 'password', title: 'TMDB Access Token v4', required: false },
    { key: 'tmdbApiKey', type: 'password', title: 'TMDB API Key v3', required: false },
    { key: 'remoteConfigUrl', type: 'text', title: 'URL de config distante', required: false },
  ],
};

function buildManifest({ baseUrl = '' } = {}) {
  const cleanBaseUrl = String(baseUrl || '').replace(/\/$/, '');
  const manifest = JSON.parse(JSON.stringify(baseManifest));

  if (cleanBaseUrl) {
    manifest.logo = `${cleanBaseUrl}/assets/logo-v2.png`;
    manifest.background = `${cleanBaseUrl}/assets/logo-v2.png`;
  }

  return manifest;
}

const manifest = buildManifest();

module.exports = { manifest, baseManifest, buildManifest };
