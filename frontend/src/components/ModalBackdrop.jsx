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

/** Full-screen modal backdrop — portals to body, blocks scroll and background interaction. */
export default function ModalBackdrop({ zIndex = 2000, children, style = {}, onClick, ...rest }) {
  useModalBodyLock(true);

  return createPortal(
    <div
      role="presentation"
      aria-hidden={false}
      onClick={onClick}
      style={{ ...OVERLAY_STYLE, zIndex, ...style }}
      {...rest}
    >
      {children}
    </div>,
    document.body
  );
}
