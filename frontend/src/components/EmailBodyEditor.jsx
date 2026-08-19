import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Extension } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { UI, STREAM, outlineBorder } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const SECTION_GREY = UI.panelBg;
const VIC_BLUE_LIGHT = STREAM.vicBlueLight;

/** Matches `{ProjectName}`, `{ClientName}`, etc. Visual-only — not stored in HTML. */
const TOKEN_PATTERN = /\{[A-Za-z][A-Za-z0-9]*\}/g;

function buildTokenDecorations(doc) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    for (const match of text.matchAll(TOKEN_PATTERN)) {
      const from = pos + match.index;
      const to = from + match[0].length;
      decorations.push(
        Decoration.inline(from, to, {
          class: "email-body-editor__token",
        })
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

const TokenHighlight = Extension.create({
  name: "tokenHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("emailBodyTokenHighlight"),
        props: {
          decorations(state) {
            return buildTokenDecorations(state.doc);
          },
        },
      }),
    ];
  },
});

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

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeLinkHref(raw) {
  const s = String(raw || "").trim();
  if (!s) return "https://";
  if (/^javascript:/i.test(s) || /^data:/i.test(s)) return "https://";
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return `https://${s}`;
}

function hrefForModal(href) {
  const s = String(href || "").trim();
  if (!s || s === "https://" || s === "http://") return "";
  return s;
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
  const editorRef = useRef(null);
  const openLinkEditorRef = useRef(() => false);
  const linkRangeRef = useRef(null);
  const [linkModal, setLinkModal] = useState(null);

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
        link: {
          openOnClick: false,
          autolink: false,
          defaultProtocol: "https",
          HTMLAttributes: {
            class: "email-body-editor__link",
          },
        },
      }),
      TokenHighlight,
    ],
    content: normalizeBodyHtmlForEditor(value),
    editorProps: {
      attributes: {
        class: "email-body-editor__content",
        "aria-label": "Email body",
      },
      handleDOMEvents: {
        click(_view, event) {
          if (event.target?.closest?.("a")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        dblclick(view, event) {
          const posInfo = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (posInfo == null) return false;
          if (openLinkEditorRef.current(posInfo.pos)) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastEmittedHtmlRef.current = html;
      onChangeRef.current?.(html);
    },
  });
  editorRef.current = editor;

  function openLinkModalFromEditor(ed) {
    if (!ed?.isActive("link")) return false;
    const { from, to } = ed.state.selection;
    linkRangeRef.current = { from, to };
    setLinkModal({
      text: ed.state.doc.textBetween(from, to),
      href: hrefForModal(ed.getAttributes("link").href),
    });
    return true;
  }

  openLinkEditorRef.current = (pos) => {
    const ed = editorRef.current;
    if (!ed) return false;
    ed.chain().focus().setTextSelection(pos).extendMarkRange("link").run();
    return openLinkModalFromEditor(ed);
  };

  function insertLinkPlaceholder() {
    const ed = editorRef.current;
    if (!ed) return;
    const { from, empty } = ed.state.selection;
    if (!empty) {
      ed.chain().focus().setLink({ href: "https://" }).extendMarkRange("link").run();
    } else {
      ed.chain()
        .focus()
        .insertContent({
          type: "text",
          text: "LINK",
          marks: [{ type: "link", attrs: { href: "https://" } }],
        })
        .run();
      ed.chain().setTextSelection(from + 1).extendMarkRange("link").run();
    }
    openLinkModalFromEditor(ed);
  }

  function closeLinkModal() {
    setLinkModal(null);
    linkRangeRef.current = null;
  }

  function applyLinkModal() {
    const ed = editorRef.current;
    const range = linkRangeRef.current;
    if (!ed || !range || !linkModal) {
      closeLinkModal();
      return;
    }
    const text = String(linkModal.text || "").trim() || "LINK";
    const href = normalizeLinkHref(linkModal.href);
    ed.chain()
      .focus()
      .insertContentAt(
        { from: range.from, to: range.to },
        `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
      )
      .run();
    closeLinkModal();
  }

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
      insertLink() {
        insertLinkPlaceholder();
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
        .email-body-editor__content .email-body-editor__token {
          background: ${VIC_BLUE_LIGHT};
          border-radius: 3px;
          padding: 0 2px;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        .email-body-editor__content a.email-body-editor__link,
        .email-body-editor__content a {
          background: ${VIC_BLUE_LIGHT};
          color: ${MONUMENT};
          text-decoration: underline;
          border-radius: 3px;
          padding: 0 2px;
          cursor: pointer;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        .ProseMirror-focused {
          outline: none;
        }
      `}</style>
      {linkModal
        ? createPortal(
            <div
              role="presentation"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 4200,
                pointerEvents: "auto",
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="email-link-modal-title"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeLinkModal();
                  }
                  if (e.key === "Enter" && e.target?.tagName !== "TEXTAREA") {
                    e.preventDefault();
                    applyLinkModal();
                  }
                }}
                style={{
                  width: "min(460px, 92vw)",
                  background: WHITE,
                  borderRadius: "10px",
                  padding: "18px 16px 16px",
                  boxSizing: "border-box",
                  border: `1px solid ${SECTION_GREY}`,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                }}
              >
                <h3
                  id="email-link-modal-title"
                  style={{ margin: "0 0 14px 0", color: MONUMENT, fontSize: "1.05rem" }}
                >
                  Link
                </h3>
                <label
                  htmlFor="email-link-text"
                  style={{
                    display: "block",
                    fontSize: "0.9rem",
                    color: UI.textMuted,
                    marginBottom: "6px",
                    fontWeight: 500,
                  }}
                >
                  Text shown in email
                </label>
                <input
                  id="email-link-text"
                  type="text"
                  autoFocus
                  value={linkModal.text}
                  onChange={(e) => setLinkModal((prev) => ({ ...prev, text: e.target.value }))}
                  placeholder="Click here"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: outlineBorder,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    marginBottom: "12px",
                  }}
                />
                <label
                  htmlFor="email-link-href"
                  style={{
                    display: "block",
                    fontSize: "0.9rem",
                    color: UI.textMuted,
                    marginBottom: "6px",
                    fontWeight: 500,
                  }}
                >
                  Link
                </label>
                <input
                  id="email-link-href"
                  type="text"
                  value={linkModal.href}
                  onChange={(e) => setLinkModal((prev) => ({ ...prev, href: e.target.value }))}
                  placeholder="https://example.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: outlineBorder,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    marginBottom: "16px",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={closeLinkModal}
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      color: MONUMENT,
                      background: "transparent",
                      border: outlineBorder,
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyLinkModal}
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
});

export default EmailBodyEditor;
