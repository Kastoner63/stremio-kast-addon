require('dotenv').config();
const { applyLocalConfigToRuntimeConfig } = require('./configStore');
const { clean, toBool, splitCsv } = require('./security');

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const addonToken = clean(process.env.ADDON_TOKEN);
const defaultAllowedRemoteHosts = [
  'paste.lesalkodiques.com',
  'firebaseapp.com',
  'web.app',
];

let config = {
  port: toInt(process.env.PORT, 7000),
  host: clean(process.env.HOST) || '127.0.0.1',
  cacheTtlMs: toInt(process.env.CACHE_TTL_SECONDS, 600) * 1000,
  addonToken,

  security: {
    publicMode: toBool(process.env.PUBLIC_MODE, false),
    adminToken: clean(process.env.ADMIN_TOKEN) || addonToken,
    resolverToken: clean(process.env.RESOLVER_TOKEN),
    userConfigSecret: clean(process.env.CONFIG_ENCRYPTION_SECRET),
    debugHealth: toBool(process.env.DEBUG_HEALTH, false),
    logSensitiveUrls: toBool(process.env.LOG_SENSITIVE_URLS, false),
    rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60) * 1000,
    rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 180),
    allowedRemoteHosts: splitCsv(process.env.ALLOWED_REMOTE_HOSTS).length
      ? splitCsv(process.env.ALLOWED_REMOTE_HOSTS)
      : defaultAllowedRemoteHosts,
    allowedMediaHosts: splitCsv(process.env.ALLOWED_MEDIA_HOSTS),
    maxRemoteBytes: toInt(process.env.MAX_REMOTE_BYTES, 25 * 1024 * 1024),
  },

  // Config distante : JSON public contenant l'URL de l'index master Paste.
  remoteConfig: {
    url: clean(process.env.REMOTE_CONFIG_URL),
    cacheTtlMs: toInt(process.env.REMOTE_CONFIG_TTL_SECONDS, 300) * 1000,
  },

  // Sources Paste. PASTE_MASTER_INDEX_URL reste un fallback local si REMOTE_CONFIG_URL est vide
  // ou si la config distante ne répond pas.
  paste: {
    masterIndexUrl: clean(process.env.PASTE_MASTER_INDEX_URL),
    moviesUrl: clean(process.env.PASTE_MOVIES_URL),
    cartoonsUrl: clean(process.env.PASTE_CARTOONS_URL),
    seriesUrl: clean(process.env.PASTE_SERIES_URL),
  },

  // Mode local : fichiers .txt sur le disque.
  localFiles: {
    masterIndexPath: clean(process.env.LOCAL_MASTER_INDEX_PATH),
    moviesPath: clean(process.env.LOCAL_MOVIES_PATH),
    cartoonsPath: clean(process.env.LOCAL_CARTOONS_PATH),
    seriesPath: clean(process.env.LOCAL_SERIES_PATH),
  },

  tmdb: {
    apiKey: clean(process.env.TMDB_API_KEY),
    accessToken: clean(process.env.TMDB_ACCESS_TOKEN),
    language: clean(process.env.TMDB_LANGUAGE) || 'fr-FR',
    imageSizePoster: clean(process.env.TMDB_POSTER_SIZE) || 'w500',
    imageSizeBackdrop: clean(process.env.TMDB_BACKDROP_SIZE) || 'w1280',
    enabled: Boolean(clean(process.env.TMDB_API_KEY) || clean(process.env.TMDB_ACCESS_TOKEN)),
  },

  alldebrid: {
    apiKey: clean(process.env.ALLDEBRID_API_KEY) || clean(process.env.ALLDEBRID_API_TOKEN),
    agent: clean(process.env.ALLDEBRID_AGENT) || 'KastStremioAddon',
  },

  customResolverBaseUrl: clean(process.env.CUSTOM_RESOLVER_BASE_URL),
  exposeUnresolvedStreams: clean(process.env.EXPOSE_UNRESOLVED_STREAMS) === 'true',
};

config = applyLocalConfigToRuntimeConfig(config);

if (config.security.publicMode && !config.security.userConfigSecret) {
  console.warn('[SECURITY] PUBLIC_MODE=true mais CONFIG_ENCRYPTION_SECRET est vide. Les URLs utilisateur ne pourront pas être générées.');
}

if (config.security.publicMode && !config.security.adminToken) {
  console.warn('[SECURITY] PUBLIC_MODE=true mais ADMIN_TOKEN est vide. /health admin restera accessible seulement en local.');
}

module.exports = { config };
