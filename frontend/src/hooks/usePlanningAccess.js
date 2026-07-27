import { useEffect, useState } from "react";
import { hasUserAccess } from "../utils/userAccess";

export function usePlanningAccess() {
  const [hasPlanning, setHasPlanning] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await hasUserAccess("planning");
      if (!cancelled) {
        setHasPlanning(granted);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { hasPlanning, ready };
}
