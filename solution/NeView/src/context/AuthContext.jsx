/**
 * AuthContext
 * -----------
 * Global authentication state using React Context + useReducer.
 * Persists the JWT token in localStorage and exposes login / logout
 * helpers to the entire component tree via useAuth().
 *
 * On mount, if a stored token exists, validates it by calling
 * GET /user/profile. If the token is expired/invalid, clears
 * stored credentials and treats the user as logged out.
 */
import { createContext, useContext, useReducer, useEffect } from 'react';
import { authAPI } from '../services/api';

// ── State shape ─────────────────────────────────────────────────
const initialState = {
  user: null,       // { id, username, email, top_critic, avatar, bio }
  token: null,
  isLoading: true,  // true while we validate the stored token on mount
};

// ── Reducer: immutable state transitions ────────────────────────
const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN':
      return { user: action.payload.user, token: action.payload.token, isLoading: false };
    case 'LOGOUT':
      return { ...initialState, isLoading: false };
    case 'LOADED':
      return { ...state, isLoading: false };
    case 'UPDATE_USER':
      return { ...state, user: { ...state.user, ...action.payload } };
    default:
      return state;
  }
};

// ── Context ─────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  /**
   * Hydrate from localStorage on first mount.
   *
   * Instead of blindly trusting the stored user JSON, we validate
   * the token by hitting GET /user/profile. This ensures:
   *   - Expired tokens don't keep the user "logged in" with stale data.
   *   - The user object always reflects the latest server state.
   */
  useEffect(() => {
    const token = localStorage.getItem('nv_token');

    if (!token) {
      dispatch({ type: 'LOADED' });
      return;
    }

    authAPI
      .getProfile()
      .then(({ data }) => {
        // Server confirmed the token is valid — populate state
        dispatch({
          type: 'LOGIN',
          payload: { user: data.user, token },
        });
      })
      .catch(() => {
        // Token invalid or backend unreachable — clean up and show logged-out state
        localStorage.removeItem('nv_token');
        localStorage.removeItem('nv_user');
        dispatch({ type: 'LOADED' });
      });
  }, []);

  // ── Action creators ───────────────────────────────────────────
  const login = (user, token) => {
    localStorage.setItem('nv_token', token);
    localStorage.setItem('nv_user', JSON.stringify(user));
    dispatch({ type: 'LOGIN', payload: { user, token } });
  };

  const logout = () => {
    localStorage.removeItem('nv_token');
    localStorage.removeItem('nv_user');
    dispatch({ type: 'LOGOUT' });
  };

  const updateUser = (fields) => {
    const updated = { ...state.user, ...fields };
    localStorage.setItem('nv_user', JSON.stringify(updated));
    dispatch({ type: 'UPDATE_USER', payload: fields });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Custom hook – throws if used outside AuthProvider */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
