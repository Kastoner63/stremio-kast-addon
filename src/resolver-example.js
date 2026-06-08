require('dotenv').config();
const express = require('express');
const { readLocalConfig } = require('./configStore');
const {
  clean,
  maskUrl,
  maskSecret,
  safeTokenCompare,
  createRateLimiter,
  addSecurityHeaders,
} = require('./security');

const app = express();
const PORT = Number.parseInt(process.env.RESOLVER_PORT || '8787', 10);
const HOST = clean(process.env.RESOLVER_HOST) || '127.0.0.1';
const RESOLVER_TOKEN = clean(process.env.RESOLVER_TOKEN);
const LOG_SENSITIVE_URLS = clean(process.env.LOG_SENSITIVE_URLS).toLowerCase() === 'true';

const AD_BASE = 'https://api.alldebrid.com/v4';

app.use(addSecurityHeaders);
app.use(createRateLimiter({ windowMs: 60_000, max: 120 }));

function getAlldebridApiKey() {
  const local = readLocalConfig();
  return clean(
    local.alldebridApiKey ||
    process.env.ALLDEBRID_API_KEY ||
    process.env.ALLDEBRID_API_TOKEN ||
    ''
  );
}

function getAlldebridAgent() {
  const local = readLocalConfig();
  return clean(local.alldebridAgent || process.env.ALLDEBRID_AGENT || 'KastStremioAddon');
}

function getResolverToken() {
  const local = readLocalConfig();
  return clean(local.resolverToken || RESOLVER_TOKEN || '');
}

function requireResolverToken(req, res, next) {
  const expected = getResolverToken();
  if (!expected) return next();

  const provided = clean(req.headers['x-resolver-token'] || req.query.token || '');
  if (safeTokenCompare(provided, expected)) return next();

  return res.status(401).json({ streams: [], error: 'Resolver token invalide' });
}

app.use(requireResolverToken);

function buildAlldebridFileUrl(fileId) {
  return `https://alldebrid.com/f/${encodeURIComponent(fileId)}`;
}

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

function logUrl(label, url) {
  console.log(label, LOG_SENSITIVE_URLS ? url : maskUrl(url));
}

async function unlockAlldebridLink(rawUrl) {
  const ALLDEBRID_API_KEY = getAlldebridApiKey();
  const ALLDEBRID_AGENT = getAlldebridAgent();

  if (!ALLDEBRID_API_KEY) {
    throw new Error('Clé API AllDebrid non configurée. Ajoute-la dans /configure ou dans .env.');
  }

  const unlockUrl = `${AD_BASE}/link/unlock?agent=${encodeURIComponent(ALLDEBRID_AGENT)}&apikey=${encodeURIComponent(ALLDEBRID_API_KEY)}&link=${encodeURIComponent(rawUrl)}`;

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
    return streamingFallback(data.id, data.filename || '');
  }

  throw new Error('AllDebrid unlock: aucun lien exploitable dans la réponse');
}

async function streamingFallback(linkId, filename) {
  const ALLDEBRID_API_KEY = getAlldebridApiKey();
  const ALLDEBRID_AGENT = getAlldebridAgent();

  const streamUrl = `${AD_BASE}/link/streaming?agent=${encodeURIComponent(ALLDEBRID_AGENT)}&apikey=${encodeURIComponent(ALLDEBRID_API_KEY)}&id=${encodeURIComponent(linkId)}`;

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

async function resolvePrivateLink({ id }) {
  const linkToUnlock = isHttpUrl(id) ? id : buildAlldebridFileUrl(id);
  return unlockAlldebridLink(linkToUnlock);
}

app.get('/resolve', async (req, res) => {
  const { id, quality } = req.query;
  if (!id) return res.status(400).json({ streams: [], error: 'Paramètre id manquant' });

  try {
    const resolved = await resolvePrivateLink({ id: String(id) });
    const response = {
      streams: [
        {
          name: 'Kast Alldebrid',
          title: quality ? String(quality) : 'Source privée',
          url: resolved.url,
          filename: resolved.filename || '',
          size: resolved.size || formatBytes(resolved.filesize || 0),
        },
      ],
    };

    console.log('[RESOLVE OK]', {
      id: maskSecret(String(id)),
      url: LOG_SENSITIVE_URLS ? resolved.url : maskUrl(resolved.url),
      filename: resolved.filename,
      size: response.streams[0].size,
    });

    return res.json(response);
  } catch (error) {
    console.error('[RESOLVE ERROR]', { id: maskSecret(String(id)), message: error.message });
    return res.status(200).json({ streams: [], error: error.message });
  }
});

app.get('/test', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id manquant' });

  try {
    const linkToUnlock = isHttpUrl(id) ? id : buildAlldebridFileUrl(id);
    const result = await unlockAlldebridLink(linkToUnlock);
    res.json({
      ok: true,
      url: LOG_SENSITIVE_URLS ? result.url : maskUrl(result.url),
      filename: result.filename,
      size: result.size || formatBytes(result.filesize || 0),
      filesize: result.filesize || 0,
    });
  } catch (error) {
    res.status(200).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Resolver AllDebrid lancé : http://${HOST}:${PORT}/resolve?id=<alldebrid_file_id>`);
  if (getResolverToken()) console.log('[SECURITY] Resolver protégé par RESOLVER_TOKEN.');
  if (!getAlldebridApiKey()) {
    console.warn('[WARN] Clé API AllDebrid non définie — va sur /configure ou ajoute ALLDEBRID_API_KEY dans .env.');
  }
});
