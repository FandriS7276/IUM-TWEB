/**
 * App — Root Component
 * ---------------------
 * Sets up React Router, wraps the tree in AuthProvider, and
 * renders the Navbar/Footer shell around page-level routes.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import MovieDetailPage from './pages/MovieDetailPage';
import SearchPage from './pages/SearchPage';
import ProfilePage from './pages/ProfilePage';
import AwardsPage from './pages/AwardsPage';
import './index.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/movie/:id" element={<MovieDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/awards" element={<AwardsPage />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </AuthProvider>
  );
}
