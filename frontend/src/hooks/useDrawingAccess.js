import { useEffect, useState } from "react";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";

export function useDrawingAccess() {
  const peeked = peekUserAccess("drawing");
  const [hasDrawing, setHasDrawing] = useState(() => peeked === true);
  const [ready, setReady] = useState(() => peeked !== null);

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
