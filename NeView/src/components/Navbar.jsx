/**
 * Navbar Component
 * -----------------
 * Fixed top navigation bar with Netflix-style transparency that becomes
 * solid on scroll. Includes logo, navigation links, search toggle,
 * and user avatar / auth buttons.
 */
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, User, LogOut } from './Icons';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef(null);

  // Add solid background once user scrolls past 50px
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Focus the search input when it opens
  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    navigate('/');
  };

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__left">
        {/* Logo */}
        <Link to="/" className="navbar__logo">
          <span className="navbar__logo-text">N</span>eView
        </Link>

        {/* Primary nav links */}
        <div className="navbar__links">
          <Link to="/" className="navbar__link">Home</Link>
          <Link to="/search?genre=Action" className="navbar__link">Action</Link>
          <Link to="/search?genre=Comedy" className="navbar__link">Comedy</Link>
          <Link to="/search?genre=Drama" className="navbar__link">Drama</Link>
          <Link to="/search?genre=Horror" className="navbar__link">Horror</Link>
          <Link to="/awards" className="navbar__link">Awards</Link>
        </div>
      </div>

      <div className="navbar__right">
        {/* Search */}
        <form className={`navbar__search ${searchOpen ? 'navbar__search--open' : ''}`} onSubmit={handleSearch}>
          <button type="button" className="navbar__icon-btn" onClick={() => setSearchOpen(!searchOpen)} aria-label="Toggle search">
            <Search size={20} />
          </button>
          <input
            ref={searchRef}
            type="text"
            className="navbar__search-input"
            placeholder="Titles, people, genres"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onBlur={() => !searchQuery && setSearchOpen(false)}
          />
        </form>

        {/* Notifications placeholder */}
        <button className="navbar__icon-btn" aria-label="Notifications">
          <Bell size={20} />
        </button>

        {/* User menu or auth links */}
        {user ? (
          <div className="navbar__profile" onMouseLeave={() => setDropdownOpen(false)}>
            <button className="navbar__profile-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <div className="navbar__avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} />
                ) : (
                  <span>{user.username?.[0]?.toUpperCase() || 'U'}</span>
                )}
              </div>
              <ChevronDown size={14} className={`navbar__caret ${dropdownOpen ? 'navbar__caret--open' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="navbar__dropdown">
                <Link to="/profile" className="navbar__dropdown-item" onClick={() => setDropdownOpen(false)}>
                  <User size={16} /> Profile
                </Link>
                <button className="navbar__dropdown-item" onClick={handleLogout}>
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/signin" className="navbar__signin-btn">Sign In</Link>
        )}
      </div>
    </nav>
  );
}
