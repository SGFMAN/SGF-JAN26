import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { UI, outlineBorder } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const SECTION_GREY = UI.panelBg;

/**
 * Normalise stored template body for Tiptap.
 * Plain-text templates (newlines + optional inline tags) become paragraphs;
 * existing block HTML is left as-is. <b>/<i> parse as bold/italic via Tiptap.
 */
export function normalizeBodyHtmlForEditor(raw) {
  const html = String(raw ?? "");
  if (!html.trim()) return "";
  if (/<(?:p|div|br|ul|ol|li|h[1-6]|table|blockquote)\b/i.test(html)) {
    return html;
  }
  return html
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Treat empty ProseMirror docs as empty string for save/test. */
export function editorHtmlToStored(html) {
  const h = String(html || "").trim();
  if (!h) return "";
  if (/^<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>$/i.test(h)) return "";
  return h;
}

function ToolbarButton({ label, title, active, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => {
        // Keep editor selection; don't steal focus from the contenteditable.
        e.preventDefault();
        onClick();
      }}
      style={{
        minWidth: "32px",
        height: "30px",
        padding: "0 8px",
        fontSize: "0.95rem",
        fontWeight: 700,
        color: active ? WHITE : MONUMENT,
        background: active ? MONUMENT : WHITE,
        border: outlineBorder,
        borderRadius: "6px",
        cursor: "pointer",
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children ?? label}
    </button>
  );
}

const EmailBodyEditor = forwardRef(function EmailBodyEditor(
  { value, onChange, placeholder = "Type the email body…" },
  ref
) {
  const lastEmittedHtmlRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        // Keep: document, paragraph, text, bold, italic, underline, hardBreak, history
      }),
    ],
    content: normalizeBodyHtmlForEditor(value),
    editorProps: {
      attributes: {
        class: "email-body-editor__content",
        "aria-label": "Email body",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastEmittedHtmlRef.current = html;
      onChangeRef.current?.(html);
    },
  });

  // Sync when a different template is loaded (external value change).
  useEffect(() => {
    if (!editor) return;
    const incoming = String(value ?? "");
    const emitted = lastEmittedHtmlRef.current;
    if (emitted != null && (incoming === emitted || incoming === editorHtmlToStored(emitted))) {
      return;
    }
    const normalized = normalizeBodyHtmlForEditor(incoming);
    const current = editor.getHTML();
    if (normalized === current || (normalized === "" && editor.isEmpty)) {
      return;
    }
    editor.commands.setContent(normalized || "", { emitUpdate: false });
    lastEmittedHtmlRef.current = editor.getHTML();
  }, [value, editor]);

  useImperativeHandle(
    ref,
    () => ({
      insertToken(tokenText) {
        if (!editor) return;
        editor.chain().focus().insertContent(String(tokenText || "")).run();
      },
      focus() {
        editor?.commands.focus();
      },
      getHTML() {
        return editor ? editor.getHTML() : "";
      },
    }),
    [editor]
  );

  const toggleBold = () => editor?.chain().focus().toggleBold().run();
  const toggleItalic = () => editor?.chain().focus().toggleItalic().run();
  const toggleUnderline = () => editor?.chain().focus().toggleUnderline().run();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        width: "100%",
        background: WHITE,
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <div
        role="toolbar"
        aria-label="Text formatting"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 10px",
          borderBottom: `1px solid ${SECTION_GREY}`,
          background: UI.panelBg,
          flexShrink: 0,
        }}
      >
        <ToolbarButton
          title="Bold (Ctrl+B)"
          active={!!editor?.isActive("bold")}
          onClick={toggleBold}
        >
          <span style={{ fontWeight: 800 }}>B</span>
        </ToolbarButton>
        <span style={{ color: UI.textMuted, fontSize: "0.85rem", userSelect: "none" }}>|</span>
        <ToolbarButton
          title="Italic (Ctrl+I)"
          active={!!editor?.isActive("italic")}
          onClick={toggleItalic}
        >
          <span style={{ fontStyle: "italic", fontWeight: 700 }}>I</span>
        </ToolbarButton>
        <span style={{ color: UI.textMuted, fontSize: "0.85rem", userSelect: "none" }}>|</span>
        <ToolbarButton
          title="Underline (Ctrl+U)"
          active={!!editor?.isActive("underline")}
          onClick={toggleUnderline}
        >
          <span style={{ textDecoration: "underline", fontWeight: 700 }}>U</span>
        </ToolbarButton>
      </div>

      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {editor?.isEmpty ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "10px",
              left: "12px",
              right: "12px",
              color: UI.textMuted,
              fontSize: "1rem",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {placeholder}
          </div>
        ) : null}
        <EditorContent
          editor={editor}
          className="email-body-editor__surface"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        />
      </div>

      <style>{`
        .email-body-editor__surface {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .email-body-editor__surface .ProseMirror,
        .email-body-editor__content {
          flex: 1;
          min-height: 0;
          height: 100%;
          overflow-y: auto;
          padding: 10px 12px;
          font-size: 1rem;
          line-height: 1.5;
          color: ${MONUMENT};
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
        }
        .email-body-editor__content p {
          margin: 0 0 0.65em 0;
        }
        .email-body-editor__content p:last-child {
          margin-bottom: 0;
        }
        .email-body-editor__content u {
          text-decoration: underline;
        }
        .email-body-editor__content strong,
        .email-body-editor__content b {
          font-weight: 700;
        }
        .email-body-editor__content em,
        .email-body-editor__content i {
          font-style: italic;
        }
        .ProseMirror-focused {
          outline: none;
        }
      `}</style>
    </div>
  );
});

export default EmailBodyEditor;
