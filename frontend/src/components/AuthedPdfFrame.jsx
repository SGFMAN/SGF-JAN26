import React, { useEffect, useState } from "react";
import { getApiHeaders } from "../utils/auth";

/**
 * Renders a PDF from an API URL that requires staff auth.
 * Plain iframe/src cannot send X-User-Id, so those requests 401 ("Not authenticated")
 * when only the legacy header is available (e.g. after a server restart clears sessions).
 */
export default function AuthedPdfFrame({
  src,
  title = "PDF",
  style,
  className,
  loadingLabel = "Loading PDF…",
  errorLabel = "Could not load PDF",
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    setFailed(false);

    if (!src) {
      setBlobUrl(null);
      setLoading(false);
      return undefined;
    }

    if (String(src).startsWith("blob:") || String(src).startsWith("data:")) {
      setBlobUrl(src);
      setLoading(false);
      return undefined;
    }

    setBlobUrl(null);
    setLoading(true);

    (async () => {
      try {
        const headers = getApiHeaders();
        delete headers["Content-Type"];
        const res = await fetch(src, { headers, credentials: "include" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed (${res.status})`);
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setBlobUrl(objectUrl);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setBlobUrl(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#cc3333",
          fontSize: 14,
          ...style,
        }}
      >
        {errorLabel}
      </div>
    );
  }

  if (loading || !blobUrl) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
          fontSize: 14,
          ...style,
        }}
      >
        {loadingLabel}
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      title={title}
      className={className}
      style={style}
    />
  );
}
