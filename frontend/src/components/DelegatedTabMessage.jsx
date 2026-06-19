import { UI } from "../utils/uiThemeTokens";

export default function DelegatedTabMessage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        boxSizing: "border-box",
        background: UI.pageBg,
        color: UI.pageText,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "420px",
          textAlign: "center",
          background: UI.cardBg,
          color: UI.textPrimary,
          borderRadius: "16px",
          padding: "28px 32px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <h1 style={{ margin: "0 0 12px 0", fontSize: "1.35rem" }}>Opened in SGF Central</h1>
        <p style={{ margin: 0, lineHeight: 1.5, color: UI.textSecondary }}>
          This link was sent to your already-open SGF Central window. You can close this tab.
        </p>
      </div>
    </div>
  );
}
