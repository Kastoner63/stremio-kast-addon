const crypto = require('crypto');
const zlib = require('zlib');
const { config } = require('./config');

const TOKEN_PREFIX = 'cfg_';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(value) {
  const text = String(value || '')
    .replaceAll('-', '+')
    .replaceAll('_', '/');

  const padding = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));

  return Buffer.from(text + padding, 'base64');
}

function getEncryptionKey() {
  const secret = clean(
    config.security?.userConfigSecret ||
    process.env.CONFIG_ENCRYPTION_SECRET
  );

  if (!secret) {
    throw new Error(
      'CONFIG_ENCRYPTION_SECRET manquant. Définis une valeur longue et aléatoire dans .env ou Render.'
    );
  }

  return crypto
    .createHash('sha256')
    .update(secret)
    .digest();
}

function normalizeUserConfig(input = {}) {
  return {
    alldebridApiKey: clean(input.alldebridApiKey || input.ALLDEBRID_API_KEY),
    tmdbAccessToken: clean(input.tmdbAccessToken || input.TMDB_ACCESS_TOKEN),
    tmdbApiKey: clean(input.tmdbApiKey || input.TMDB_API_KEY),
    tmdbLanguage: clean(input.tmdbLanguage || input.TMDB_LANGUAGE) || 'fr-FR',
    alldebridAgent: clean(input.alldebridAgent || input.ALLDEBRID_AGENT) || 'KastStremioAddon',
  };
}

function encodeUserConfig(input = {}) {
  const userConfig = normalizeUserConfig(input);

  if (!userConfig.alldebridApiKey) {
    throw new Error('La clé API AllDebrid est obligatoire.');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  // Important : on compresse avant chiffrement pour réduire fortement la taille de l’URL.
  const json = JSON.stringify(userConfig);
  const compressed = zlib.deflateRawSync(Buffer.from(json, 'utf8'));

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(compressed),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  const packed = Buffer.concat([
    iv,
    authTag,
    encrypted,
  ]);

  return TOKEN_PREFIX + base64UrlEncode(packed);
}

function decodeUserConfigSegment(segment = '') {
  const token = String(segment || '').trim();

  if (!token.startsWith(TOKEN_PREFIX)) {
    return {};
  }

  const payload = token.slice(TOKEN_PREFIX.length);

  if (!payload) {
    return {};
  }

  const key = getEncryptionKey();
  const packed = base64UrlDecode(payload);

  if (packed.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    return {};
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const compressed = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  const json = zlib.inflateRawSync(compressed).toString('utf8');
  const parsed = JSON.parse(json);

  return normalizeUserConfig(parsed);
}

function getUserConfigFromRequest(req) {
  const directToken =
    req.params?.configToken ||
    req.params?.token ||
    req.params?.payload ||
    '';

  if (directToken) {
    return decodeUserConfigSegment(directToken);
  }

  const pathParts = String(req.path || '')
    .split('/')
    .filter(Boolean);

  const tokenFromPath = pathParts.find((part) => part.startsWith(TOKEN_PREFIX));

  if (tokenFromPath) {
    return decodeUserConfigSegment(tokenFromPath);
  }

  return {};
}

function maskSecret(value) {
  const text = clean(value);

  if (!text) return '';
  if (text.length <= 8) return '••••••••';

  return `${text.slice(0, 4)}••••••••${text.slice(-4)}`;
}

function maskUserConfig(userConfig = {}) {
  return {
    alldebridApiKey: maskSecret(userConfig.alldebridApiKey),
    tmdbAccessToken: maskSecret(userConfig.tmdbAccessToken),
    tmdbApiKey: maskSecret(userConfig.tmdbApiKey),
    tmdbLanguage: userConfig.tmdbLanguage || '',
    alldebridAgent: userConfig.alldebridAgent || '',
  };
}

module.exports = {
  TOKEN_PREFIX,
  encodeUserConfig,
  decodeUserConfigSegment,
  getUserConfigFromRequest,
  maskUserConfig,
};