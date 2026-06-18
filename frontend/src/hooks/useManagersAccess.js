import { useEffect, useState } from "react";
import { hasUserAccess } from "../utils/userAccess";

export function useManagersAccess() {
  const [hasManagers, setHasManagers] = useState(false);
  const [ready, setReady] = useState(false);

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
