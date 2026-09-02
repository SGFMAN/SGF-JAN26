import { useEffect, useState } from "react";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";

export function useSandpitAccess() {
  const peeked = peekUserAccess("sandpit");
  const [hasSandpit, setHasSandpit] = useState(() => peeked === true);
  const [ready, setReady] = useState(() => peeked !== null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await hasUserAccess("sandpit");
      if (!cancelled) {
        setHasSandpit(granted);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { hasSandpit, ready };
}
