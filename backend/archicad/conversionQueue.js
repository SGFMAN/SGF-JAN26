let processor = null;
const pending = [];
const queued = new Set();
let running = false;

function setProcessor(fn) {
  processor = fn;
}

function enqueue(id) {
  const key = String(id || "");
  if (!key || queued.has(key)) return;
  queued.add(key);
  pending.push(key);
  drain();
}

async function drain() {
  if (running || !processor) return;
  running = true;
  try {
    while (pending.length) {
      const id = pending.shift();
      queued.delete(id);
      try {
        await processor(id);
      } catch (error) {
        console.error("Archicad conversion failed:", error?.message || error);
      }
    }
  } finally {
    running = false;
    if (pending.length) drain();
  }
}

module.exports = { setProcessor, enqueue };
