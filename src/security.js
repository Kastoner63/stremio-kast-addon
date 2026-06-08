const crypto = require('node:crypto');

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toBool(value, fallback = false) {
  const text = clean(value).toLowerCase();
  if (!text) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(text);
}

function splitCsv(value) {
  return clean(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function maskSecret(value) {
  const text = clean(value);
  if (!text) return '';
  if (text.length <= 8) return '••••••••';
  return `${text.slice(0, 4)}••••••••${text.slice(-4)}`;
}

function maskUrl(value) {
  const text = clean(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    return `${url.origin}${url.pathname ? '/…' : ''}`;
  } catch {
    return '[url masquée]';
  }
}

function safeLogStream(stream) {
  if (!stream || typeof stream !== 'object') return stream;
  return {
    ...stream,
    url: stream.url ? maskUrl(stream.url) : undefined,
    externalUrl: stream.externalUrl ? maskUrl(stream.externalUrl) : undefined,
  };
}

function safeTokenCompare(a, b) {
  const left = clean(a);
  const right = clean(b);
  if (!left || !right) return false;

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getRequestToken(req) {
  return (
    req.headers['x-addon-token'] ||
    req.headers['x-admin-token'] ||
    req.query?.token ||
    req.query?.admin ||
    req.params?.addonToken ||
    req.params?.adminToken ||
    ''
  );
}

function isLoopbackAddress(address) {
  const value = clean(address).replace('::ffff:', '');
  return value === '127.0.0.1' || value === '::1' || value === 'localhost';
}

function isLocalRequest(req) {
  return isLoopbackAddress(req.ip) || isLoopbackAddress(req.socket?.remoteAddress);
}

function requireAdminAccess(config) {
  return (req, res, next) => {
    const adminToken = clean(config.security?.adminToken || config.addonToken);

    if (adminToken) {
      if (safeTokenCompare(getRequestToken(req), adminToken)) {
        return next();
      }

      return res.status(401).json({ ok: false, error: 'Accès admin refusé' });
    }

    // Sans token, l'admin n'est autorisé qu'en local. Cela évite d'exposer
    // /configure par erreur sur le réseau local ou Internet.
    if (isLocalRequest(req)) {
      return next();
    }

    return res.status(403).json({ ok: false, error: 'Admin local uniquement. Configure ADMIN_TOKEN pour un accès distant.' });
  };
}

function requireAddonAccess(config) {
  return (req, res, next) => {
    const addonToken = clean(config.addonToken);
    if (!addonToken) return next();

    if (safeTokenCompare(getRequestToken(req), addonToken)) {
      return next();
    }

    return res.status(401).json({ streams: [], error: 'Token addon invalide' });
  };
}

function addSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
}

function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({ ok: false, error: 'Trop de requêtes' });
    }

    next();
  };
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isAllowedHost(url, allowedHosts = []) {
  const hosts = allowedHosts.map((host) => clean(host).toLowerCase()).filter(Boolean);
  if (!hosts.length) return true;

  const hostname = getHostname(url);
  if (!hostname) return false;

  return hosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

function assertAllowedFetchUrl(url, allowedHosts, label = 'URL distante') {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label}: protocole interdit (${parsed.protocol})`);
  }

  if (!isAllowedHost(parsed.href, allowedHosts)) {
    throw new Error(`${label}: domaine non autorisé (${parsed.hostname})`);
  }

  return parsed;
}

module.exports = {
  clean,
  toBool,
  splitCsv,
  maskSecret,
  maskUrl,
  safeLogStream,
  safeTokenCompare,
  isLocalRequest,
  requireAdminAccess,
  requireAddonAccess,
  addSecurityHeaders,
  createRateLimiter,
  assertAllowedFetchUrl,
  isAllowedHost,
};
