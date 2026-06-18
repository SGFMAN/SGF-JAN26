import { useEffect, useState } from "react";
import { hasUserAccess } from "../utils/userAccess";

export function useSalesAccess() {
  const [hasSales, setHasSales] = useState(false);
  const [ready, setReady] = useState(false);

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
