/**
 * Placeholder Data
 * -----------------
 * Static mock data used while the SQL backend is being implemented.
 * Mirrors the shape of real API responses so the UI can be swapped
 * to live data with zero component changes.
 *
 * Poster URLs point to the Letterboxd CDN (same format as the datasets).
 */

// ── Helper: generate a placeholder poster URL based on a movie id ──
const poster = (id) =>
  `https://a.ltrbxd.com/resized/film-poster/${id.toString().split('').join('/')}/277064-barbie-0-230-0-345-crop.jpg?v=1b83dc7a71`;

// ── Shared movie shape ──────────────────────────────────────────────
const makeMovie = (overrides = {}) => ({
  id: 0,
  name: 'Untitled Movie',
  date: 2024,
  tagline: '',
  description: 'No description available yet.',
  minute: 120,
  rating: 0,
  poster: '',
  genres: [],
  tomatometer: null,
  freshCount: 0,
  rottenCount: 0,
  totalReviews: 0,
  likes: 0,
  actors: [],
  crew: [],
  ...overrides,
});

// ── Featured movies for HeroBanner rotation ─────────────────────────
export const FEATURED_MOVIES = [
  makeMovie({
    id: 1000001,
    name: 'Barbie',
    date: 2023,
    tagline: "She's everything. He's just Ken.",
    description:
      'Barbie and Ken are having the time of their lives in the colorful and seemingly perfect world of Barbie Land. However, when they get a chance to go to the real world, they soon discover the joys and perils of living among humans.',
    minute: 114,
    rating: 3.86,
    poster: 'https://a.ltrbxd.com/resized/film-poster/2/7/7/0/6/4/277064-barbie-0-230-0-345-crop.jpg?v=1b83dc7a71',
    genres: ['Comedy', 'Adventure', 'Fantasy'],
    tomatometer: 88,
    freshCount: 312,
    rottenCount: 42,
    totalReviews: 354,
    likes: 4520,
    actors: [
      { name: 'Margot Robbie', role: 'Barbie' },
      { name: 'Ryan Gosling', role: 'Ken' },
      { name: 'America Ferrera', role: 'Gloria' },
    ],
    crew: [{ name: 'Greta Gerwig', role: 'Director' }],
  }),
  makeMovie({
    id: 1000002,
    name: 'Parasite',
    date: 2019,
    tagline: 'Act like you own the place.',
    description:
      'All unemployed, Ki-taek and his family take a peculiar interest in the wealthy Park family. They ingratiate themselves as tutors and servants, but their plan unravels when they uncover a dark secret lurking in the basement.',
    minute: 133,
    rating: 4.56,
    poster: 'https://a.ltrbxd.com/resized/film-poster/4/2/6/7/7/3/426773-parasite-0-230-0-345-crop.jpg?v=8db0823760',
    genres: ['Comedy', 'Thriller', 'Drama'],
    tomatometer: 99,
    freshCount: 456,
    rottenCount: 5,
    totalReviews: 461,
    likes: 8930,
    actors: [
      { name: 'Song Kang-ho', role: 'Kim Ki-taek' },
      { name: 'Lee Sun-kyun', role: 'Park Dong-ik' },
      { name: 'Cho Yeo-jeong', role: 'Choi Yeon-gyo' },
    ],
    crew: [{ name: 'Bong Joon-ho', role: 'Director' }],
  }),
  makeMovie({
    id: 1000003,
    name: 'Oppenheimer',
    date: 2023,
    tagline: 'The world forever changes.',
    description:
      'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.',
    minute: 180,
    rating: 4.23,
    poster: 'https://a.ltrbxd.com/resized/film-poster/7/8/4/5/2/6/784526-oppenheimer-0-230-0-345-crop.jpg?v=6e1c5d8e25',
    genres: ['Drama', 'History', 'Thriller'],
    tomatometer: 93,
    freshCount: 398,
    rottenCount: 30,
    totalReviews: 428,
    likes: 7120,
    actors: [
      { name: 'Cillian Murphy', role: 'J. Robert Oppenheimer' },
      { name: 'Emily Blunt', role: 'Kitty Oppenheimer' },
      { name: 'Robert Downey Jr.', role: 'Lewis Strauss' },
    ],
    crew: [{ name: 'Christopher Nolan', role: 'Director' }],
  }),
];

// ── Genre-based movie rows (placeholder grids) ─────────────────────
const placeholderSet = (genre, count = 12) =>
  Array.from({ length: count }, (_, i) => {
    const id = genre.charCodeAt(0) * 1000 + i;
    return makeMovie({
      id,
      name: `${genre} Movie ${i + 1}`,
      date: 2020 + (i % 5),
      tagline: `A great ${genre.toLowerCase()} experience.`,
      description: `This is a placeholder description for ${genre} Movie ${i + 1}. When the SQL backend is connected, real movie data including full synopsis, cast, and crew will appear here.`,
      minute: 90 + (i * 7) % 60,
      rating: +(2.5 + Math.random() * 2.5).toFixed(2),
      poster: '',  // Empty — the UI will show a gradient placeholder
      genres: [genre],
      tomatometer: Math.floor(40 + Math.random() * 60),
      freshCount: Math.floor(50 + Math.random() * 400),
      rottenCount: Math.floor(5 + Math.random() * 100),
      totalReviews: 0,  // computed below
      likes: Math.floor(100 + Math.random() * 5000),
    });
  }).map((m) => ({ ...m, totalReviews: m.freshCount + m.rottenCount }));

export const GENRE_ROWS = [
  { title: 'Trending Now', movies: [...FEATURED_MOVIES, ...placeholderSet('Trending', 9)] },
  { title: 'Action & Adventure', movies: placeholderSet('Action') },
  { title: 'Comedy', movies: placeholderSet('Comedy') },
  { title: 'Drama', movies: placeholderSet('Drama') },
  { title: 'Sci-Fi & Fantasy', movies: placeholderSet('Sci-Fi') },
  { title: 'Horror', movies: placeholderSet('Horror') },
  { title: 'Documentaries', movies: placeholderSet('Documentary') },
  { title: 'Award Winners', movies: placeholderSet('Award') },
];

// ── Placeholder reviews ─────────────────────────────────────────────
export const PLACEHOLDER_REVIEWS = [
  {
    _id: 'r1',
    movie_title: 'Barbie',
    critic_name: 'Jane Doe',
    top_critic: true,
    publisher_name: 'Film Weekly',
    review_type: 'Fresh',
    review_score: '4/5',
    review_date: '2023-07-22',
    review_content: 'A vibrant, self-aware comedy that delivers both laughs and genuine emotional depth.',
  },
  {
    _id: 'r2',
    movie_title: 'Barbie',
    critic_name: 'John Smith',
    top_critic: false,
    publisher_name: 'Movie Blog',
    review_type: 'Fresh',
    review_score: '8/10',
    review_date: '2023-07-23',
    review_content: 'Greta Gerwig turns a toy brand into a sharp social commentary with stunning production design.',
  },
  {
    _id: 'r3',
    movie_title: 'Barbie',
    critic_name: 'Alex Turner',
    top_critic: true,
    publisher_name: 'Cinema Today',
    review_type: 'Rotten',
    review_score: '2/5',
    review_date: '2023-07-24',
    review_content: 'Despite its visual flair, the film struggles to sustain its message across a bloated runtime.',
  },
];
