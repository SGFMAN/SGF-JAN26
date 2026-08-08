import { useEffect } from "react";

let lockCount = 0;
let previousBodyOverflow = "";
let previousHtmlOverflow = "";
let previousPageOverflow = "";
let previousPagePointerEvents = "";
let previousRootPointerEvents = "";
let previousPageInert = false;
let pageContainerEl = null;
let rootEl = null;

/** Prevent scrolling and interaction with page content while modals are open. */
export function useModalBodyLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;

    if (lockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousHtmlOverflow = document.documentElement.style.overflow;
      pageContainerEl = document.querySelector(".page-container");
      rootEl = document.getElementById("root");
      previousPageOverflow = pageContainerEl?.style.overflow || "";
      previousPagePointerEvents = pageContainerEl?.style.pointerEvents || "";
      previousRootPointerEvents = rootEl?.style.pointerEvents || "";
      previousPageInert = Boolean(pageContainerEl?.inert);

      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      if (pageContainerEl) {
        pageContainerEl.style.overflow = "hidden";
        pageContainerEl.style.pointerEvents = "none";
        pageContainerEl.inert = true;
      }
      if (rootEl) {
        rootEl.style.pointerEvents = "none";
      }
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousHtmlOverflow;
        if (pageContainerEl) {
          pageContainerEl.style.overflow = previousPageOverflow;
          pageContainerEl.style.pointerEvents = previousPagePointerEvents;
          pageContainerEl.inert = previousPageInert;
        }
        if (rootEl) {
          rootEl.style.pointerEvents = previousRootPointerEvents;
        }
        pageContainerEl = null;
        rootEl = null;
      }
    };
  }, [active]);
}
