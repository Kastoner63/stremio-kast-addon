const fs = require('fs');
const path = require('path');
const { clean: securityClean } = require('./security');

const CONFIG_FILE = path.join(__dirname, '..', 'config.local.json');

function clean(value) {
  return securityClean(value);
}

function readLocalConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[ConfigStore] Impossible de lire config.local.json:', error.message);
    return {};
  }
}

function writeLocalConfig(nextConfig) {
  const current = readLocalConfig();
  const merged = {
    ...current,
    ...nextConfig,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function deleteLocalConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

function maskSecret(value) {
  const text = clean(value);
  if (!text) return '';
  if (text.length <= 8) return '••••••••';
  return `${text.slice(0, 4)}••••••••${text.slice(-4)}`;
}

function applyLocalConfigToRuntimeConfig(runtimeConfig, localConfig = readLocalConfig()) {
  if (!runtimeConfig || !localConfig) return runtimeConfig;

  if (clean(localConfig.remoteConfigUrl)) {
    runtimeConfig.remoteConfig.url = clean(localConfig.remoteConfigUrl);
  }
  if (clean(localConfig.pasteMasterIndexUrl)) {
    runtimeConfig.paste.masterIndexUrl = clean(localConfig.pasteMasterIndexUrl);
  }

  if (clean(localConfig.tmdbAccessToken)) {
    runtimeConfig.tmdb.accessToken = clean(localConfig.tmdbAccessToken);
  }
  if (clean(localConfig.tmdbApiKey)) {
    runtimeConfig.tmdb.apiKey = clean(localConfig.tmdbApiKey);
  }
  if (clean(localConfig.tmdbLanguage)) {
    runtimeConfig.tmdb.language = clean(localConfig.tmdbLanguage);
  }
  if (clean(localConfig.tmdbPosterSize)) {
    runtimeConfig.tmdb.imageSizePoster = clean(localConfig.tmdbPosterSize);
  }
  if (clean(localConfig.tmdbBackdropSize)) {
    runtimeConfig.tmdb.imageSizeBackdrop = clean(localConfig.tmdbBackdropSize);
  }

  runtimeConfig.tmdb.enabled = Boolean(runtimeConfig.tmdb.accessToken || runtimeConfig.tmdb.apiKey);

  if (clean(localConfig.alldebridApiKey)) {
    runtimeConfig.alldebrid.apiKey = clean(localConfig.alldebridApiKey);
  }
  if (clean(localConfig.alldebridAgent)) {
    runtimeConfig.alldebrid.agent = clean(localConfig.alldebridAgent);
  }
  if (clean(localConfig.customResolverBaseUrl)) {
    runtimeConfig.customResolverBaseUrl = clean(localConfig.customResolverBaseUrl);
  }
  if (clean(localConfig.resolverToken)) {
    runtimeConfig.security.resolverToken = clean(localConfig.resolverToken);
  }
  if (clean(localConfig.allowedRemoteHosts)) {
    runtimeConfig.security.allowedRemoteHosts = clean(localConfig.allowedRemoteHosts)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  return runtimeConfig;
}

function getEffectiveSecret(key, envNames = []) {
  const local = readLocalConfig();
  if (clean(local[key])) return clean(local[key]);

  for (const envName of envNames) {
    if (clean(process.env[envName])) return clean(process.env[envName]);
  }

  return '';
}

module.exports = {
  CONFIG_FILE,
  readLocalConfig,
  writeLocalConfig,
  deleteLocalConfig,
  maskSecret,
  applyLocalConfigToRuntimeConfig,
  getEffectiveSecret,
};
