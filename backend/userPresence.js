/** In-memory last-seen timestamps for logged-in users (tab session + API activity). */
const PRESENCE_TIMEOUT_MS = 25_000;

/** @type {Map<number, number>} */
const userLastSeen = new Map();

function touchUserPresence(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return;
  userLastSeen.set(id, Date.now());
}

function clearUserPresence(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return;
  userLastSeen.delete(id);
}

function pruneStalePresence(now = Date.now()) {
  for (const [userId, lastSeen] of userLastSeen) {
    if (now - lastSeen > PRESENCE_TIMEOUT_MS) {
      userLastSeen.delete(userId);
    }
  }
}

function getOnlineUserIds(now = Date.now()) {
  pruneStalePresence(now);
  return [...userLastSeen.keys()].sort((a, b) => a - b);
}

function isUserOnline(userId, now = Date.now()) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return false;
  const lastSeen = userLastSeen.get(id);
  if (lastSeen == null) return false;
  if (now - lastSeen > PRESENCE_TIMEOUT_MS) {
    userLastSeen.delete(id);
    return false;
  }
  return true;
}

module.exports = {
  PRESENCE_TIMEOUT_MS,
  touchUserPresence,
  clearUserPresence,
  getOnlineUserIds,
  isUserOnline,
};
