import { useCallback, useState } from "react";

const PROJECT_LIST_SEARCH_KEY = "sgf_project_list_search";

/** Saved search across All Projects / Design / Permit / etc. (session). */
export function getProjectListSearch() {
  try {
    const saved = sessionStorage.getItem(PROJECT_LIST_SEARCH_KEY);
    return saved == null ? "" : String(saved);
  } catch {
    return "";
  }
}

export function setProjectListSearch(query) {
  try {
    const q = query == null ? "" : String(query);
    if (q) sessionStorage.setItem(PROJECT_LIST_SEARCH_KEY, q);
    else sessionStorage.removeItem(PROJECT_LIST_SEARCH_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/** Local state synced to sessionStorage so view switches keep the term. */
export function useProjectListSearch() {
  const [searchQuery, setSearchQueryState] = useState(() => getProjectListSearch());

  const setSearchQuery = useCallback((value) => {
    setSearchQueryState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      const q = next == null ? "" : String(next);
      setProjectListSearch(q);
      return q;
    });
  }, []);

  return [searchQuery, setSearchQuery];
}
