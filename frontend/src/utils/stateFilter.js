// Utility functions for persisting state filter (VIC/QLD/All) across pages

const STATE_FILTER_KEY = "sgf_state_filter";

/**
 * Get the saved state filter from localStorage
 * @returns {string} "VIC", "QLD", or "All" (defaults to "All")
 */
export function getStateFilter() {
  try {
    const saved = localStorage.getItem(STATE_FILTER_KEY);
    if (saved === "VIC" || saved === "QLD" || saved === "All") {
      return saved;
    }
  } catch (e) {
    console.error("Error reading state filter from localStorage:", e);
  }
  return "All";
}

/**
 * Save the state filter to localStorage
 * @param {string} filter - "VIC", "QLD", or "All"
 */
export function setStateFilter(filter) {
  try {
    if (filter === "VIC" || filter === "QLD" || filter === "All") {
      localStorage.setItem(STATE_FILTER_KEY, filter);
    }
  } catch (e) {
    console.error("Error saving state filter to localStorage:", e);
  }
}
