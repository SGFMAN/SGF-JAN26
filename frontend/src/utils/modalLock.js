import { useEffect } from "react";

let lockCount = 0;
let previousBodyOverflow = "";
let previousPageOverflow = "";
let previousPagePointerEvents = "";
let pageContainerEl = null;

/** Prevent scrolling and interaction with page content while modals are open. */
export function useModalBodyLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;

    if (lockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      pageContainerEl = document.querySelector(".page-container");
      previousPageOverflow = pageContainerEl?.style.overflow || "";
      previousPagePointerEvents = pageContainerEl?.style.pointerEvents || "";
      document.body.style.overflow = "hidden";
      if (pageContainerEl) {
        pageContainerEl.style.overflow = "hidden";
        pageContainerEl.style.pointerEvents = "none";
      }
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        if (pageContainerEl) {
          pageContainerEl.style.overflow = previousPageOverflow;
          pageContainerEl.style.pointerEvents = previousPagePointerEvents;
        }
        pageContainerEl = null;
      }
    };
  }, [active]);
}
