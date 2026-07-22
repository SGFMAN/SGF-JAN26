import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getApiHeaders, getLoggedInUserId } from "../utils/auth";
import { clearUserAccessCache } from "../utils/userAccess";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;

const API_URL = "";
const ONLINE_POLL_MS = 2_000;

export default function Permissions() {
  const [areas, setAreas] = useState([]);
  const [users, setUsers] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const matrixRef = useRef(matrix);

  matrixRef.current = matrix;

  const onlineUserIdSet = useMemo(
    () => new Set(onlineUserIds.map((id) => String(id))),
    [onlineUserIds]
  );

  const onlineCount = useMemo(
    () => users.filter((user) => onlineUserIdSet.has(String(user.id))).length,
    [users, onlineUserIdSet]
  );

  const loadOnlineUsers = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/access-permissions/online`, {
      headers: getApiHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Failed to load online users");
    }
    setOnlineUserIds(Array.isArray(data.onlineUserIds) ? data.onlineUserIds : []);
  }, []);

  const loadPermissions = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/access-permissions`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Failed to load permissions");
    }
    setAreas(Array.isArray(data.areas) ? data.areas : []);
    setUsers(Array.isArray(data.users) ? data.users : []);
    setMatrix(data.matrix && typeof data.matrix === "object" ? data.matrix : {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadPermissions();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load permissions");
          setAreas([]);
          setUsers([]);
          setMatrix({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadPermissions]);

  useEffect(() => {
    let cancelled = false;

    const refreshOnline = async () => {
      try {
        await loadOnlineUsers();
      } catch {
        if (!cancelled) {
          setOnlineUserIds([]);
        }
      }
    };

    refreshOnline();
    const intervalId = window.setInterval(refreshOnline, ONLINE_POLL_MS);

    const handleVisibility = () => {
      if (!document.hidden) {
        refreshOnline();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadOnlineUsers]);

  const handleToggle = useCallback(async (userId, accessArea, nextGranted) => {
    const previousGranted = matrixRef.current[userId]?.[accessArea] === true;

    setMatrix((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [accessArea]: nextGranted,
      },
    }));
    setSaveError(null);

    try {
      const response = await fetch(`${API_URL}/api/access-permissions`, {
        method: "PUT",
        headers: {
          ...getApiHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          accessArea,
          granted: nextGranted,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save permission");
      }

      if (String(userId) === String(getLoggedInUserId())) {
        clearUserAccessCache();
      }
    } catch (err) {
      setMatrix((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          [accessArea]: previousGranted,
        },
      }));
      setSaveError(err.message || "Failed to save permission");
    }
  }, []);

  const permissionAreas = useMemo(() => {
    const byKey = Object.fromEntries(areas.map((area) => [area.key, area]));
    return ["admin", "managers", "sales"]
      .map((key) => byKey[key])
      .filter(Boolean);
  }, [areas]);

  const grantedCountByArea = useMemo(() => {
    const counts = {};
    for (const area of permissionAreas) {
      counts[area.key] = users.filter((user) => matrix[user.id]?.[area.key] === true).length;
    }
    return counts;
  }, [users, matrix, permissionAreas]);

  const checkboxCols = permissionAreas.length > 0 ? ` repeat(${permissionAreas.length}, 72px)` : "";
  const columnTemplate = `max-content max-content 72px${checkboxCols}`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "28px 32px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignSelf: "stretch",
        overflow: "hidden",
        alignItems: "flex-start",
      }}
    >
      <h2
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.5rem",
          fontWeight: 700,
          color: MONUMENT,
          textAlign: "left",
        }}
      >
        Permissions
      </h2>

      {loading && (
        <p style={{ margin: 0, color: UI.textMuted }}>Loading permissions…</p>
      )}

      {error && !loading && (
        <p style={{ margin: 0, color: "#cc3333" }}>{error}</p>
      )}

      {!loading && !error && users.length === 0 && (
        <p style={{ margin: 0, color: UI.textMuted }}>No users found.</p>
      )}

      {!loading && !error && users.length > 0 && areas.length > 0 && (
        <div
          style={{
            overflow: "auto",
            flex: 1,
            width: "100%",
            alignSelf: "stretch",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: columnTemplate,
              columnGap: "16px",
              rowGap: "0",
              width: "max-content",
              maxWidth: "100%",
            }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: UI.panelBg,
                padding: "0 4px 10px 0",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: MONUMENT,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              User
            </div>
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: UI.panelBg,
                padding: "0 0 10px 0",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: MONUMENT,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              Password
            </div>
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: UI.panelBg,
                padding: "0 4px 10px",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: MONUMENT,
                textAlign: "center",
              }}
            >
              <div>Logged on</div>
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: UI.textMuted,
                  lineHeight: 1.2,
                }}
              >
                {onlineCount} / {users.length}
              </div>
            </div>
            {permissionAreas.map((area) => (
              <div
                key={area.key}
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: UI.panelBg,
                  padding: "0 4px 10px",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  color: MONUMENT,
                  textAlign: "center",
                }}
              >
                <div>{area.label}</div>
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    color: UI.textMuted,
                    lineHeight: 1.2,
                  }}
                >
                  {grantedCountByArea[area.key] ?? 0} / {users.length}
                </div>
              </div>
            ))}

            {users.map((user, rowIndex) => (
              <React.Fragment key={user.id}>
                <div
                  style={{
                    padding: "9px 0",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    textAlign: "left",
                    lineHeight: 1.35,
                    whiteSpace: "nowrap",
                    borderTop: rowIndex === 0 ? "none" : `1px solid ${UI.outline}`,
                  }}
                >
                  {user.name || `User #${user.id}`}
                </div>
                <div
                  style={{
                    padding: "9px 0",
                    fontSize: "0.95rem",
                    fontWeight: 400,
                    color: MONUMENT,
                    textAlign: "left",
                    lineHeight: 1.35,
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                    borderTop: rowIndex === 0 ? "none" : `1px solid ${UI.outline}`,
                  }}
                >
                  {user.password || "admin"}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "9px 4px",
                    borderTop: rowIndex === 0 ? "none" : `1px solid ${UI.outline}`,
                  }}
                >
                  {onlineUserIdSet.has(String(user.id)) ? (
                    <span
                      title="Logged on"
                      aria-label={`${user.name || "User"} is logged on`}
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#33cc33",
                        boxShadow: "0 0 0 2px rgba(51, 204, 51, 0.25)",
                        display: "inline-block",
                      }}
                    />
                  ) : null}
                </div>
                {permissionAreas.map((area) => {
                  const checked = matrix[user.id]?.[area.key] === true;
                  return (
                    <div
                      key={`${user.id}-${area.key}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "7px 4px",
                        borderTop: rowIndex === 0 ? "none" : `1px solid ${UI.outline}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleToggle(user.id, area.key, e.target.checked)}
                        aria-label={`${user.name || "User"} — ${area.label}`}
                        style={{
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                          accentColor: MONUMENT,
                        }}
                      />
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {saveError && (
        <p style={{ margin: "12px 0 0 0", color: "#cc3333", fontSize: "0.9rem" }}>
          {saveError}
        </p>
      )}
    </div>
  );
}
