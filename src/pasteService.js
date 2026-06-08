const fs = require('node:fs/promises');
const path = require('node:path');
const { config } = require('./config');
const { parseMoviesText, parseSeriesText } = require('./parser');
const { loadRemoteConfig } = require('./remoteConfigService');
const { assertAllowedFetchUrl, maskUrl } = require('./security');

let cache = null;
let cacheExpiresAt = 0;

const PASTE_BASE_URL = 'https://paste.lesalkodiques.com';
const MAX_INDEX_DEPTH = 5;
const MAX_PASTES_PER_SOURCE = 250;

function isProbablyHtml(text) {
  const sample = String(text || '').trim().slice(0, 300).toLowerCase();
  return sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<head');
}

function normalizePasteReference(reference) {
  const value = String(reference || '').trim();

  if (!value) return '';

  // Accepte une URL RAW complète, validée ensuite par fetchText().
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Accepte les IDs Paste simples présents dans les fichiers index :
  // a2ccde62, 9c89015e, Za3JF9ri, etc.
  return `${PASTE_BASE_URL}/raw/${encodeURIComponent(value)}`;
}

function stripInlineComment(line) {
  const trimmed = line.trim();

  // Une ligne qui commence par # est un commentaire complet.
  if (!trimmed || trimmed.startsWith('#')) return '';

  return trimmed;
}

function getUsefulLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(stripInlineComment)
    .filter(Boolean);
}

function looksLikeMediaData(text) {
  const lines = getUsefulLines(text);

  return lines.some((line) =>
    line.startsWith('film;') ||
    line.startsWith('serie;') ||
    line.startsWith('CAT;TMDB;')
  );
}

function looksLikeIndex(text) {
  const lines = getUsefulLines(text);

  if (!lines.length) return false;
  if (looksLikeMediaData(text)) return false;

  return lines.every((line) => isPasteReference(line));
}

function isPasteReference(line) {
  const value = String(line || '').trim();
  return /^[a-zA-Z0-9_-]{4,}$/.test(value) || /^https?:\/\//i.test(value);
}

function normalizeSectionText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^#+/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseMasterIndexSections(text) {
  const sections = {
    movies: [],
    series: [],
    cartoons: [],
    cartoonSeries: [],
    documentaries: [],
    spectacles: [],
    concerts: [],
  };

  let currentSection = null;
  let currentGroup = null;

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const normalized = normalizeSectionText(line);
    const hasCartoon = /\b(CARTOON|CARTOONS|ANIME|ANIMES|DESSIN|DESSINS)\b/.test(normalized);
    const hasMovie = /\b(FILM|FILMS|MOVIE|MOVIES)\b/.test(normalized);
    const hasSeries = /\b(SERIE|SERIES|TV)\b/.test(normalized);
    const hasDocumentary = /\b(DOCUMENTAIRE|DOCUMENTAIRES|DOCUMENTARY|DOCUMENTARIES|DOCU|DOCUS|DUCOMENTAIRE|DUCOMENTAIRES)\b/.test(normalized);
    const hasSpectacle = /\b(SPECTACLE|SPECTACLES|SHOW|SHOWS|STANDUP|STAND UP)\b/.test(normalized);
    const hasConcert = /\b(CONCERT|CONCERTS|LIVE|LIVES)\b/.test(normalized);

    if (
      normalized === 'DOCUMENTAIRES' ||
      normalized === 'DOCUMENTAIRE' ||
      normalized === 'DOCUMENTARIES' ||
      normalized === 'DOCUMENTARY' ||
      normalized === 'DOCU' ||
      normalized === 'DOCUS' ||
      normalized === 'DUCOMENTAIRES' ||
      normalized === 'DUCOMENTAIRE'
    ) {
      currentGroup = 'documentaries';
      currentSection = 'documentaries';
      continue;
    }

    if (normalized === 'SPECTACLES' || normalized === 'SPECTACLE' || normalized === 'SHOWS' || normalized === 'SHOW') {
      currentGroup = 'spectacles';
      currentSection = 'spectacles';
      continue;
    }

    if (normalized === 'CONCERTS' || normalized === 'CONCERT' || normalized === 'LIVES' || normalized === 'LIVE') {
      currentGroup = 'concerts';
      currentSection = 'concerts';
      continue;
    }

    if (normalized === 'FILMS' || normalized === 'MOVIES') {
      currentGroup = 'movies';
      currentSection = 'movies';
      continue;
    }

    if (normalized === 'SERIES' || normalized === 'SERIE') {
      currentGroup = 'series';
      currentSection = 'series';
      continue;
    }

    if (
      normalized === 'CARTOONS MOVIES' ||
      normalized === 'CARTOONS FILMS' ||
      normalized === 'CARTOON MOVIES' ||
      normalized === 'CARTOON FILMS'
    ) {
      currentGroup = 'cartoons';
      currentSection = 'cartoons';
      continue;
    }

    if (
      normalized === 'CARTOONS SERIES' ||
      normalized === 'CARTOON SERIES' ||
      normalized === 'CARTOONS SERIE' ||
      normalized === 'CARTOON SERIE'
    ) {
      currentGroup = 'cartoons';
      currentSection = 'cartoonSeries';
      continue;
    }

    if (normalized === 'CARTOONS' || normalized === 'CARTOON') {
      currentGroup = 'cartoons';
      currentSection = 'cartoons';
      continue;
    }

    // Permet de gérer une structure comme :
    // #CARTOONS
    // # films - Stohoner
    // 2273547a
    // # series - Stohoner
    // 0da39749
    if (line.startsWith('#') || !isPasteReference(line)) {
      if (hasDocumentary) {
        currentGroup = 'documentaries';
        currentSection = 'documentaries';
        continue;
      }

      if (hasSpectacle) {
        currentGroup = 'spectacles';
        currentSection = 'spectacles';
        continue;
      }

      if (hasConcert) {
        currentGroup = 'concerts';
        currentSection = 'concerts';
        continue;
      }

      if (hasCartoon && hasSeries) {
        currentGroup = 'cartoons';
        currentSection = 'cartoonSeries';
        continue;
      }

      if (hasCartoon && hasMovie) {
        currentGroup = 'cartoons';
        currentSection = 'cartoons';
        continue;
      }

      if (hasCartoon) {
        currentGroup = 'cartoons';
        currentSection = 'cartoons';
        continue;
      }

      if (hasSeries) {
        currentSection = currentGroup === 'cartoons' ? 'cartoonSeries' : 'series';
        continue;
      }

      if (hasMovie) {
        currentSection = currentGroup === 'cartoons' ? 'cartoons' : 'movies';
        continue;
      }

      // Ligne de commentaire ou titre non reconnu : on l'ignore.
      continue;
    }

    if (!currentSection) {
      continue;
    }

    sections[currentSection].push(line);
  }

  return sections;
}

async function fetchText(url, label) {
  if (!url) return { text: '', source: 'missing-url' };

  const parsedUrl = assertAllowedFetchUrl(
    url,
    config.security.allowedRemoteHosts,
    label
  );

  const response = await fetch(parsedUrl.href, {
    headers: {
      'User-Agent': 'KastPrivateStremioAddon/1.0',
      Accept: 'text/plain, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Impossible de charger ${label}: HTTP ${response.status} (${maskUrl(parsedUrl.href)})`);
  }

  const text = await response.text();

  if (text.length > config.security.maxRemoteBytes) {
    throw new Error(`${label} trop volumineux (${text.length} octets). Limite: ${config.security.maxRemoteBytes}.`);
  }

  if (isProbablyHtml(text)) {
    throw new Error(
      `${label} ne semble pas être un fichier texte brut. ` +
      `L'URL renvoie du HTML. Utilise l'URL RAW du paste, pas la page d'affichage.`
    );
  }

  return { text, source: parsedUrl.href };
}

async function readLocalFile(filePath, label) {
  if (!filePath) return { text: '', source: 'missing-local-file' };

  const resolvedPath = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(resolvedPath, 'utf8');
  return { text, source: resolvedPath };
}

async function resolvePasteIndex({ text, source, label, depth, visited }) {
  if (!looksLikeIndex(text)) {
    return {
      text,
      sources: [source],
      indexSources: [],
      directFiles: 1,
    };
  }

  if (depth >= MAX_INDEX_DEPTH) {
    throw new Error(
      `Index Paste trop profond pour ${label}. Limite: ${MAX_INDEX_DEPTH}. Source: ${source}`
    );
  }

  const references = getUsefulLines(text);

  if (references.length > MAX_PASTES_PER_SOURCE) {
    throw new Error(
      `Trop de pastes dans l'index ${label}: ${references.length}. Limite: ${MAX_PASTES_PER_SOURCE}.`
    );
  }

  const chunks = [];
  const allSources = [];
  const indexSources = [source];
  let directFiles = 0;

  for (const reference of references) {
    const childUrl = normalizePasteReference(reference);

    if (!childUrl || visited.has(childUrl)) {
      continue;
    }

    visited.add(childUrl);

    const child = await fetchText(childUrl, `${label}/${reference}`);
    const resolved = await resolvePasteIndex({
      text: child.text,
      source: child.source,
      label: `${label}/${reference}`,
      depth: depth + 1,
      visited,
    });

    chunks.push(resolved.text);
    allSources.push(...resolved.sources);
    indexSources.push(...resolved.indexSources);
    directFiles += resolved.directFiles;
  }

  return {
    text: chunks.join('\n'),
    sources: allSources,
    indexSources,
    directFiles,
  };
}

async function loadText({ label, localPath, url }) {
  // Priorité aux fichiers locaux pour tester facilement avec tes .txt joints.
  // En local, le fichier peut être soit un fichier média final, soit un index d'IDs Paste.
  if (localPath) {
    const local = await readLocalFile(localPath, label);
    return resolvePasteIndex({
      text: local.text,
      source: local.source,
      label,
      depth: 0,
      visited: new Set([local.source]),
    });
  }

  const normalizedUrl = normalizePasteReference(url);
  const root = await fetchText(normalizedUrl, label);

  return resolvePasteIndex({
    text: root.text,
    source: root.source,
    label,
    depth: 0,
    visited: new Set([root.source]),
  });
}

async function loadTextFromReferences({ label, references, rootSource }) {
  if (!references || references.length === 0) {
    return {
      text: '',
      sources: [],
      indexSources: [],
      directFiles: 0,
    };
  }

  return resolvePasteIndex({
    text: references.join('\n'),
    source: `${rootSource}#${label}`,
    label,
    depth: 0,
    visited: new Set([rootSource]),
  });
}

async function loadMasterTexts(masterIndexUrl) {
  const root = config.localFiles.masterIndexPath
    ? await readLocalFile(config.localFiles.masterIndexPath, 'master-index')
    : await fetchText(normalizePasteReference(masterIndexUrl), 'master-index');

  const sections = parseMasterIndexSections(root.text);

  const [movies, series, cartoons, cartoonSeries, documentaries, spectacles, concerts] = await Promise.all([
    loadTextFromReferences({ label: 'master/movies', references: sections.movies, rootSource: root.source }),
    loadTextFromReferences({ label: 'master/series', references: sections.series, rootSource: root.source }),
    loadTextFromReferences({ label: 'master/cartoons', references: sections.cartoons, rootSource: root.source }),
    loadTextFromReferences({ label: 'master/cartoon-series', references: sections.cartoonSeries, rootSource: root.source }),
    loadTextFromReferences({ label: 'master/documentaries', references: sections.documentaries, rootSource: root.source }),
    loadTextFromReferences({ label: 'master/spectacles', references: sections.spectacles, rootSource: root.source }),
    loadTextFromReferences({ label: 'master/concerts', references: sections.concerts, rootSource: root.source }),
  ]);

  return {
    movies,
    series,
    cartoons,
    cartoonSeries,
    documentaries,
    spectacles,
    concerts,
    master: {
      source: root.source,
      sections,
    },
  };
}

async function loadLegacyTexts() {
  const [movies, cartoons, series] = await Promise.all([
    loadText({
      label: 'movies',
      localPath: config.localFiles.moviesPath,
      url: config.paste.moviesUrl,
    }),
    loadText({
      label: 'cartoons',
      localPath: config.localFiles.cartoonsPath,
      url: config.paste.cartoonsUrl,
    }),
    loadText({
      label: 'series',
      localPath: config.localFiles.seriesPath,
      url: config.paste.seriesUrl,
    }),
  ]);

  return {
    movies,
    cartoons,
    series,
    cartoonSeries: {
      text: '',
      sources: [],
      indexSources: [],
      directFiles: 0,
    },
    documentaries: {
      text: '',
      sources: [],
      indexSources: [],
      directFiles: 0,
    },
    spectacles: {
      text: '',
      sources: [],
      indexSources: [],
      directFiles: 0,
    },
    concerts: {
      text: '',
      sources: [],
      indexSources: [],
      directFiles: 0,
    },
    master: null,
  };
}

function diagnosticsFor(resolved, parsed) {
  return {
    sources: resolved.sources,
    indexSources: resolved.indexSources,
    directFiles: resolved.directFiles,
    chars: resolved.text.length,
    parsed: parsed.length,
  };
}

async function loadPasteLibrary(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cache && now < cacheExpiresAt) {
    return cache;
  }

  const remoteConfig = await loadRemoteConfig(
    config.remoteConfig.url,
    config.remoteConfig.cacheTtlMs
  );

  const effectiveMasterIndexUrl =
    remoteConfig.data.pasteMasterIndexUrl ||
    config.paste.masterIndexUrl;

  if (remoteConfig.enabled) {
    if (remoteConfig.error) {
      console.warn('[RemoteConfig] Erreur:', remoteConfig.error);
    } else {
      console.log('[RemoteConfig] Config chargée:', remoteConfig.source);
    }
  }

  const useMasterIndex = Boolean(config.localFiles.masterIndexPath || effectiveMasterIndexUrl);
  const texts = useMasterIndex ? await loadMasterTexts(effectiveMasterIndexUrl) : await loadLegacyTexts();

  const parsedMovies = parseMoviesText(texts.movies.text, 'movies');
  const parsedCartoons = parseMoviesText(texts.cartoons.text, 'cartoons');
  const parsedSeries = parseSeriesText(texts.series.text).map((item) => ({ ...item, kind: 'series' }));
  const parsedCartoonSeries = parseSeriesText(texts.cartoonSeries.text).map((item) => ({
    ...item,
    kind: 'cartoonSeries',
  }));
  const parsedDocumentaries = parseMoviesText(texts.documentaries.text, 'documentaries');
  const parsedDocumentarySeries = parseSeriesText(texts.documentaries.text).map((item) => ({
    ...item,
    kind: 'documentarySeries',
  }));
  const parsedSpectacles = parseMoviesText(texts.spectacles.text, 'spectacles');
  const parsedConcerts = parseMoviesText(texts.concerts.text, 'concerts');

  cache = {
    movies: parsedMovies,
    cartoons: parsedCartoons,
    series: parsedSeries,
    cartoonSeries: parsedCartoonSeries,
    documentaries: parsedDocumentaries,
    documentarySeries: parsedDocumentarySeries,
    spectacles: parsedSpectacles,
    concerts: parsedConcerts,
    loadedAt: new Date().toISOString(),
    diagnostics: {
      mode: useMasterIndex ? 'master-index' : 'legacy',
      remoteConfig: {
        enabled: remoteConfig.enabled,
        source: remoteConfig.source,
        error: remoteConfig.error,
        pasteMasterIndexUrl: remoteConfig.data.pasteMasterIndexUrl,
      },
      effectiveMasterIndexUrl,
      master: texts.master,
      movies: diagnosticsFor(texts.movies, parsedMovies),
      cartoons: diagnosticsFor(texts.cartoons, parsedCartoons),
      series: diagnosticsFor(texts.series, parsedSeries),
      cartoonSeries: diagnosticsFor(texts.cartoonSeries, parsedCartoonSeries),
      documentaries: diagnosticsFor(texts.documentaries, parsedDocumentaries),
      documentarySeries: diagnosticsFor(texts.documentaries, parsedDocumentarySeries),
      spectacles: diagnosticsFor(texts.spectacles, parsedSpectacles),
      concerts: diagnosticsFor(texts.concerts, parsedConcerts),
    },
  };

  cacheExpiresAt = now + config.cacheTtlMs;
  return cache;
}

function clearPasteLibraryCache() {
  cache = null;
  cacheExpiresAt = 0;
}

module.exports = { loadPasteLibrary, parseMasterIndexSections, clearPasteLibraryCache };
