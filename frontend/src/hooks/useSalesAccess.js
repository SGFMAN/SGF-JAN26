import { useEffect, useState } from "react";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";

export function useSalesAccess() {
  const peeked = peekUserAccess("sales");
  const [hasSales, setHasSales] = useState(() => peeked === true);
  const [ready, setReady] = useState(() => peeked !== null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await hasUserAccess("sales");
      if (!cancelled) {
        setHasSales(granted);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { hasSales, ready };
}
