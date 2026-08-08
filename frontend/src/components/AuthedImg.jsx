import React, { useEffect, useState } from "react";
import { getApiHeaders } from "../utils/auth";

/**
 * Renders an image from an API URL that requires staff auth headers.
 * Plain <img src> cannot send X-User-Id, so those requests 401 and show broken.
 *
 * @param {unknown} fallback — rendered when src is missing or the image fails to load
 */
export default function AuthedImg({ src, alt = "", style, className, fallback = null, ...rest }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(src));

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    setFailed(false);

    if (!src) {
      setBlobUrl(null);
      setLoading(false);
      return undefined;
    }

    // Local file-picker previews already work without auth.
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
        if (!res.ok) throw new Error(`Failed (${res.status})`);
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

  if (!src || failed) return fallback;
  if (loading || !blobUrl) {
    return (
      <div
        className={className}
        style={{
          ...style,
          background: "transparent",
        }}
        aria-busy
        aria-hidden
      />
    );
  }

  return <img src={blobUrl} alt={alt} style={style} className={className} {...rest} />;
}
