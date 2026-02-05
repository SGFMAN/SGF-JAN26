import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './responsive.css'
import App from './App.jsx'
import { getApiHeaders } from './utils/auth'

// Intercept fetch to add admin headers to all API calls
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  // Only add headers to API calls
  if (typeof url === 'string' && url.includes('/api/')) {
    const existingHeaders = options.headers || {};
    const apiHeaders = getApiHeaders();
    // Merge headers (apiHeaders take precedence)
    options.headers = { ...existingHeaders, ...apiHeaders };
  } else if (url && typeof url === 'object' && url.url && url.url.includes('/api/')) {
    // Handle Request object
    const existingHeaders = url.headers || {};
    const apiHeaders = getApiHeaders();
    // Create new headers object
    const headers = new Headers(existingHeaders);
    Object.entries(apiHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    url.headers = headers;
  }
  return originalFetch.apply(this, arguments);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
