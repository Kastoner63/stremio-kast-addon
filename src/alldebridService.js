const { config } = require('./config');
const { clean, maskUrl, maskSecret } = require('./security');

const AD_BASE = 'https://api.alldebrid.com/v4';

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)}${units[unitIndex]}`;
}

function buildAlldebridFileUrl(fileId) {
  return `https://alldebrid.com/f/${encodeURIComponent(fileId)}`;
}

function getAlldebridCredentials(userConfig = {}) {
  return {
    apiKey: clean(userConfig.alldebridApiKey) || clean(config.alldebrid?.apiKey),
    agent: clean(userConfig.alldebridAgent) || clean(config.alldebrid?.agent) || 'KastStremioAddon',
  };
}

function logUrl(label, value) {
  console.log(label, config.security?.logSensitiveUrls ? value : maskUrl(value));
}

async function unlockAlldebridLink(rawUrl, userConfig = {}) {
  const { apiKey, agent } = getAlldebridCredentials(userConfig);

  if (!apiKey) {
    throw new Error('Clé API AllDebrid non configurée. Génère une URL d’installation depuis /configure.');
  }

  const unlockUrl = `${AD_BASE}/link/unlock?agent=${encodeURIComponent(agent)}&apikey=${encodeURIComponent(apiKey)}&link=${encodeURIComponent(rawUrl)}`;

  logUrl('[AllDebrid] Unlock →', rawUrl);

  const unlockRes = await fetch(unlockUrl, {
    headers: { 'User-Agent': 'KastPrivateStremioAddon/1.0' },
  });

  if (!unlockRes.ok) {
    throw new Error(`AllDebrid unlock HTTP ${unlockRes.status}`);
  }

  const unlockJson = await unlockRes.json();

  if (unlockJson?.status !== 'success') {
    const errorCode = unlockJson?.error?.code || 'unknown';
    const errorMsg = unlockJson?.error?.message || JSON.stringify(unlockJson?.error || unlockJson);
    throw new Error(`AllDebrid unlock error [${errorCode}]: ${errorMsg}`);
  }

  const data = unlockJson.data;

  if (isHttpUrl(data?.link)) {
    logUrl('[AllDebrid] Lien direct obtenu:', data.link);
    return {
      url: data.link,
      filename: data.filename || '',
      filesize: data.filesize || data.size || 0,
      size: formatBytes(data.filesize || data.size || 0),
    };
  }

  if (data?.id) {
    return streamingFallback(data.id, data.filename || '', userConfig);
  }

  throw new Error('AllDebrid unlock: aucun lien exploitable dans la réponse');
}

async function streamingFallback(linkId, filename, userConfig = {}) {
  const { apiKey, agent } = getAlldebridCredentials(userConfig);
  if (!apiKey) throw new Error('Clé API AllDebrid non configurée.');

  const streamUrl = `${AD_BASE}/link/streaming?agent=${encodeURIComponent(agent)}&apikey=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(linkId)}`;

  console.log('[AllDebrid] Streaming fallback pour id:', maskSecret(linkId));

  const streamRes = await fetch(streamUrl, {
    headers: { 'User-Agent': 'KastPrivateStremioAddon/1.0' },
  });

  if (!streamRes.ok) {
    throw new Error(`AllDebrid streaming HTTP ${streamRes.status}`);
  }

  const streamJson = await streamRes.json();

  if (streamJson?.status !== 'success') {
    throw new Error(`AllDebrid streaming error: ${JSON.stringify(streamJson?.error)}`);
  }

  const streams = streamJson?.data?.streams || [];
  const original = streams.find((s) => s.id === 'original');
  const hls = streams.find((s) => s.ext === 'm3u8' || s.id?.includes('hls'));
  const best = original || hls || streams[0];

  if (!best || !isHttpUrl(best.link)) {
    throw new Error('AllDebrid streaming: aucun flux exploitable');
  }

  logUrl('[AllDebrid] Flux streaming choisi:', best.link);
  return {
    url: best.link,
    filename: best.filename || filename || '',
    filesize: best.filesize || best.size || 0,
    size: formatBytes(best.filesize || best.size || 0),
  };
}

async function resolveAlldebridFileId(fileId, userConfig = {}) {
  const linkToUnlock = isHttpUrl(fileId) ? fileId : buildAlldebridFileUrl(fileId);
  return unlockAlldebridLink(linkToUnlock, userConfig);
}

module.exports = {
  resolveAlldebridFileId,
  unlockAlldebridLink,
  buildAlldebridFileUrl,
  formatBytes,
};
