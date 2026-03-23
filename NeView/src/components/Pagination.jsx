/**
 * Pagination
 * ----------
 * Reusable pagination bar shared by every paginated view in the app.
 *
 * Renders:
 *  - Prev / Next buttons
 *  - A compact page-number list with ellipsis markers for large ranges
 *  - A "Page X of Y (N total)" info label
 *  - An optional items-per-page <select> bound to the site-wide usePerPage hook
 *
 * Props:
 *   pagination      — shape from buildPaginatedResponse:
 *                     { currentPage, totalPages, totalDocs, hasPrev, hasNext }
 *   onPageChange    — (page: number) => void
 *   perPage         — current items-per-page value (pass from usePerPage)
 *   onPerPageChange — (limit: number) => void  — omit to hide the selector
 *   validLimits     — allowed limit values  (default: VALID_LIMITS from usePerPage)
 *   className       — extra class on the root element
 *
 * Design:
 *   When the total is just one page the prev/next controls are hidden but the
 *   footer (total count + per-page selector) is still shown — so the user can
 *   increase the limit to see more results without needing to paginate first.
 */
import { VALID_LIMITS } from '../hooks/usePerPage';
import './Pagination.css';

/** Maximum page buttons shown before switching to ellipsis mode. */
const MAX_VISIBLE = 7;

/**
 * Builds the list of page tokens to display.
 * Returns numbers and '…' string tokens.
 *
 * Algorithm (delta = 2):
 *   Always show page 1 and the last page.
 *   Show `current ± delta` pages in between.
 *   Fill gaps > 1 with an ellipsis token.
 *
 * @param {number} current
 * @param {number} total
 * @returns {(number|string)[]}
 */
function buildPageList(current, total) {
  if (total <= MAX_VISIBLE) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const delta = 2;
  const left  = Math.max(2,          current - delta);
  const right = Math.min(total - 1,  current + delta);

  const pages = [1];
  if (left > 2)          pages.push('…');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push('…');
  pages.push(total);

  return pages;
}

export default function Pagination({
  pagination,
  onPageChange,
  perPage,
  onPerPageChange,
  validLimits = VALID_LIMITS,
  className   = '',
}) {
  if (!pagination) return null;

  const { currentPage, totalPages, totalDocs, hasPrev, hasNext } = pagination;
  const showControls = totalPages > 1;

  return (
    <nav
      className={`pagination ${className}`.trim()}
      aria-label="Page navigation"
    >
      {/* ── Prev / Pages / Next ── */}
      {showControls && (
        <div className="pagination__controls">
          <button
            className="pagination__btn"
            disabled={!hasPrev}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label="Previous page"
          >
            ← Prev
          </button>

          <div className="pagination__pages" role="list">
            {buildPageList(currentPage, totalPages).map((page, i) =>
              page === '…' ? (
                <span
                  key={`ell-${i}`}
                  className="pagination__ellipsis"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={page}
                  role="listitem"
                  className={
                    `pagination__page${page === currentPage ? ' pagination__page--active' : ''}`
                  }
                  onClick={() => onPageChange(page)}
                  aria-current={page === currentPage ? 'page' : undefined}
                  disabled={page === currentPage}
                >
                  {page}
                </button>
              )
            )}
          </div>

          <button
            className="pagination__btn"
            disabled={!hasNext}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Footer: info + per-page selector ── */}
      <div className="pagination__footer">
        <span className="pagination__info">
          {showControls
            ? `Page ${currentPage} of ${totalPages}`
            : `${totalDocs.toLocaleString()} result${totalDocs !== 1 ? 's' : ''}`}
          <span className="pagination__total">
            {' '}({totalDocs.toLocaleString()} total)
          </span>
        </span>

        {onPerPageChange && (
          <label className="pagination__per-page-label">
            <span>Per page:</span>
            <select
              className="pagination__per-page-select"
              value={perPage}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
              aria-label="Items per page"
            >
              {validLimits.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </nav>
  );
}
