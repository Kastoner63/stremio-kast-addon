const genreMap = {
  12: 'Aventure',
  14: 'Fantastique',
  16: 'Animation',
  18: 'Drame',
  27: 'Horreur',
  28: 'Action',
  35: 'Comédie',
  36: 'Histoire',
  37: 'Western',
  53: 'Thriller',
  80: 'Crime',
  99: 'Documentaire',
  10402: 'Musique',
  10749: 'Romance',
  10752: 'Guerre',
  10770: 'Téléfilm',
  878: 'Science-fiction',
  9648: 'Mystère',
  10751: 'Famille',
  10759: 'Action & Adventure',
  10765: 'Sci-Fi & Fantasy',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics'
};

function genreNames(ids) {
  return (ids || []).map((id) => genreMap[id]).filter(Boolean);
}

function genreOptions() {
  return [...new Set(Object.values(genreMap))].sort((a, b) => a.localeCompare(b, 'fr'));
}

module.exports = { genreNames, genreOptions };
