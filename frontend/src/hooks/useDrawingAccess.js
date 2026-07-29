import { useEffect, useState } from "react";
import { hasUserAccess } from "../utils/userAccess";

export function useDrawingAccess() {
  const [hasDrawing, setHasDrawing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await hasUserAccess("drawing");
      if (!cancelled) {
        setHasDrawing(granted);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { hasDrawing, ready };
}
