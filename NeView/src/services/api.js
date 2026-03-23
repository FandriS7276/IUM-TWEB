/**
 * API Service Layer
 * -----------------
 * Centralized Axios instance configured to communicate with the MongoDB backend.
 * All endpoint helpers live here so components stay lean.
 *
 * Route mapping (frontend → backend):
 *   authAPI     → /api/user     (register, login, profile)
 *   reviewsAPI  → /api/reviews  (CRUD + like/report)
 *   awardsAPI   → /api/awards   (oscar data, controversial, snubbed)
 *   popularAPI  → /api/popular  (trending, today, this-week, etc.)
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// --- Axios singleton with sensible defaults ---
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Request interceptor — attaches the JWT token stored in localStorage
 * to every outgoing request's Authorization header. This allows the
 * backend's authenticateToken middleware to identify the user without
 * the frontend needing to manually pass the token on each call.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor — handles expired/invalid tokens globally.
 * If the backend returns 401 (e.g. token expired), clears stored
 * credentials so the user is prompted to re-authenticate.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only clear if we actually had a token (avoids clearing on public 401s)
      if (localStorage.getItem('nv_token')) {
        localStorage.removeItem('nv_token');
        localStorage.removeItem('nv_user');
        // Optionally redirect to login — components can also handle this
      }
    }
    return Promise.reject(error);
  }
);

// ──────────────────────────── AUTH ────────────────────────────
// Maps to backend: routes/users.ts → controller/userController.ts
export const authAPI = {
  /** POST /user/register — Create a new account */
  signUp: (data) => api.post('/user/register', data),

  /** POST /user/login — Authenticate and receive a JWT */
  signIn: (data) => api.post('/user/login', data),

  /** GET /user/profile — Fetch authenticated user's profile */
  getProfile: () => api.get('/user/profile'),
};

// ──────────────────────────── REVIEWS ─────────────────────────
// Maps to backend: routes/reviews.ts → controller/reviewReadController.ts
//                                     → controller/reviewWriteController.ts
export const reviewsAPI = {
  /**
   * GET /reviews — List reviews with optional filters and pagination.
   * Supported params: review_type, top_critic, from_date, to_date,
   *                   sortBy, page, limit, movie_title
   *
   * @param {object} params  - Query parameters forwarded to the backend.
   * @param {object} [config] - Optional Axios config (e.g. { signal } for AbortController).
   */
  getAll: (params, config = {}) => api.get('/reviews', { params, ...config }),

  /** POST /reviews — Create a new review (requires auth) */
  create: (data) => api.post('/reviews', data),

  /** PUT /reviews/:id — Update a review (requires auth) */
  update: (id, data) => api.put(`/reviews/${id}`, data),

  /** DELETE /reviews/:id — Delete a review (requires auth) */
  remove: (id) => api.delete(`/reviews/${id}`),

  /** POST /reviews/:id/like — Like a review (requires auth) */
  like: (id) => api.post(`/reviews/${id}/like`),

  /** POST /reviews/:id/report — Report a review (requires auth) */
  report: (id) => api.post(`/reviews/${id}/report`),
};

// ──────────────────────────── AWARDS ──────────────────────────
// Maps to backend: routes/oscar.ts → controller/oscarController.ts
export const awardsAPI = {
  /**
   * GET /awards/oscar — All Oscar nominations with filters.
   * @param {object} params  - Query parameters (category, winner, sortBy, year range, page, limit).
   * @param {object} [config] - Optional Axios config (e.g. { signal } for AbortController).
   */
  getOscars: (params, config = {}) => api.get('/awards/oscar', { params, ...config }),

  /** GET /awards/controversial-winners — Films that won despite low ratings */
  getControversial: (params, config = {}) => api.get('/awards/controversial-winners', { params, ...config }),

  /** GET /awards/never-winning-nominees — Perennial nominees who never won */
  getNeverWon: (params, config = {}) => api.get('/awards/never-winning-nominees', { params, ...config }),

  /** GET /awards/snubbed — Critically loved films that were Oscar-snubbed */
  getSnubbed: (params, config = {}) => api.get('/awards/snubbed', { params, ...config }),
};

// ──────────────────────────── POPULARITY ──────────────────────
// Maps to backend: routes/popular.ts → services/popularityCache.ts
export const popularAPI = {
  /** GET /popular/trending — Hot movies right now */
  trending: (params) => api.get('/popular/trending', { params }),

  /** GET /popular/today — Today's most popular */
  today: (params) => api.get('/popular/today', { params }),

  /** GET /popular/this-week — This week's most popular */
  thisWeek: (params) => api.get('/popular/this-week', { params }),

  /** GET /popular/yesterday — Yesterday's popular movies */
  yesterday: (params) => api.get('/popular/yesterday', { params }),

  /** GET /popular/last-week — Last week's popular movies */
  lastWeek: (params) => api.get('/popular/last-week', { params }),
};

export default api;

// ──────────────────────────── MOVIES (PostgreSQL) ──────────────
// Maps to: PostgreSQL Server → MovieController.java
// Base URL defaults to localhost:8080; override with VITE_POSTGRES_API_URL
const POSTGRES_API_URL =
  import.meta.env.VITE_POSTGRES_API_URL || 'http://localhost:8080/api';

const pgApi = axios.create({
  baseURL: POSTGRES_API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

export const moviesAPI = {
  /**
   * GET /movies?page=&size=&sortBy=&order=
   * Returns a paginated summary list of all movies.
   * sortBy: "name" | "rating" | "year"   order: "asc" | "desc"
   */
  getAll: (params) => pgApi.get('/movies', { params }),

  /**
   * GET /movies/search?q=&limit=
   * Lightweight title search / autocomplete.
   * Returns { count, results: [ { id, name, date, rating, poster } ] }
   */
  search: (q, limit = 20) =>
    pgApi.get('/movies/search', { params: { q, limit } }),

  /**
   * GET /movies/{title}
   * Full movie detail including cast, crew, genres, languages, etc.
   * Returns { movie: MovieDetailDTO }
   */
  getByTitle: (title) => pgApi.get(`/movies/${encodeURIComponent(title)}`),

  /**
   * POST /movies/batch
   * Batch-resolve movie titles into card-ready data (poster, description,
   * genres, rating, runtime). Used to enrich popularity data from MongoDB
   * with display data from PostgreSQL.
   *
   * @param {string[]} titles - Array of movie titles to look up
   * @returns { count, movies: [ { id, name, year, rating, poster, description, genres, runtime } ] }
   */
  getBatch: (titles) => pgApi.post('/movies/batch', { titles }),

  /**
   * POST /movies/batch/slim  (Tier 1)
   * Ultra-slim batch resolution — returns ONLY id, name, and poster.
   * Used for initial homepage card rendering. ~7x smaller payload than getBatch.
   *
   * @param {string[]} titles - Array of movie titles to look up
   * @returns { count, movies: [ { id, name, poster } ] }
   */
  getSlimBatch: (titles) => pgApi.post('/movies/batch/slim', { titles }),

  /**
   * GET /movies/hover/{id}  (Tier 2)
   * Hover data for a single movie — genres, short description (~200 chars),
   * rating, year, runtime. Fetched on-demand when the user hovers a card.
   * Response is cached by the browser for 1 hour (Cache-Control header).
   *
   * @param {number} id - Movie ID from the slim batch response
   * @returns { id, name, genres, description, rating, year, runtime }
   */
  getHoverData: (id) => pgApi.get(`/movies/hover/${id}`),

  /**
   * GET /movies/expanded/{id}  (Tier 2.5)
   * Expanded card data — full description + genres. Fetched when the user
   * clicks the chevron-down on the overlay. No actors/crew (those live
   * in the full detail endpoint).
   *
   * @param {number} id - Movie ID
   * @returns { id, name, year, rating, poster, description, genres, runtime }
   */
  getExpandedData: (id) => pgApi.get(`/movies/expanded/${id}`),
};
