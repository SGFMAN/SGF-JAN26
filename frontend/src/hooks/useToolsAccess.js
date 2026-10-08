import { useEffect, useState } from "react";
import { getUserAccessGrants, peekUserAccess } from "../utils/userAccess";

export function useToolsAccess() {
  const peekedAdmin = peekUserAccess("admin");
  const peekedQuickConcept = peekUserAccess("quickconcept");
  const [ready, setReady] = useState(() => peekedAdmin !== null);
  const [isAdmin, setIsAdmin] = useState(() => peekedAdmin === true);
  const [hasQuickConcept, setHasQuickConcept] = useState(() => peekedQuickConcept === true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const grants = await getUserAccessGrants();
      if (cancelled) return;
      setIsAdmin(grants.admin === true);
      setHasQuickConcept(grants.quickconcept === true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ready,
    isAdmin,
    hasQuickConcept,
    showToolsMenu: isAdmin || hasQuickConcept,
  };
}
