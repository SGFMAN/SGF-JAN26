import React, { useEffect, useState } from "react";
import {
  fetchAuthedImageBlobUrl,
  getCachedAuthedImageBlobUrl,
} from "../utils/authedImageCache";

/**
 * Renders an image from an API URL that requires staff auth headers.
 * Plain <img src> cannot send X-User-Id, so those requests 401 and show broken.
 * Uses a shared blob cache so Flooring thumbnails and plan fills share one fetch.
 *
 * @param {unknown} fallback — rendered when src is missing or the image fails to load
 */
export default function AuthedImg({ src, alt = "", style, className, fallback = null, ...rest }) {
  const [blobUrl, setBlobUrl] = useState(() => getCachedAuthedImageBlobUrl(src));
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(src) && !getCachedAuthedImageBlobUrl(src));

  useEffect(() => {
    let cancelled = false;

    setFailed(false);

    if (!src) {
      setBlobUrl(null);
      setLoading(false);
      return undefined;
    }

    const cached = getCachedAuthedImageBlobUrl(src);
    if (cached) {
      setBlobUrl(cached);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    (async () => {
      const url = await fetchAuthedImageBlobUrl(src);
      if (cancelled) return;
      if (!url) {
        setFailed(true);
        setBlobUrl(null);
        setLoading(false);
        return;
      }
      setBlobUrl(url);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
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
