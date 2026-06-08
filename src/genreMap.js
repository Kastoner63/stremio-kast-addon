const genreMap = {
  12: 'Aventure',
  14: 'Fantastique',
  16: 'Animation',
  18: 'Drame',
  27: 'Horreur',
  28: 'Action',
  35: 'Comédie',
  53: 'Thriller',
  80: 'Crime',
  878: 'Science-fiction',
  9648: 'Mystère',
  10751: 'Famille',
  10759: 'Action & Adventure',
  10765: 'Sci-Fi & Fantasy',
  10767: 'Talk'
};

function genreNames(ids) {
  return (ids || []).map((id) => genreMap[id]).filter(Boolean);
}

module.exports = { genreNames };
