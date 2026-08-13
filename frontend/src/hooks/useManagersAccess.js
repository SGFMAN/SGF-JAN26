import { useEffect, useState } from "react";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";

export function useManagersAccess() {
  const peeked = peekUserAccess("managers");
  const [hasManagers, setHasManagers] = useState(() => peeked === true);
  const [ready, setReady] = useState(() => peeked !== null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await hasUserAccess("managers");
      if (!cancelled) {
        setHasManagers(granted);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { hasManagers, ready };
}
