import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './responsive.css'
import './mobile/mobile.css'
import App from './App.jsx'
import { getApiHeaders } from './utils/auth'

// Intercept fetch to add admin headers to all API calls
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  // Only add headers to API calls
  if (typeof url === 'string' && url.includes('/api/')) {
    const existingHeaders = options.headers || {};
    const apiHeaders = getApiHeaders();
    
    // If body is FormData, don't set Content-Type (browser will set it automatically with boundary)
    const isFormData = options.body instanceof FormData;
    if (isFormData) {
      // Remove Content-Type from apiHeaders if it exists, so browser can set multipart/form-data
      const { 'Content-Type': _, ...headersWithoutContentType } = apiHeaders;
      options.headers = { ...existingHeaders, ...headersWithoutContentType };
    } else {
      // Merge headers (apiHeaders take precedence)
      options.headers = { ...existingHeaders, ...apiHeaders };
    }
  } else if (url && typeof url === 'object' && url.url && url.url.includes('/api/')) {
    // Handle Request object
    const existingHeaders = url.headers || {};
    const apiHeaders = getApiHeaders();
    // Create new headers object
    const headers = new Headers(existingHeaders);
    const isFormData = url.body instanceof FormData;
    Object.entries(apiHeaders).forEach(([key, value]) => {
      // Skip Content-Type for FormData requests
      if (!(isFormData && key.toLowerCase() === 'content-type')) {
        headers.set(key, value);
      }
    });
    url.headers = headers;
  }
  return originalFetch.call(this, url, options);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
