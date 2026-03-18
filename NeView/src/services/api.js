/**
 * API Service Layer
 * -----------------
 * Centralized Axios instance configured to communicate with the MongoDB backend.
 * All endpoint helpers live here so components stay lean.
 *
 * NOTE: The SQL backend is not yet live, so many endpoints will return
 * placeholder / mock data until the migration is complete.
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// --- Axios singleton with sensible defaults ---
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every outgoing request when available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ──────────────────────────── AUTH ────────────────────────────
export const authAPI = {
  signUp: (data) => api.post('/auth/register', data),
  signIn: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
};

// ──────────────────────────── REVIEWS ─────────────────────────
export const reviewsAPI = {
  getAll: (params) => api.get('/reviews', { params }),
  create: (data) => api.post('/reviews', data),
  update: (id, data) => api.put(`/reviews/${id}`, data),
  remove: (id) => api.delete(`/reviews/${id}`),
  like: (id) => api.post(`/reviews/${id}/like`),
  report: (id) => api.post(`/reviews/${id}/report`),
};

// ──────────────────────────── AWARDS ──────────────────────────
export const awardsAPI = {
  getOscars: (params) => api.get('/awards/oscar', { params }),
  getControversial: () => api.get('/awards/controversial-winners'),
  getNeverWon: () => api.get('/awards/never-winning-nominees'),
  getSnubbed: () => api.get('/awards/snubbed'),
};

// ──────────────────────────── POPULARITY ──────────────────────
export const popularAPI = {
  trending: (params) => api.get('/popular/trending', { params }),
  today: (params) => api.get('/popular/today', { params }),
  thisWeek: (params) => api.get('/popular/this-week', { params }),
  yesterday: (params) => api.get('/popular/yesterday', { params }),
  lastWeek: (params) => api.get('/popular/last-week', { params }),
};

export default api;
