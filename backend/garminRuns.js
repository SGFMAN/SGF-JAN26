/**
 * Read-only Garmin Connect runs for the Sandpit.
 * Uses Garmin's official Personal API. The API key and bearer token stay on the server.
 *
 * Activity list: GET /activitylist-service/activities/search/activities
 * Token: POST /personalapitoken-service/personal-api/personal-api-key/token
 * https://developer.garmin.com/gc-developer-program/personal/personal-api/
 */

const { getStaffUserIdFromRequest } = require("./staffIdentity");
const { userHasAccessGrant } = require("./userAccessPermissions");

const BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const ACTIVITIES_PATH = "/activitylist-service/activities/search/activities";
const PAGE_SIZE = 20;
const MAX_PAGES = 10;
const TOKEN_REFRESH_WINDOW_SECONDS = 60 * 60;

let tokenCache = null;

function activityRecords(value) {
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (value && typeof value === "object") {
    for (const key of ["activities", "activityList"]) {
      if (Array.isArray(value[key])) return value[key].filter((row) => row && typeof row === "object");
    }
  }
  return [];
}

function isRun(activity) {
  const type = activity.activityType;
  const key = typeof type === "string" ? type : type?.typeKey || "";
  const text = String(key).toLowerCase();
  if (!text) return true;
  return text.includes("run");
}

function activityTimestamp(activity) {
  const local = activity.startTimeLocal;
  if (typeof local === "string" && local.trim()) {
    const parsed = Date.parse(local.includes("T") ? local : local.replace(" ", "T"));
    if (Number.isFinite(parsed)) return parsed;
  }
  const gmt = activity.startTimeGMT;
  if (typeof gmt === "string" && gmt.trim()) {
    const normalised = gmt.includes("T") ? gmt : gmt.replace(" ", "T");
    const parsed = Date.parse(normalised.endsWith("Z") ? normalised : `${normalised}Z`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function localDateParts(activity) {
  const local = activity.startTimeLocal;
  if (typeof local !== "string") return null;
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return {
    monthKey: `${match[1]}-${match[2]}`,
    monthLabel: new Intl.DateTimeFormat("en-AU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
    date: new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
    ...weekParts(date),
  };
}

function weekParts(date) {
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear();
  const start = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(monday);
  const end = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(sunday);
  return {
    weekKey: monday.toISOString().slice(0, 10),
    weekLabel: `${start} – ${end}`,
  };
}

function formatDuration(seconds) {
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total < 0) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatDistanceKm(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return null;
  return (value / 1000).toFixed(2);
}

function formatPace(metersPerSecond) {
  const speed = Number(metersPerSecond);
  if (!Number.isFinite(speed) || speed <= 0) return null;
  const totalSeconds = Math.round(1000 / speed);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatWhole(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return String(Math.round(number));
}

function mapActivity(activity) {
  const when = localDateParts(activity);
  return {
    id: activity.activityId ?? null,
    date: when?.date ?? null,
    monthKey: when?.monthKey ?? null,
    monthLabel: when?.monthLabel ?? null,
    weekKey: when?.weekKey ?? null,
    weekLabel: when?.weekLabel ?? null,
    name: typeof activity.activityName === "string" && activity.activityName.trim()
      ? activity.activityName.trim()
      : "Untitled activity",
    distanceKm: formatDistanceKm(activity.distance),
    duration: formatDuration(activity.duration),
    pace: formatPace(activity.averageSpeed),
    averageHeartRate: formatWhole(activity.averageHR),
    maxHeartRate: formatWhole(activity.maxHR),
    averageCadence: formatWhole(activity.averageRunningCadenceInStepsPerMinute),
  };
}

function mapActivities(payload) {
  return activityRecords(payload)
    .filter(isRun)
    .map((activity) => ({ activity, sort: activityTimestamp(activity), row: mapActivity(activity) }))
    .sort((a, b) => b.sort - a.sort)
    .map((entry) => entry.row);
}

function jwtExpiry(token) {
  const part = String(token).split(".")[1];
  if (!part) return 0;
  const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  const exp = Number(json.exp);
  return Number.isFinite(exp) ? exp : 0;
}

async function obtainToken(apiKey, force) {
  const now = Date.now() / 1000;
  if (!force && tokenCache && tokenCache.key === apiKey && tokenCache.exp - now > TOKEN_REFRESH_WINDOW_SECONDS) {
    return tokenCache.token;
  }
  const response = await fetch(`${BASE_URL}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Accept: "*/*",
      Authorization: `ApiKey ${apiKey}`,
    },
  });
  const text = (await response.text()).trim();
  if (!response.ok) {
    const error = new Error("Garmin could not issue an access token.");
    error.status = response.status;
    throw error;
  }
  const exp = jwtExpiry(text);
  if (!exp) {
    const error = new Error("Garmin did not return a usable access token.");
    error.status = 502;
    throw error;
  }
  tokenCache = { key: apiKey, token: text, exp };
  return text;
}

async function searchRunningPage(token, start) {
  const url = new URL(ACTIVITIES_PATH, BASE_URL);
  url.searchParams.set("start", String(start));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("activityType", "running");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) {
    const error = new Error("unauthorized");
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    const error = new Error("Garmin could not return activities.");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function listRuns(apiKey) {
  let token = await obtainToken(apiKey, false);
  let payload;
  try {
    payload = await collectPages(token);
  } catch (error) {
    if (error.status !== 401) throw error;
    tokenCache = null;
    token = await obtainToken(apiKey, true);
    payload = await collectPages(token);
  }
  return payload;
}

async function collectPages(token) {
  const combined = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await searchRunningPage(token, page * PAGE_SIZE);
    const records = activityRecords(payload);
    combined.push(...records);
    if (records.length < PAGE_SIZE) break;
  }
  return mapActivities(combined);
}

function registerGarminRuns(app, { pool }) {
  app.get("/api/sandpit/garmin-runs", async (req, res) => {
    try {
      const userId = getStaffUserIdFromRequest(req);
      if (!Number.isFinite(userId)) {
        res.status(401).json({ ok: false, error: "Sign in required." });
        return;
      }
      if (!pool) {
        res.status(503).json({ ok: false, error: "Sandpit access could not be checked." });
        return;
      }
      const allowed = await userHasAccessGrant(pool, userId, "sandpit");
      if (!allowed) {
        res.status(403).json({ ok: false, error: "Sandpit access required." });
        return;
      }
      const apiKey = String(process.env.GARMIN_PERSONAL_API_KEY || "").trim();
      if (!apiKey) {
        res.status(503).json({
          ok: false,
          code: "not_configured",
          error: "The Garmin Personal API key is not set on the server.",
        });
        return;
      }
      const runs = await listRuns(apiKey);
      res.json({ ok: true, runs });
    } catch (error) {
      console.error("Garmin runs request failed:", error.status || error.message);
      res.status(502).json({
        ok: false,
        error: error.message || "Garmin runs could not be loaded.",
      });
    }
  });
}

module.exports = {
  registerGarminRuns,
  mapActivities,
  activityRecords,
  formatPace,
  formatDuration,
};
