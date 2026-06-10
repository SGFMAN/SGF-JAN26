import { createPortal } from "react-dom";
import { useModalBodyLock } from "../utils/modalLock";

const OVERLAY_STYLE = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
  touchAction: "none",
};

/** Full-screen modal backdrop — portals to body, blocks scroll and background clicks. */
export default function ModalBackdrop({ onClose, zIndex = 2000, children, style = {} }) {
  useModalBodyLock(true);

  return createPortal(
    <div
      role="presentation"
      aria-hidden={false}
      style={{ ...OVERLAY_STYLE, zIndex, ...style }}
      onClick={onClose}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
