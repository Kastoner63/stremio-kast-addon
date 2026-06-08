const { config } = require('./config');
const { maskUrl, assertAllowedFetchUrl } = require('./security');
const { resolveAlldebridFileId } = require('./alldebridService');

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function normalizeStream(raw, fallback = {}) {
  if (!raw) return null;

  const finalUrl = raw.url || raw.externalUrl || raw.file || raw.link || raw.streamUrl;
  if (!isHttpUrl(finalUrl)) return null;

  return {
    name: raw.name || fallback.name || 'Kast Alldebrid',
    title: raw.title || fallback.title || 'Source privée',
    url: finalUrl,
    filename: raw.filename || fallback.filename || '',
    size: raw.size || raw.filesizeFormatted || fallback.size || '',
  };
}

async function resolveWithIntegratedAlldebrid(linkId, context = {}, userConfig = {}) {
  try {
    const resolved = await resolveAlldebridFileId(linkId, userConfig);

    return [
      normalizeStream(
        {
          name: 'Kast Alldebrid',
          title: context.quality || context.title || 'Source privée',
          url: resolved.url,
          filename: resolved.filename || '',
          size: resolved.size || '',
        },
        context
      ),
    ].filter(Boolean);
  } catch (error) {
    console.warn('[Resolver intégré] Échec:', error.message);
    return [];
  }
}

function normalizeResolverBaseUrl() {
  if (!config.customResolverBaseUrl) return null;
  try {
    return assertAllowedFetchUrl(
      config.customResolverBaseUrl,
      config.security.allowedMediaHosts.length ? config.security.allowedMediaHosts : ['127.0.0.1', 'localhost'],
      'CUSTOM_RESOLVER_BASE_URL'
    );
  } catch (error) {
    console.warn('[Resolver externe] CUSTOM_RESOLVER_BASE_URL invalide:', error.message);
    return null;
  }
}

async function callCustomResolver(linkId, context = {}) {
  const base = normalizeResolverBaseUrl();
  if (!base || !linkId) return [];

  const url = new URL('/resolve', base);
  url.searchParams.set('id', linkId);

  if (context.type) url.searchParams.set('type', context.type);
  if (context.tmdbId) url.searchParams.set('tmdbId', context.tmdbId);
  if (context.season) url.searchParams.set('season', String(context.season));
  if (context.episode) url.searchParams.set('episode', String(context.episode));
  if (context.quality) url.searchParams.set('quality', context.quality);
  if (context.localTitle) url.searchParams.set('title', context.localTitle);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KastPrivateStremioAddon/1.0',
        Accept: 'application/json',
        ...(config.security.resolverToken ? { 'X-Resolver-Token': config.security.resolverToken } : {}),
      },
    });

    if (!response.ok) {
      console.warn(`[Resolver externe] HTTP ${response.status} pour id=${linkId}`);
      return [];
    }

    const json = await response.json().catch(() => null);
    if (!json) return [];

    if (Array.isArray(json.streams)) {
      return json.streams.map((stream) => normalizeStream(stream, context)).filter(Boolean);
    }

    const single = normalizeStream(json, context);
    return single ? [single] : [];
  } catch (error) {
    console.warn(`[Resolver externe] Impossible de joindre ${maskUrl(url.href)} pour id=${linkId}:`, error.message);
    return [];
  }
}

async function resolvePrivateLinkId(linkId, context = {}, userConfig = {}) {
  // Option A public Render : resolver AllDebrid intégré au serveur principal.
  const integrated = await resolveWithIntegratedAlldebrid(linkId, context, userConfig);
  if (integrated.length) return integrated;

  // Fallback optionnel : ancien resolver externe si configuré.
  return callCustomResolver(linkId, context);
}

module.exports = { resolvePrivateLinkId };
