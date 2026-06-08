function catalog(type, id, name) {
  return {
    type,
    id,
    name,
    extra: [
      { name: 'search', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
  };
}

const baseManifest = {
  id: 'com.kasttech.private.paste.library.public.v1',
  name: 'Kast Alldebrid',
  version: '1.0.2',
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
  ],

  resources: [
    'catalog',
    {
      name: 'meta',
      types: ['movie', 'series'],
      idPrefixes: ['kast:'],
    },
    {
      name: 'stream',
      types: ['movie', 'series'],
      idPrefixes: ['kast:'],
    },
  ],

  idPrefixes: ['kast:'],

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
