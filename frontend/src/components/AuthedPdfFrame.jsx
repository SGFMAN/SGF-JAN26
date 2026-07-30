import React, { useEffect, useState } from "react";
import { getApiHeaders } from "../utils/auth";

/**
 * Renders a PDF from an API URL that requires staff auth.
 * Plain iframe/src cannot send X-User-Id, so those requests 401 ("Not authenticated")
 * when only the legacy header is available (e.g. after a server restart clears sessions).
 *
 * Optional resolveErrorMessage({ status, message }) overrides the failed-state text.
 */
export default function AuthedPdfFrame({
  src,
  title = "PDF",
  style,
  className,
  loadingLabel = "Loading PDF…",
  errorLabel = "Could not load PDF",
  resolveErrorMessage,
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [failStatus, setFailStatus] = useState(null);
  const [failMessage, setFailMessage] = useState("");
  const [failCode, setFailCode] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    setFailed(false);
    setFailStatus(null);
    setFailMessage("");
    setFailCode(null);

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
          const message = err.error || `Failed (${res.status})`;
          const error = new Error(message);
          error.status = res.status;
          error.serverMessage = message;
          error.code = err.code || null;
          throw error;
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setBlobUrl(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setFailed(true);
          setFailStatus(err?.status ?? null);
          setFailMessage(err?.serverMessage || err?.message || "Unknown error");
          setFailCode(err?.code || null);
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
    const displayError =
      typeof resolveErrorMessage === "function"
        ? resolveErrorMessage({ status: failStatus, message: failMessage, code: failCode })
        : failMessage || errorLabel;
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#cc3333",
          fontSize: 14,
          textAlign: "center",
          padding: 24,
          lineHeight: 1.45,
          ...style,
        }}
      >
        {displayError}
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
