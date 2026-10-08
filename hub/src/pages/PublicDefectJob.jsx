import { useEffect, useState } from "react";
import "./PublicDefectJob.css";

function longDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${+d}/${+m}/${y}`;
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 500;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
function readVideoFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_VIDEO_BYTES) {
      reject(new Error(`Video too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) — keep videos under 25 MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function processMediaFile(file) {
  return file.type.startsWith("video/") ? readVideoFile(file) : resizeImage(file);
}

function mediaTag(src, key, onClick) {
  const isVideo = /^data:video\//i.test(src);
  return isVideo ? (
    <video key={key} src={src} muted playsInline preload="metadata" onClick={() => onClick(src)} />
  ) : (
    <img key={key} src={src} alt="Job photo" loading="lazy" onClick={() => onClick(src)} />
  );
}

export default function PublicDefectJob() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";
  const code = params.get("code") || "";

  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [author, setAuthor] = useState(localStorage.getItem("sgfhub_contractor_name") || "");
  const [savingNote, setSavingNote] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [confirming, setConfirming] = useState(false);

  async function api(path, opts) {
    const sep = path.indexOf("?") >= 0 ? "&" : "?";
    const res = await fetch(path + sep + "code=" + encodeURIComponent(code), {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* no body */
    }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  useEffect(() => {
    if (!id || !code) {
      setError("This link is missing its access code — copy the full contractor link, not just the page address.");
      setLoading(false);
      return;
    }
    api(`/api/public/defects/${id}`)
      .then(setJob)
      .catch(() => setError("This link isn't valid any more. Ask the office for a new one."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="pdj-shell"><div className="pdj-banner">Loading…</div></div>;
  if (error || !job) return <div className="pdj-shell"><div className="pdj-banner">{error || "Not found"}</div></div>;

  const confirmed = !!job.bookInDate && job.bookInDate === job.date;
  const status = (() => {
    const missing = [];
    if (!job.bookInDate || job.bookInDate !== job.date) missing.push("Awaiting your confirmation");
    if (job.confirmed !== "yes") missing.push("Awaiting customer confirmation");
    return missing.length ? { ok: false, text: missing.join(" · ") } : { ok: true, text: "Good to go" };
  })();

  async function confirmBookin() {
    setConfirming(true);
    try {
      const fresh = await api(`/api/public/defects/${id}/bookin`, { method: "PATCH", body: JSON.stringify({ date: job.date }) });
      setJob(fresh);
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      if (author.trim()) localStorage.setItem("sgfhub_contractor_name", author.trim());
      await api(`/api/public/defects/${id}/notes`, { method: "POST", body: JSON.stringify({ text: newNote.trim(), author: author.trim() }) });
      const fresh = await api(`/api/public/defects/${id}`);
      setJob(fresh);
      setNewNote("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingNote(false);
    }
  }

  async function handlePhotoInput(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoBusy(true);
    setPhotoMsg("");
    const urls = [];
    const errors = [];
    for (const file of files) {
      try {
        urls.push(await processMediaFile(file));
      } catch (err) {
        errors.push(err.message || `Could not add ${file.name}`);
      }
    }
    try {
      if (urls.length) {
        const fresh = await api(`/api/public/defects/${id}/photos`, { method: "POST", body: JSON.stringify({ photos: urls }) });
        setJob(fresh);
      }
      if (errors.length) setPhotoMsg(errors.join(" "));
    } catch (err) {
      setPhotoMsg(err.message);
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="pdj-shell">
      <div className="pdj-page">
        <div className="pdj-card">
          <h1>
            <span className={"pdj-dot " + (status.ok ? "ok" : "bad")} />
            {job.address || "Defect job"}
          </h1>
          <p className={"pdj-status " + (status.ok ? "ok" : "bad")}>{status.text}</p>
          <div className="pdj-grid">
            <div>
              <span>Customer</span>
              {job.customerName || "—"}
            </div>
            <div>
              <span>Phone</span>
              {job.customerPhone || "—"}
            </div>
            <div>
              <span>Email</span>
              {job.customerEmail || "—"}
            </div>
            <div>
              <span>Scheduled</span>
              {[job.date ? longDate(job.date) : null, job.timeStart].filter(Boolean).join(" ") || "Not yet scheduled"}
            </div>
            <div>
              <span>Your confirmation</span>
              {!job.date ? (
                "Not yet scheduled"
              ) : confirmed ? (
                <span style={{ color: "#2e8b4f", fontWeight: 700 }}>&#10003; Confirmed</span>
              ) : (
                <button className="pdj-btn" onClick={confirmBookin} disabled={confirming}>
                  {confirming ? "Confirming…" : "Confirm this date & time"}
                </button>
              )}
            </div>
            <div>
              <span>Status</span>
              {job.completed ? "Completed" : "Open"}
            </div>
            {job.notes && (
              <div className="pdj-full">
                <span>Brief / instructions</span>
                <div className="pdj-notesbox">{job.notes}</div>
              </div>
            )}
          </div>
        </div>

        <div className="pdj-card">
          <h2>Photos</h2>
          <div className="pdj-photogroup">
            <div className="pdj-lbl">On-site / repair area</div>
            {job.photos?.length ? (
              <div className="pdj-photogrid">{job.photos.map((src, i) => mediaTag(src, i, setLightbox))}</div>
            ) : (
              <div className="pdj-empty">No photos yet.</div>
            )}
          </div>
          {job.completionPhotos?.length > 0 && (
            <div className="pdj-photogroup">
              <div className="pdj-lbl">Completion</div>
              <div className="pdj-photogrid">{job.completionPhotos.map((src, i) => mediaTag(src, i, setLightbox))}</div>
            </div>
          )}
          <label className="pdj-drop">
            {photoBusy ? "Uploading…" : "Click to add photos or videos from site"}
            <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={handlePhotoInput} />
          </label>
          {photoMsg && <div className="pdj-error">{photoMsg}</div>}
        </div>

        <div className="pdj-card">
          <h2>Notes</h2>
          <div className="pdj-notes">
            {(job.noteLog || []).map((n) => (
              <div key={n.id} className="pdj-note">
                <div className="pdj-note-meta">
                  {n.authorName || n.author || ""} · {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                </div>
                <div className="pdj-note-body">{n.body || n.text}</div>
              </div>
            ))}
            {!(job.noteLog || []).length && <div className="pdj-empty">No notes yet.</div>}
          </div>
          <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note — progress update, access issue, question…" />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
          <button className="pdj-btn-primary" onClick={addNote} disabled={!newNote.trim() || savingNote}>
            {savingNote ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>

      {lightbox && (
        <div className="pdj-lightbox show" onClick={() => setLightbox(null)}>
          {/^data:video\//i.test(lightbox) ? <video src={lightbox} controls autoPlay playsInline /> : <img src={lightbox} alt="Full size" />}
        </div>
      )}
    </div>
  );
}
