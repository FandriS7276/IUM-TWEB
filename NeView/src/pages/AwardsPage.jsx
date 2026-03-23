/**
 * AwardsPage
 * -----------
 * Displays Oscar award data fetched from the backend with server-side pagination.
 *
 * Four tabs — every tab uses the backend's paginated response shape:
 *   { data: [...], pagination: { totalDocs, currentPage, totalPages, hasNext, hasPrev, perPage } }
 *
 *   1. Oscar Awards       → GET /awards/oscar  (category, winner, sort, year range)
 *   2. Controversial      → GET /awards/controversial-winners
 *   3. Never Won          → GET /awards/never-winning-nominees
 *   4. Snubbed            → GET /awards/snubbed
 *
 * Per-page preference:
 *   Shared site-wide via the usePerPage hook (localStorage-persisted).
 *
 * Caching strategy:
 *   Results are stored in a useRef (not useState) so cache writes never
 *   trigger re-renders. The cache key encodes tab + filters + page so each
 *   unique combination is cached separately.  Changing any filter resets
 *   the current page to 1.
 *
 * AbortController:
 *   Each fetch registers an AbortController whose signal is passed to Axios.
 *   If the user switches tabs or changes filters before the response arrives,
 *   the stale request is cancelled cleanly.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Award, Trophy } from '../components/Icons';
import { awardsAPI } from '../services/api';
import { usePerPage } from '../hooks/usePerPage';
import Pagination from '../components/Pagination';
import './AwardsPage.css';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Tab definitions rendered in the tab bar */
const TABS = [
  { key: 'oscars',        label: 'Oscar Awards'  },
  { key: 'controversial', label: 'Controversial' },
  { key: 'neverWon',      label: 'Never Won'     },
  { key: 'snubbed',       label: 'Snubbed'       },
];

/**
 * Common Oscar categories for the filter dropdown.
 * The backend validates against its live list, so an unrecognised category
 * returns a 400 — no security risk from this static list being stale.
 */
const OSCAR_CATEGORIES = [
  'BEST PICTURE',
  'DIRECTING',
  'ACTOR IN A LEADING ROLE',
  'ACTRESS IN A LEADING ROLE',
  'ACTOR IN A SUPPORTING ROLE',
  'ACTRESS IN A SUPPORTING ROLE',
  'WRITING (ORIGINAL SCREENPLAY)',
  'WRITING (ADAPTED SCREENPLAY)',
  'CINEMATOGRAPHY',
  'FILM EDITING',
  'MUSIC (ORIGINAL SCORE)',
  'MUSIC (ORIGINAL SONG)',
  'ANIMATED FEATURE FILM',
  'INTERNATIONAL FEATURE FILM',
  'DOCUMENTARY (FEATURE)',
  'VISUAL EFFECTS',
  'COSTUME DESIGN',
  'PRODUCTION DESIGN',
  'MAKEUP AND HAIRSTYLING',
  'SOUND',
];

/**
 * Sort options for the Oscar Awards tab.
 * Values match the backend's `sortBy` query format (field-direction).
 */
const SORT_OPTIONS = [
  { value: 'year_film-desc',        label: 'Year (Newest)'     },
  { value: 'year_film-asc',         label: 'Year (Oldest)'     },
  { value: 'winsCount-desc',        label: 'Most Wins'         },
  { value: 'totalNominations-desc', label: 'Most Nominations'  },
  { value: 'film-asc',              label: 'Title (A–Z)'       },
  { value: 'film-desc',             label: 'Title (Z–A)'       },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AwardsPage() {
  // ── Per-page preference ────────────────────────────────────────────────
  const { perPage, setPerPage } = usePerPage();

  // ── UI state ───────────────────────────────────────────────────────────
  const [tab,        setTab]        = useState('oscars');
  const [data,       setData]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  /** Pagination metadata straight from the backend response */
  const [pagination, setPagination] = useState(null);

  /**
   * Current page tracked independently per tab so switching tabs and
   * switching back preserves the user's position.
   */
  const [pageByTab, setPageByTab] = useState({
    oscars: 1, controversial: 1, neverWon: 1, snubbed: 1,
  });

  /**
   * User-selectable filters for the "Oscar Awards" tab.
   * Empty strings mean "no filter" — the key is omitted from the request.
   */
  const [filters, setFilters] = useState({
    category:  '',
    winner:    '',
    sortBy:    'year_film-desc',
    from_date: '',
    to_date:   '',
  });

  // ── Cache ──────────────────────────────────────────────────────────────
  /**
   * useRef instead of useState: cache writes are side-effect storage — they
   * must NOT trigger re-renders (which would cause the effect to loop).
   * The ref is read synchronously inside the effect before the async fetch.
   *
   * Shape: { [cacheKey]: { items: T[], pagination: PaginationMeta } }
   */
  const cacheRef = useRef({});

  // ── Derived values ─────────────────────────────────────────────────────

  const currentPage = pageByTab[tab] ?? 1;

  /**
   * Stable cache key that encodes tab + filters (oscars only) + page + limit.
   * Each unique combination is cached separately so tab/filter/page switching
   * is instant on the second visit.
   */
  const cacheKey = useMemo(() => {
    const base = tab === 'oscars'
      ? `oscars:${JSON.stringify(filters)}`
      : tab;
    return `${base}:p${currentPage}:l${perPage}`;
  }, [tab, filters, currentPage, perPage]);

  // ── Data fetching ──────────────────────────────────────────────────────

  useEffect(() => {
    // Serve from cache for instant tab / page navigation
    const cached = cacheRef.current[cacheKey];
    if (cached) {
      setData(cached.items);
      setPagination(cached.pagination);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const signal     = controller.signal;

    const fetchData = async () => {
      setLoading(true);
      setError('');

      try {
        let response;

        switch (tab) {
          case 'oscars': {
            // Build params dynamically — only include non-empty filter values
            const params = { limit: perPage, page: currentPage, sortBy: filters.sortBy };
            if (filters.category)  params.category  = filters.category;
            if (filters.winner)    params.winner     = filters.winner;
            if (filters.from_date) params.from_date  = filters.from_date;
            if (filters.to_date)   params.to_date    = filters.to_date;

            response = await awardsAPI.getOscars(params, { signal });
            break;
          }
          case 'controversial':
            response = await awardsAPI.getControversial(
              { limit: perPage, page: currentPage },
              { signal }
            );
            break;
          case 'neverWon':
            response = await awardsAPI.getNeverWon(
              { limit: perPage, page: currentPage },
              { signal }
            );
            break;
          case 'snubbed':
            response = await awardsAPI.getSnubbed(
              { limit: perPage, page: currentPage },
              { signal }
            );
            break;
          default:
            return;
        }

        // Backend returns: { success, data: [...], pagination: { … }, metadata: { … } }
        const items          = response.data.data ?? [];
        const paginationMeta = response.data.pagination ?? null;

        setData(items);
        setPagination(paginationMeta);

        // Write to ref-based cache — no state update, no re-render
        cacheRef.current[cacheKey] = { items, pagination: paginationMeta };

      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setError(
          err.code === 'ERR_NETWORK'
            ? 'Unable to connect to the server.'
            : `Failed to load ${tab} data.`
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Cancel the in-flight request if the user changes tab / filters before it resolves
    return () => controller.abort();

    // NOTE: `cacheRef` is intentionally excluded — refs never change identity
    // and reading `.current` inside the effect is always fresh.
  }, [tab, currentPage, perPage, cacheKey]);

  // ── Navigation helpers ─────────────────────────────────────────────────

  /** Jump to a specific page and scroll to the top of the results */
  const goToPage = useCallback(
    (newPage) => {
      setPageByTab((prev) => ({ ...prev, [tab]: newPage }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [tab],
  );

  /** Switch tabs — previous page position is preserved in pageByTab */
  const switchTab = useCallback((newTab) => {
    setTab(newTab);
  }, []);

  /**
   * Update a single filter value and reset the oscars tab to page 1.
   * Resetting is mandatory — the new filter might produce fewer pages.
   */
  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPageByTab((prev) => ({ ...prev, oscars: 1 }));
  }, []);

  /** Clear all filters back to defaults and reset page */
  const resetFilters = useCallback(() => {
    setFilters({ category: '', winner: '', sortBy: 'year_film-desc', from_date: '', to_date: '' });
    setPageByTab((prev) => ({ ...prev, oscars: 1 }));
  }, []);

  /**
   * Update per-page limit — invalidate the entire cache because page offsets
   * are no longer valid for the new limit, then reset all tabs to page 1.
   */
  const handlePerPageChange = useCallback((value) => {
    cacheRef.current = {};           // invalidate cache for new limit
    setPerPage(value);
    setPageByTab({ oscars: 1, controversial: 1, neverWon: 1, snubbed: 1 });
  }, [setPerPage]);

  // Check if any Oscar filter is active (for showing the reset button)
  const hasActiveFilters =
    filters.category ||
    filters.winner    ||
    filters.from_date ||
    filters.to_date   ||
    filters.sortBy !== 'year_film-desc';

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <main className="awards-page">
      <div className="container">

        {/* ── Header ── */}
        <div className="awards-page__header">
          <Trophy size={28} />
          <h1 className="awards-page__title">Academy Awards</h1>
        </div>

        {/* ── Tabs ── */}
        <div className="awards-tabs">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              className={`awards-tab ${tab === key ? 'awards-tab--active' : ''}`}
              onClick={() => switchTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Filters (Oscar Awards tab only) ── */}
        {tab === 'oscars' && (
          <div className="awards-filters">
            <div className="awards-filters__row">

              {/* Category */}
              <label className="awards-filter">
                <span className="awards-filter__label">Category</span>
                <select
                  className={`awards-filter__select${filters.category ? ' awards-filter__select--active' : ''}`}
                  value={filters.category}
                  onChange={(e) => updateFilter('category', e.target.value)}
                >
                  <option value="">All Categories</option>
                  {OSCAR_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              {/* Winner / Nominee status */}
              <label className="awards-filter">
                <span className="awards-filter__label">Status</span>
                <select
                  className={`awards-filter__select${filters.winner ? ' awards-filter__select--active' : ''}`}
                  value={filters.winner}
                  onChange={(e) => updateFilter('winner', e.target.value)}
                >
                  <option value="">Winners &amp; Nominees</option>
                  <option value="true">Winners Only</option>
                  <option value="false">Nominees Only</option>
                </select>
              </label>

              {/* Sort */}
              <label className="awards-filter">
                <span className="awards-filter__label">Sort By</span>
                <select
                  className={`awards-filter__select${filters.sortBy !== 'year_film-desc' ? ' awards-filter__select--active' : ''}`}
                  value={filters.sortBy}
                  onChange={(e) => updateFilter('sortBy', e.target.value)}
                >
                  {SORT_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              {/* Year range — from */}
              <label className="awards-filter">
                <span className="awards-filter__label">From Year</span>
                <input
                  type="number"
                  className={`awards-filter__input${filters.from_date ? ' awards-filter__input--active' : ''}`}
                  placeholder="e.g. 1970"
                  min="1927"
                  max={new Date().getFullYear()}
                  value={filters.from_date}
                  onChange={(e) => updateFilter('from_date', e.target.value)}
                />
              </label>

              {/* Year range — to */}
              <label className="awards-filter">
                <span className="awards-filter__label">To Year</span>
                <input
                  type="number"
                  className={`awards-filter__input${filters.to_date ? ' awards-filter__input--active' : ''}`}
                  placeholder="e.g. 2025"
                  min="1927"
                  max={new Date().getFullYear()}
                  value={filters.to_date}
                  onChange={(e) => updateFilter('to_date', e.target.value)}
                />
              </label>
            </div>

            {hasActiveFilters && (
              <button className="awards-filters__reset" onClick={resetFilters}>
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* ── Loading / Error ── */}
        {loading && (
          <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
            Loading awards data…
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: '#e74c3c', padding: '2rem' }}>
            {error}
          </p>
        )}

        {/* ── Results grid ── */}
        {!loading && !error && (
          <>
            <div className="awards-grid">
              {data.map((entry, index) => (
                <div key={entry.film || entry._id || index} className="award-card">
                  <div className="award-card__year">
                    {entry.year_film || entry.year || entry.year_ceremony || ''}
                  </div>
                  <div className="award-card__info">
                    <h3 className="award-card__film">
                      {entry.film || entry.title || entry.movie_title || entry.name || 'Unknown'}
                    </h3>
                    <div className="award-card__stats">
                      {entry.winsCount !== undefined && (
                        <span className="award-card__wins">
                          <Award size={14} /> {entry.winsCount} wins
                        </span>
                      )}
                      {entry.totalNominations !== undefined && (
                        <span className="award-card__noms">
                          {entry.totalNominations} nominations
                        </span>
                      )}
                      {entry.nominations !== undefined && (
                        <span className="award-card__noms">
                          {entry.nominations} nominations
                        </span>
                      )}
                      {entry.rotten_count !== undefined && (
                        <span className="award-card__noms">
                          {entry.rotten_count} rotten reviews
                        </span>
                      )}
                      {entry.stats?.tomatometer !== undefined && (
                        <span className="award-card__noms">
                          {entry.stats.tomatometer}% tomatometer
                        </span>
                      )}
                      {entry.category && !entry.awards && (
                        <span className="award-card__noms">{entry.category}</span>
                      )}
                    </div>

                    {/* Show up to 3 award categories with overflow badge */}
                    {entry.awards && (
                      <div className="award-card__categories">
                        {entry.awards.slice(0, 3).map((a, i) => (
                          <span
                            key={i}
                            className={`award-card__cat ${a.winner ? 'award-card__cat--won' : ''}`}
                          >
                            {a.category}
                          </span>
                        ))}
                        {entry.awards.length > 3 && (
                          <span className="award-card__cat">
                            +{entry.awards.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {data.length === 0 && (
              <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                No awards data available for the current filters.
              </p>
            )}

            {/* ── Shared Pagination component ── */}
            <Pagination
              pagination={pagination}
              onPageChange={goToPage}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
          </>
        )}

      </div>
    </main>
  );
}
