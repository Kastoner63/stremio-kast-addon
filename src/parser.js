function splitSemicolonLine(line) {
  const result = [];
  let current = '';
  let quote = null;
  let squareDepth = 0;
  let curlyDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prev = line[i - 1];

    if ((char === "'" || char === '"') && prev !== '\\') {
      if (quote === char) quote = null;
      else if (!quote) quote = char;
    }

    if (!quote) {
      if (char === '[') squareDepth++;
      if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
      if (char === '{') curlyDepth++;
      if (char === '}') curlyDepth = Math.max(0, curlyDepth - 1);
    }

    if (char === ';' && !quote && squareDepth === 0 && curlyDepth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((item) => item.trim());
}

function parseArrayLike(value) {
  if (!value || value === '[]') return [];

  const trimmed = value.trim();
  const matches = [...trimmed.matchAll(/'([^']*)'|"([^"]*)"/g)];

  if (matches.length > 0) {
    return matches.map((match) => match[1] || match[2] || '').filter(Boolean);
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return trimmed ? [trimmed] : [];
}

function parseNumberArrayLike(value) {
  return parseArrayLike(value)
    .map((item) => Number.parseInt(String(item).replace(/[^0-9-]/g, ''), 10))
    .filter(Number.isFinite);
}

function parseEpisodeMap(value) {
  const episodes = {};
  if (!value) return episodes;

  const regex = /(\d+)\s*:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = regex.exec(value)) !== null) {
    episodes[Number.parseInt(match[1], 10)] = match[2];
  }

  return episodes;
}

function normalizeTitle(value) {
  return String(value || '').trim();
}

function parseMovieLine(line, source) {
  const columns = splitSemicolonLine(line);
  if (columns.length < 12) return null;

  const [cat, tmdb, title, season, groupes, cast, director, network, year, genres, res, urls] = columns;

  if (cat !== 'film') return null;

  return {
    kind: source,
    type: 'movie',
    tmdbId: tmdb,
    title: normalizeTitle(title),
    year: Number.parseInt(year, 10) || undefined,
    genres: parseNumberArrayLike(genres),
    qualities: parseArrayLike(res),
    linkIds: parseArrayLike(urls)
  };
}

function parseSeriesLine(line) {
  const columns = splitSemicolonLine(line);
  if (columns.length < 12) return null;

  const [cat, tmdb, title, season, groupes, cast, director, network, year, genres, res, urls] = columns;

  if (cat !== 'serie') return null;

  return {
    kind: 'series',
    type: 'series',
    tmdbId: tmdb,
    title: normalizeTitle(title),
    season: Number.parseInt(season, 10) || 0,
    year: Number.parseInt(year, 10) || undefined,
    genres: parseNumberArrayLike(genres),
    quality: String(res || '').trim(),
    episodes: parseEpisodeMap(urls)
  };
}

function parseMoviesText(text, source) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('CAT;'))
    .map((line) => parseMovieLine(line, source))
    .filter(Boolean)
    .filter((item) => item.tmdbId && item.title);
}

function parseSeriesText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('CAT;'))
    .map(parseSeriesLine)
    .filter(Boolean)
    .filter((item) => item.tmdbId && item.title && item.season > 0);
}

module.exports = {
  splitSemicolonLine,
  parseArrayLike,
  parseEpisodeMap,
  parseMoviesText,
  parseSeriesText
};
