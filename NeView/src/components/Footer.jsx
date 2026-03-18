/**
 * Footer Component
 * -----------------
 * Simple Netflix-style footer with links and copyright.
 */
import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner container">
        <div className="footer__links">
          <Link to="/">Home</Link>
          <Link to="/awards">Awards</Link>
          <Link to="/search">Browse</Link>
          <Link to="/signin">Sign In</Link>
        </div>
        <p className="footer__copy">
          &copy; {new Date().getFullYear()} NeView &mdash; A movie review platform. Data powered by Letterboxd &amp; Rotten Tomatoes datasets.
        </p>
      </div>
    </footer>
  );
}
