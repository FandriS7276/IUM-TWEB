/**
 * usePerPage
 * ----------
 * Reads and persists the user's preferred items-per-page to localStorage.
 *
 * All paginated views across the site share this single preference so the
 * user only needs to set it once. The stored value is validated on read so
 * stale or manually-edited localStorage values never break pagination.
 *
 * @returns {{ perPage: number, setPerPage: (n: number) => void, VALID_LIMITS: number[] }}
 */
import { useState, useCallback } from 'react';

/** Exported so the Pagination component can reference the same list. */
export const VALID_LIMITS = [10, 20, 50, 100];

const LS_KEY  = 'nv_per_page';
const DEFAULT = 20;

function readStored() {
  const n = Number(localStorage.getItem(LS_KEY));
  return VALID_LIMITS.includes(n) ? n : DEFAULT;
}

export function usePerPage() {
  const [perPage, setState] = useState(readStored);

  /**
   * Update the per-page setting.
   * Validates against VALID_LIMITS and persists to localStorage so the
   * preference survives page reloads.
   */
  const setPerPage = useCallback((value) => {
    const n     = Number(value);
    const valid = VALID_LIMITS.includes(n) ? n : DEFAULT;
    localStorage.setItem(LS_KEY, String(valid));
    setState(valid);
  }, []);

  return { perPage, setPerPage, VALID_LIMITS };
}
