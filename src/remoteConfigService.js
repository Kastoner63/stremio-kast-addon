const { config } = require('./config');
const { assertAllowedFetchUrl, maskUrl } = require('./security');

let cachedRemoteConfig = null;
let cachedAt = 0;
let lastStatus = {
  enabled: false,
  source: '',
  error: '',
  pasteMasterIndexUrl: '',
  loadedAt: '',
};

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRemoteConfig(raw) {
  if (!raw || typeof raw !== 'object') return {};

  return {
    pasteMasterIndexUrl: clean(raw.pasteMasterIndexUrl || raw.masterIndexUrl || raw.paste_master_index_url),
  };
}

async function fetchRemoteConfig(remoteConfigUrl) {
  const parsed = assertAllowedFetchUrl(
    remoteConfigUrl,
    config.security.allowedRemoteHosts,
    'REMOTE_CONFIG_URL'
  );

  const response = await fetch(parsed.href, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'User-Agent': 'KastPrivateStremioAddon/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  if (text.length > config.security.maxRemoteBytes) {
    throw new Error(`remote config trop volumineuse (${text.length} octets)`);
  }

  return JSON.parse(text);
}

async function loadRemoteConfig(url = config.remoteConfig?.url, cacheTtlMs = config.remoteConfig?.cacheTtlMs) {
  const remoteConfigUrl = clean(url);

  if (!remoteConfigUrl) {
    lastStatus = {
      enabled: false,
      source: '',
      error: '',
      pasteMasterIndexUrl: '',
      loadedAt: '',
    };
    return { enabled: false, source: '', error: '', data: {} };
  }

  const now = Date.now();
  const ttlMs = Number.isFinite(cacheTtlMs) && cacheTtlMs > 0 ? cacheTtlMs : 300000;

  if (cachedRemoteConfig && now - cachedAt < ttlMs) {
    return cachedRemoteConfig;
  }

  try {
    console.log('[REMOTE CONFIG] Chargement:', maskUrl(remoteConfigUrl));

    const raw = await fetchRemoteConfig(remoteConfigUrl);
    const data = normalizeRemoteConfig(raw);

    // L'URL de master index est elle aussi validée par l'allowlist pour éviter les fetch arbitraires.
    if (data.pasteMasterIndexUrl) {
      assertAllowedFetchUrl(
        data.pasteMasterIndexUrl,
        config.security.allowedRemoteHosts,
        'pasteMasterIndexUrl'
      );
    }

    const result = {
      enabled: true,
      source: remoteConfigUrl,
      error: '',
      data,
    };

    cachedRemoteConfig = result;
    cachedAt = now;

    lastStatus = {
      enabled: true,
      source: remoteConfigUrl,
      error: '',
      pasteMasterIndexUrl: data.pasteMasterIndexUrl || '',
      loadedAt: new Date().toISOString(),
    };

    console.log('[REMOTE CONFIG] OK:', {
      ...lastStatus,
      source: maskUrl(lastStatus.source),
      pasteMasterIndexUrl: maskUrl(lastStatus.pasteMasterIndexUrl),
    });

    return result;
  } catch (error) {
    console.warn('[REMOTE CONFIG] Erreur:', error.message);

    lastStatus = {
      enabled: true,
      source: remoteConfigUrl,
      error: error.message,
      pasteMasterIndexUrl: '',
      loadedAt: new Date().toISOString(),
    };

    const result = { enabled: true, source: remoteConfigUrl, error: error.message, data: {} };
    cachedRemoteConfig = result;
    cachedAt = now;
    return result;
  }
}

async function getRemoteConfig() {
  const result = await loadRemoteConfig();
  return result.data || {};
}

function getRemoteConfigStatus() {
  return lastStatus;
}

function clearRemoteConfigCache() {
  cachedRemoteConfig = null;
  cachedAt = 0;
}

module.exports = {
  loadRemoteConfig,
  getRemoteConfig,
  getRemoteConfigStatus,
  clearRemoteConfigCache,
};
