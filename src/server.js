const express = require('express');
const path = require('path');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const { config } = require('./config');
const { manifest, buildManifest } = require('./manifest');
const { catalogHandler } = require('./catalogHandler');
const { metaHandler } = require('./metaHandler');
const { streamHandler } = require('./streamHandler');
const { loadPasteLibrary } = require('./pasteService');
const { getRemoteConfigStatus } = require('./remoteConfigService');
const { readLocalConfig, maskSecret } = require('./configStore');
const {
  maskUrl,
  safeLogStream,
  requireAdminAccess,
  addSecurityHeaders,
  createRateLimiter,
} = require('./security');
const {
  TOKEN_PREFIX,
  encodeUserConfig,
  getUserConfigFromRequest,
  decodeUserConfigSegment,
  maskUserConfig,
} = require('./userConfig');

// SDK conservé pour les routes classiques sans configuration utilisateur.
const builder = new addonBuilder(manifest);
builder.defineCatalogHandler(catalogHandler);
builder.defineMetaHandler(metaHandler);
builder.defineStreamHandler(streamHandler);
const addonInterface = builder.getInterface();

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
const adminAccess = requireAdminAccess(config);

// CORS global obligatoire pour Stremio Web/Desktop.
// Sans ça, Stremio peut appeler l’URL mais bloquer la réponse avec "Failed to fetch".
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.use('/assets', express.static(publicDir, {
  maxAge: config.security.publicMode ? '7d' : 0,
  immutable: config.security.publicMode,
  etag: true,
  lastModified: true,
}));
app.get('/favicon.ico', (req, res) => res.redirect('/assets/icon-v2.png'));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.json({ limit: '32kb' }));
app.use(addSecurityHeaders);
app.use(createRateLimiter({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
}));

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl.split('?')[0]}`);
  next();
});

function htmlEscape(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function requestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `${config.host}:${config.port}`;
  return `${proto}://${host}`;
}

function addonBasePath() {
  return config.addonToken ? `/${config.addonToken}` : '';
}

function manifestUrl(req) {
  return `${requestOrigin(req)}${addonBasePath()}/manifest.json`;
}

function userManifestUrl(req, token) {
  // Route plus fiable pour Stremio : on évite de mettre le très long cfg_... directement à la racine.
  // Ancien format : /cfg_xxx/manifest.json
  // Nouveau format : /u/cfg_xxx/manifest.json
  return `${requestOrigin(req)}/u/${encodeURIComponent(token)}/manifest.json`;
}

function manifestResponse(req) {
  return buildManifest({ baseUrl: requestOrigin(req) });
}

function parseExtra(extraString) {
  const extra = {};
  const text = String(extraString || '').replace(/\.json$/i, '');
  if (!text) return extra;

  for (const part of text.split('&')) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = decodeURIComponent(rawKey || '').trim();
    const value = decodeURIComponent(rawValue.join('=') || '').trim();
    if (key) extra[key] = value;
  }

  return extra;
}

function getSafeUserConfig(req) {
  // Supporte deux formats :
  // - /cfg_xxx/...        ancien format
  // - /u/cfg_xxx/...      nouveau format recommandé, plus fiable avec Stremio
  const configToken =
    req.params?.configToken ||
    (req.params?.payload ? `${TOKEN_PREFIX}${req.params.payload}` : '');

  if (configToken) {
    try {
      const userConfig = decodeUserConfigSegment(configToken);
      if (userConfig && Object.keys(userConfig).length) {
        return userConfig;
      }
    } catch (error) {
      console.warn('[USER CONFIG] Configuration invalide:', error.message);
      return {};
    }
  }

  const userConfig = getUserConfigFromRequest(req);
  if (!userConfig || !Object.keys(userConfig).length) {
    return {};
  }
  return userConfig;
}

// ─────────────────────────────────────────────
// Manifest classique sans configuration utilisateur
// ─────────────────────────────────────────────
if (config.addonToken) {
  app.get(`/${config.addonToken}/manifest.json`, (req, res) => res.json(manifestResponse(req)));
} else {
  app.get('/manifest.json', (req, res) => res.json(manifestResponse(req)));
}

function configuredManifestHandler(req, res) {
  const userConfig = getSafeUserConfig(req);
  if (!Object.keys(userConfig).length) {
    return res.status(400).json({ error: 'Configuration utilisateur invalide ou expirée.' });
  }
  return res.json(manifestResponse(req));
}

// Manifest personnel recommandé : /u/cfg_xxx/manifest.json
app.get('/u/:configToken/manifest.json', (req, res) => {
  const userConfig = getSafeUserConfig(req);

  if (!Object.keys(userConfig).length) {
    return res.status(400).json({
      error: 'Configuration utilisateur invalide ou expirée.',
    });
  }

  return res.json(manifestResponse(req));
});

app.get('/u/:configToken/catalog/:type/:id.json', directCatalogRoute);
app.get('/u/:configToken/catalog/:type/:id/:extra.json', directCatalogRoute);
app.get('/u/:configToken/meta/:type/:id.json', directMetaRoute);
app.get('/u/:configToken/stream/:type/:id.json', directStreamRoute);

// Ancien format conservé pour compatibilité : /cfg_xxx/manifest.json
app.get(`/${TOKEN_PREFIX}:payload/manifest.json`, configuredManifestHandler);

app.get('/', (req, res) => {
  res.type('html').send(`
    <h1>Kast Alldebrid</h1>
    <p>Addon Stremio actif.</p>
    <p>Manifest public : <a href="${htmlEscape(manifestUrl(req))}">${htmlEscape(manifestUrl(req))}</a></p>
    <p>Configuration utilisateur : <a href="/configure">/configure</a></p>
  `);
});

app.get('/health', adminAccess, async (req, res) => {
  try {
    const library = await loadPasteLibrary();
    const remoteConfig = getRemoteConfigStatus();

    const base = {
      ok: true,
      loadedAt: library.loadedAt,
      movies: library.movies.length,
      cartoons: library.cartoons.length,
      seriesSeasons: library.series.length,
      cartoonSeriesSeasons: library.cartoonSeries?.length || 0,
      documentaries: library.documentaries?.length || 0,
      documentarySeriesSeasons: library.documentarySeries?.length || 0,
      spectacles: library.spectacles?.length || 0,
      concerts: library.concerts?.length || 0,
    };

    if (!config.security.debugHealth) return res.json(base);

    return res.json({
      ...base,
      remoteConfig: {
        ...remoteConfig,
        source: maskUrl(remoteConfig?.source),
        pasteMasterIndexUrl: maskUrl(remoteConfig?.pasteMasterIndexUrl),
      },
      effectiveMasterIndexUrl: maskUrl(remoteConfig?.pasteMasterIndexUrl || config.paste?.masterIndexUrl || ''),
      diagnostics: library.diagnostics,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// Page publique : génère une URL Stremio personnelle.
// Rien n'est stocké côté serveur.
// ─────────────────────────────────────────────
function configurePageHandler(req, res, options = {}) {
  const generatedUrl = options.generatedToken ? userManifestUrl(req, options.generatedToken) : '';
  const error = options.error || '';

  res.type('html').send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Configuration - Kast Alldebrid</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Arial, sans-serif; background: #11131a; color: #f4f4f5; }
    main { max-width: 860px; margin: 0 auto; padding: 32px 18px 48px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    p { color: #b8bcc8; line-height: 1.5; }
    form, .box { margin-top: 24px; background: #1b1f2a; border: 1px solid #2b3140; border-radius: 16px; padding: 20px; }
    label { display: block; font-weight: 700; margin-top: 16px; }
    input { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 12px; border-radius: 10px; border: 1px solid #394152; background: #0f1218; color: #fff; font-size: 15px; }
    .hint { font-size: 13px; color: #9ca3af; margin-top: 6px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
    button, a.button { appearance: none; border: 0; border-radius: 999px; padding: 12px 18px; font-weight: 700; text-decoration: none; cursor: pointer; }
    button.primary, a.primary { background: #7c3aed; color: #fff; }
    a.secondary, button.secondary { background: #2b3140; color: #fff; }
    code { color: #d8b4fe; word-break: break-all; }
    .warning { border-color: #b45309; color: #fde68a; }
    .success { border-color: #16a34a; }
    .error { border-color: #dc2626; color: #fecaca; }
  </style>
</head>
<body>
<main>
  <h1>Kast Alldebrid</h1>
  <p>Cette page génère une URL Stremio personnelle. Tes clés sont chiffrées dans l'URL d'installation et ne sont pas stockées dans <code>config.local.json</code>.</p>
  <div class="box warning">Ne partage pas ton URL personnelle : elle permet d'utiliser ta clé AllDebrid.</div>

  ${error ? `<div class="box error"><strong>Erreur :</strong> ${htmlEscape(error)}</div>` : ''}

  ${generatedUrl ? `<div class="box success">
    <strong>URL Stremio générée</strong>
    <p>Copie cette URL dans Stremio → Addons → Add addon :</p>
    <label for="installUrl">URL personnelle Stremio</label>
    <input id="installUrl" type="text" readonly value="${htmlEscape(generatedUrl)}" onclick="this.select()" />
    <div class="hint">Sélectionne et copie cette URL. Ne partage pas cette URL : elle contient ta configuration chiffrée.</div>
    <div class="actions">
      <button class="primary" type="button" onclick="copyInstallUrl()">Copier l'URL</button>
      <a class="button secondary" href="${htmlEscape(generatedUrl)}" target="_blank">Voir le manifest personnel</a>
    </div>
  </div>` : ''}

  <form method="post" action="/configure/generate">
    <label for="alldebridApiKey">Clé API AllDebrid</label>
    <input id="alldebridApiKey" name="alldebridApiKey" type="password" autocomplete="off" required placeholder="Obligatoire pour lire les médias" />
    <div class="hint">Chaque utilisateur doit utiliser sa propre clé API AllDebrid.</div>

    <label for="tmdbAccessToken">TMDB Access Token v4</label>
    <input id="tmdbAccessToken" name="tmdbAccessToken" type="password" autocomplete="off" placeholder="Recommandé pour les posters" />

    <label for="tmdbApiKey">TMDB API Key v3</label>
    <input id="tmdbApiKey" name="tmdbApiKey" type="password" autocomplete="off" placeholder="Alternative si tu n'utilises pas le token v4" />

    <div class="row">
      <div>
        <label for="tmdbLanguage">Langue TMDB</label>
        <input id="tmdbLanguage" name="tmdbLanguage" type="text" value="fr-FR" />
      </div>
      <div>
        <label for="alldebridAgent">Agent AllDebrid</label>
        <input id="alldebridAgent" name="alldebridAgent" type="text" value="KastStremioAddon" />
      </div>
    </div>

    <div class="actions">
      <button class="primary" type="submit">Générer mon URL Stremio</button>
      <a class="button secondary" href="${htmlEscape(manifestUrl(req))}" target="_blank">Manifest sans configuration</a>
    </div>
  </form>
</main>
<script>
  function copyInstallUrl() {
    const input = document.getElementById('installUrl');
    if (!input) return;

    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);

    try {
      const ok = document.execCommand('copy');
      if (ok) {
        alert('URL copiée. Colle-la dans Stremio > Addons > Add addon.');
        return;
      }
    } catch (e) {}

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value)
        .then(() => alert('URL copiée. Colle-la dans Stremio > Addons > Add addon.'))
        .catch(() => prompt('Copie cette URL dans Stremio :', input.value));
      return;
    }

    prompt('Copie cette URL dans Stremio :', input.value);
  }
</script>
</body>
</html>`);
}

app.get('/configure', configurePageHandler);

// Nouveau format : /u/cfg_xxx/configure
app.get('/u/:configToken/configure', (req, res) => {
  const configToken = req.params.configToken;

  return configurePageHandler(req, res, {
    generatedToken: configToken,
  });
});

// Ancien format : /cfg_xxx/configure
app.get(`/${TOKEN_PREFIX}:payload/configure`, (req, res) => {
  const configToken = `${TOKEN_PREFIX}${req.params.payload}`;

  return configurePageHandler(req, res, {
    generatedToken: configToken,
  });
});

app.post('/configure/generate', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.alldebridApiKey) {
      return configurePageHandler(req, res, { error: 'La clé API AllDebrid est obligatoire.' });
    }
    const token = encodeUserConfig(body);
    return configurePageHandler(req, res, { generatedToken: token });
  } catch (error) {
    return configurePageHandler(req, res, { error: error.message });
  }
});

// Ancien écran local/admin conservé seulement pour vérifier rapidement l'état global sans clés utilisateur.
app.get('/admin/config', adminAccess, (req, res) => {
  const saved = readLocalConfig();
  res.json({
    ok: true,
    localConfigFile: 'config.local.json',
    alldebrid: maskSecret(saved.alldebridApiKey || config.alldebrid.apiKey),
    tmdbAccessToken: maskSecret(saved.tmdbAccessToken || config.tmdb.accessToken),
    tmdbApiKey: maskSecret(saved.tmdbApiKey || config.tmdb.apiKey),
    remoteConfigUrl: maskUrl(saved.remoteConfigUrl || config.remoteConfig.url),
  });
});

function extractQuality(text) {
  const source = String(text || '').toLowerCase();
  if (source.includes('2160') || source.includes('4k') || source.includes('uhd')) return '4K';
  if (source.includes('1080')) return '1080p';
  if (source.includes('720')) return '720p';
  return 'unknown';
}

function extractCodec(text) {
  const source = String(text || '').toLowerCase();
  if (source.includes('h265') || source.includes('x265') || source.includes('hevc')) return 'hevc';
  if (source.includes('h264') || source.includes('x264') || source.includes('avc')) return 'avc';
  if (source.includes('xvid')) return 'xvid';
  return '';
}

function extractSource(text) {
  const source = String(text || '').toLowerCase();
  if (source.includes('remux')) return 'REMUX';
  if (source.includes('bluray') || source.includes('blu-ray')) return 'BluRay';
  if (source.includes('webdl') || source.includes('web-dl')) return 'WEB';
  if (source.includes('webrip')) return 'WEBRip';
  if (source.includes('bdrip')) return 'BDRip';
  if (source.includes('dvdrip')) return 'DVDRip';
  return '';
}

function extractAudio(text) {
  const source = String(text || '').toLowerCase();
  if (source.includes('atmos')) return 'Atmos';
  if (source.includes('dolby digital')) return 'Dolby Digital';
  if (source.includes('dolby')) return 'Dolby';
  if (source.includes('dts')) return 'DTS';
  if (source.includes('aac')) return 'AAC';
  if (source.includes('mp3')) return 'MP3';
  return '';
}

function extractLang(text) {
  const source = String(text || '').toUpperCase();
  const langs = [];
  if (source.includes('VFF')) langs.push('🇫🇷 VFF');
  if (source.includes('VFQ')) langs.push('🇨🇦 VFQ');
  if (source.includes('VF2')) langs.push('🇫🇷 VF2');
  if (source.includes('FRENCH')) langs.push('🇫🇷 FRENCH');
  if (source.includes('FR')) langs.push('🇫🇷 FR');
  if (source.includes('MULTI')) langs.push('🌍 MULTI');
  return [...new Set(langs)].join(' / ') || '🌍 MULTI';
}

function cleanTitle(text) {
  return String(text || '').replace(/\s+/g, ' ').replace(/\s-\stest$/i, '').trim();
}

function formatStremioStream(stream, index) {
  const rawTitle = cleanTitle(stream.title || stream.filename || `Source ${index + 1}`);
  const fileTitle = cleanTitle(stream.filename || rawTitle);
  const searchText = `${rawTitle} ${fileTitle}`;
  const quality = extractQuality(searchText);
  const codec = extractCodec(searchText);
  const source = extractSource(searchText);
  const audio = extractAudio(searchText);
  const lang = extractLang(searchText);

  const name = ['⚡ instant', 'AllDebrid', `(${quality})`].join('\n');
  const cacheLine = stream.size ? `🔍 SF - Cache 🇫🇷 ${stream.size}` : '🔍 SF - Cache';
  const technicalLine = [
    codec ? `🤖 ${codec}` : null,
    source ? `🖥️ ${source}` : null,
    audio ? `🎧 ${audio}` : null,
  ].filter(Boolean).join(' ');

  const title = [fileTitle, lang, cacheLine, technicalLine].filter(Boolean).join('\n');
  return { name, title };
}

async function directStreamRoute(req, res) {
  try {
    const userConfig = getSafeUserConfig(req);
    const type = decodeURIComponent(req.params.type);
    const id = decodeURIComponent(req.params.id);

    console.log('[STREAM DIRECT]', { type, id, user: maskUserConfig(userConfig) });

    const result = await streamHandler({ type, id }, userConfig);
    const rawStreams = Array.isArray(result?.streams) ? result.streams : [];

    const finalStreams = rawStreams
      .map((stream, index) => {
        const finalUrl = stream.url || stream.externalUrl;
        if (!finalUrl) return null;
        const formatted = formatStremioStream(stream, index);
        return { name: formatted.name, title: formatted.title, url: finalUrl };
      })
      .filter(Boolean);

    console.log('[STREAM DIRECT FINAL]', {
      id,
      count: finalStreams.length,
      first: finalStreams[0] ? safeLogStream(finalStreams[0]) : null,
    });

    res.status(200);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ streams: finalStreams });
  } catch (error) {
    console.error('[STREAM DIRECT ERROR]', error.message);
    res.status(200).json({ streams: [] });
  }
}

async function directCatalogRoute(req, res) {
  try {
    let userConfig = {};

    try {
      userConfig = getSafeUserConfig(req);
    } catch (configError) {
      console.warn('[CATALOG USER CONFIG WARNING]', configError.message);
      userConfig = {};
    }

    const args = {
      type: decodeURIComponent(req.params.type),
      id: decodeURIComponent(req.params.id),
      extra: parseExtra(req.params.extra || ''),
    };

    console.log('[CATALOG DIRECT]', {
      type: args.type,
      id: args.id,
      extra: args.extra,
      user: maskUserConfig(userConfig),
    });

    const result = await catalogHandler(args, userConfig);

    console.log('[CATALOG DIRECT RESULT]', {
      type: args.type,
      id: args.id,
      count: result?.metas?.length || 0,
    });

    res.status(200);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    return res.json({
      metas: Array.isArray(result?.metas) ? result.metas : [],
    });
  } catch (error) {
    console.error('[CATALOG DIRECT ERROR]', error);
    res.status(200);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    return res.json({ metas: [] });
  }
}

async function directMetaRoute(req, res) {
  try {
    const userConfig = getSafeUserConfig(req);
    const args = {
      type: decodeURIComponent(req.params.type),
      id: decodeURIComponent(req.params.id),
    };
    const result = await metaHandler(args, userConfig);
    res.json(result);
  } catch (error) {
    console.error('[META DIRECT ERROR]', error.message);
    res.status(200).json({ meta: null });
  }
}

// Routes personnelles avec config chiffrée dans l'URL.
// Nouveau format recommandé : /u/cfg_xxx/...
app.get('/u/:configToken/catalog/:type/:id.json', directCatalogRoute);
app.get('/u/:configToken/catalog/:type/:id/:extra.json', directCatalogRoute);
app.get('/u/:configToken/meta/:type/:id.json', directMetaRoute);
app.get('/u/:configToken/stream/:type/:id.json', directStreamRoute);

// Ancien format conservé pour compatibilité : /cfg_xxx/...
app.get(`/${TOKEN_PREFIX}:payload/catalog/:type/:id.json`, directCatalogRoute);
app.get(`/${TOKEN_PREFIX}:payload/catalog/:type/:id/:extra.json`, directCatalogRoute);
app.get(`/${TOKEN_PREFIX}:payload/meta/:type/:id.json`, directMetaRoute);
app.get(`/${TOKEN_PREFIX}:payload/stream/:type/:id.json`, directStreamRoute);

// Routes stream classiques sans config utilisateur : utilisent seulement .env/config.local.json.
if (config.addonToken) {
  app.get(`/${config.addonToken}/stream/:type/:id.json`, directStreamRoute);
} else {
  app.get('/stream/:type/:id.json', directStreamRoute);
}

// Le SDK continue à gérer catalog/meta classiques sans user config.
const router = getRouter(addonInterface);
if (config.addonToken) {
  app.use(`/${config.addonToken}`, router);
} else {
  app.use('/', router);
}

app.listen(config.port, config.host, () => {
  console.log(`Addon lancé: http://${config.host}:${config.port}${addonBasePath()}/manifest.json`);
  if (config.security.publicMode && !config.security.userConfigSecret) {
    console.warn('[SECURITY] CONFIG_ENCRYPTION_SECRET est obligatoire pour un addon public multi-utilisateur.');
  }
});
