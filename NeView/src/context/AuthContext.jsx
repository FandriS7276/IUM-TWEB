/**
 * AuthContext
 * -----------
 * Global authentication state using React Context + useReducer.
 * Persists the JWT token in localStorage and exposes login / logout
 * helpers to the entire component tree via useAuth().
 */
import { createContext, useContext, useReducer, useEffect } from 'react';

// ── State shape ─────────────────────────────────────────────────
const initialState = {
  user: null,       // { id, username, email, top_critic, avatar, bio }
  token: null,
  isLoading: true,  // true while we check localStorage on mount
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

  // Hydrate from localStorage on first mount
  useEffect(() => {
    const token = localStorage.getItem('nv_token');
    const userJson = localStorage.getItem('nv_user');

    if (token && userJson) {
      try {
        const user = JSON.parse(userJson);
        dispatch({ type: 'LOGIN', payload: { user, token } });
      } catch {
        localStorage.removeItem('nv_token');
        localStorage.removeItem('nv_user');
        dispatch({ type: 'LOADED' });
      }
    } else {
      dispatch({ type: 'LOADED' });
    }
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
