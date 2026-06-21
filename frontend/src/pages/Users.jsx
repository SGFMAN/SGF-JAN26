import React, { useEffect, useState } from "react";

import { UI } from "../utils/uiThemeTokens.js";
import { UI_THEME_LIST } from "../themes/uiThemes.js";
import { getThemeDisplayName } from "../utils/uiThemeSettings.js";
import { getApiHeaders } from "../utils/auth.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("admin");
  const [selectedPositionIds, setSelectedPositionIds] = useState([]);
  const [primaryPositionId, setPrimaryPositionId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [detailsPassword, setDetailsPassword] = useState("");
  const [detailsUiThemeId, setDetailsUiThemeId] = useState("classic");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingPalette, setIsSavingPalette] = useState(false);
  
  // Positions state
  const [positions, setPositions] = useState([]);
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [showNewPositionModal, setShowNewPositionModal] = useState(false);
  const [showEditPositionModal, setShowEditPositionModal] = useState(false);
  const [showDeletePositionModal, setShowDeletePositionModal] = useState(false);
  const [newPositionName, setNewPositionName] = useState("");
  const [isSubmittingPosition, setIsSubmittingPosition] = useState(false);
  const [isDeletingPosition, setIsDeletingPosition] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchPositions();
  }, []);

  useEffect(() => {
    const user = users.find((u) => u.id === parseInt(selectedUserId, 10));
    setDetailsPassword(user?.password || "admin");
    setDetailsUiThemeId(user?.ui_theme_id || "classic");
  }, [selectedUserId, users]);

  async function fetchUsers() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleNewUser() {
    setNewUserName("");
    setNewUserEmail("");
    setNewUserPhone("");
    setNewUserPassword("admin");
    setSelectedPositionIds([]);
    setPrimaryPositionId(null);
    setShowNewUserModal(true);
  }

  function handleEditUser() {
    const user = users.find((u) => u.id === parseInt(selectedUserId));
    if (!user) {
      alert("Please select a user to edit");
      return;
    }
    // Pre-fill form with current user data
    setNewUserName(user.name || "");
    setNewUserEmail(user.email || "");
    setNewUserPhone(user.phone || "");
    setNewUserPassword(user.password || "admin");
    // Set primary position from user data
    setPrimaryPositionId(user.primary_position_id || null);
    // Also set selectedPositionIds to include all positions (for backward compatibility)
    setSelectedPositionIds(user.positions && Array.isArray(user.positions) 
      ? user.positions.map((p) => p.id) 
      : []);
    setShowEditUserModal(true);
  }

  function handleDeleteUser() {
    const user = users.find((u) => u.id === parseInt(selectedUserId));
    if (!user) {
      alert("Please select a user to delete");
      return;
    }
    setShowDeleteUserModal(true);
  }

  function handleCloseEditModal() {
    setShowEditUserModal(false);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserPhone("");
    setNewUserPassword("admin");
    setSelectedPositionIds([]);
    setPrimaryPositionId(null);
  }

  function handleCloseModal() {
    setShowNewUserModal(false);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserPhone("");
    setNewUserPassword("admin");
    setSelectedPositionIds([]);
    setPrimaryPositionId(null);
  }

  function handlePositionToggle(positionId) {
    const id = parseInt(positionId);
    setSelectedPositionIds((prev) => {
      if (prev.includes(id)) {
        // If removing this position and it's the primary, clear primary
        if (primaryPositionId === id) {
          setPrimaryPositionId(null);
        }
        return prev.filter((pid) => pid !== id);
      } else {
        return [...prev, id];
      }
    });
  }

  function handlePrimaryPositionChange(positionId) {
    const id = parseInt(positionId);
    // If clicking the same position that's already primary, uncheck it
    if (primaryPositionId === id) {
      setPrimaryPositionId(null);
    } else {
      // Only allow setting primary position if the position is in selectedPositionIds
      if (selectedPositionIds.includes(id)) {
        setPrimaryPositionId(id);
      } else {
        // If position is not selected, first add it to selected positions
        setSelectedPositionIds((prev) => [...prev, id]);
        setPrimaryPositionId(id);
      }
    }
  }

  async function fetchPositions() {
    try {
      setLoadingPositions(true);
      const response = await fetch(`${API_URL}/api/positions`);
      if (!response.ok) {
        throw new Error("Failed to fetch positions");
      }
      const data = await response.json();
      setPositions(data);
    } catch (error) {
      console.error("Error fetching positions:", error);
    } finally {
      setLoadingPositions(false);
    }
  }

  function handleNewPosition() {
    setShowNewPositionModal(true);
  }

  function handleEditPosition() {
    const position = positions.find((p) => p.id === parseInt(selectedPositionId));
    if (!position) {
      alert("Please select a position to edit");
      return;
    }
    setNewPositionName(position.name || "");
    setShowEditPositionModal(true);
  }

  function handleDeletePosition() {
    const position = positions.find((p) => p.id === parseInt(selectedPositionId));
    if (!position) {
      alert("Please select a position to delete");
      return;
    }
    setShowDeletePositionModal(true);
  }

  function handleCloseNewPositionModal() {
    setShowNewPositionModal(false);
    setNewPositionName("");
  }

  function handleCloseEditPositionModal() {
    setShowEditPositionModal(false);
    setNewPositionName("");
  }

  function handleClosePositionModal() {
    setShowNewPositionModal(false);
    setShowEditPositionModal(false);
    setNewPositionName("");
  }

  async function handleCreateUser() {
    if (!newUserName.trim()) {
      alert("Name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim() || null,
          phone: newUserPhone.trim() || null,
          password: newUserPassword.trim() || "admin",
          // Include primary position in positionIds for backward compatibility
          positionIds: primaryPositionId ? [primaryPositionId, ...selectedPositionIds.filter(id => id !== primaryPositionId)] : selectedPositionIds,
          primaryPositionId: primaryPositionId || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to create user");
      }

      // Refresh users list
      await fetchUsers();
      handleCloseModal();
    } catch (error) {
      console.error("Error creating user:", error);
      alert(error.message || "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSavePalette() {
    const user = users.find((u) => u.id === parseInt(selectedUserId, 10));
    if (!user) return;

    if ((user.ui_theme_id || "classic") === detailsUiThemeId) return;

    setIsSavingPalette(true);
    try {
      const userPositionIds =
        user.positions && Array.isArray(user.positions) ? user.positions.map((p) => p.id) : [];

      const response = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({
          name: user.name,
          email: user.email || null,
          phone: user.phone || null,
          password: user.password || "admin",
          positionIds: userPositionIds,
          primaryPositionId: user.primary_position_id || null,
          uiThemeId: detailsUiThemeId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to update palette");
      }

      await fetchUsers();
    } catch (error) {
      console.error("Error updating palette:", error);
      alert(error.message || "Failed to update palette");
    } finally {
      setIsSavingPalette(false);
    }
  }

  async function handleSavePassword() {
    const user = users.find((u) => u.id === parseInt(selectedUserId, 10));
    if (!user) {
      return;
    }

    const trimmedPassword = detailsPassword.trim();
    if (!trimmedPassword) {
      alert("Password cannot be empty");
      return;
    }

    if (trimmedPassword === (user.password || "admin")) {
      return;
    }

    setIsSavingPassword(true);
    try {
      const userPositionIds = user.positions && Array.isArray(user.positions)
        ? user.positions.map((p) => p.id)
        : [];

      const response = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: "PUT",
        headers: getApiHeaders(),
        body: JSON.stringify({
          name: user.name,
          email: user.email || null,
          phone: user.phone || null,
          password: trimmedPassword,
          positionIds: userPositionIds,
          primaryPositionId: user.primary_position_id || null,
          uiThemeId: user.ui_theme_id || detailsUiThemeId || "classic",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to update password");
      }

      await fetchUsers();
      setSelectedUserId(selectedUserId);
    } catch (error) {
      console.error("Error updating password:", error);
      alert(error.message || "Failed to update password");
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleUpdatePrimaryPosition(positionId) {
    const user = users.find((u) => u.id === parseInt(selectedUserId));
    if (!user) {
      return;
    }

    // If clicking the same position that's already primary, unset it
    const newPrimaryPositionId = user.primary_position_id === positionId ? null : positionId;

    try {
      // Get all position IDs for this user
      const userPositionIds = user.positions && Array.isArray(user.positions) 
        ? user.positions.map((p) => p.id) 
        : [];

      const response = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: user.name,
          email: user.email || null,
          phone: user.phone || null,
          positionIds: userPositionIds,
          primaryPositionId: newPrimaryPositionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to update primary position");
      }

      // Refresh users list to show updated primary position
      await fetchUsers();
      // Keep the same user selected
      setSelectedUserId(selectedUserId);
    } catch (error) {
      console.error("Error updating primary position:", error);
      alert(error.message || "Failed to update primary position");
    }
  }

  async function handleUpdateUser() {
    const user = users.find((u) => u.id === parseInt(selectedUserId));
    if (!user || !newUserName.trim()) {
      alert("Name is required");
      return;
    }

    const currentSelectedId = selectedUserId; // Save the currently selected user ID

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim() || null,
          phone: newUserPhone.trim() || null,
          password: newUserPassword.trim() || "admin",
          // Include primary position in positionIds for backward compatibility
          positionIds: primaryPositionId ? [primaryPositionId, ...selectedPositionIds.filter(id => id !== primaryPositionId)] : selectedPositionIds,
          primaryPositionId: primaryPositionId || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to update user");
      }

      // Refresh users list
      await fetchUsers();
      handleCloseEditModal();
      // Keep the same user selected after update
      setSelectedUserId(currentSelectedId);
    } catch (error) {
      console.error("Error updating user:", error);
      alert(error.message || "Failed to update user");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDeleteUser() {
    const user = users.find((u) => u.id === parseInt(selectedUserId));
    if (!user) return;

    setIsDeletingUser(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to delete user");
      }

      // Refresh users list and clear selection
      await fetchUsers();
      setSelectedUserId("");
      setShowDeleteUserModal(false);
    } catch (error) {
      console.error("Error deleting user:", error);
      alert(error.message || "Failed to delete user");
    } finally {
      setIsDeletingUser(false);
    }
  }

  async function handleCreatePosition() {
    if (!newPositionName.trim()) {
      alert("Position name is required");
      return;
    }

    setIsSubmittingPosition(true);
    try {
      const response = await fetch(`${API_URL}/api/positions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newPositionName.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to create position");
      }

      // Refresh positions list
      await fetchPositions();
      handleCloseNewPositionModal();
    } catch (error) {
      console.error("Error creating position:", error);
      alert(error.message || "Failed to create position");
    } finally {
      setIsSubmittingPosition(false);
    }
  }

  async function handleUpdatePosition() {
    const position = positions.find((p) => p.id === parseInt(selectedPositionId));
    if (!position || !newPositionName.trim()) {
      alert("Position name is required");
      return;
    }

    const currentSelectedId = selectedPositionId; // Save the currently selected position ID

    setIsSubmittingPosition(true);
    try {
      const response = await fetch(`${API_URL}/api/positions/${position.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newPositionName.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to update position");
      }

      // Refresh positions list
      await fetchPositions();
      handleCloseEditPositionModal();
      // Keep the same position selected after update
      setSelectedPositionId(currentSelectedId);
    } catch (error) {
      console.error("Error updating position:", error);
      alert(error.message || "Failed to update position");
    } finally {
      setIsSubmittingPosition(false);
    }
  }

  async function handleConfirmDeletePosition() {
    const position = positions.find((p) => p.id === parseInt(selectedPositionId));
    if (!position) return;

    setIsDeletingPosition(true);
    try {
      const response = await fetch(`${API_URL}/api/positions/${position.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to delete position");
      }

      // Refresh positions list and clear selection
      await fetchPositions();
      setSelectedPositionId("");
      setShowDeletePositionModal(false);
    } catch (error) {
      console.error("Error deleting position:", error);
      alert(error.message || "Failed to delete position");
    } finally {
      setIsDeletingPosition(false);
    }
  }

  const selectedUser = users.find((user) => user.id === parseInt(selectedUserId));

  return (
    <div style={{ width: "100%", padding: "24px", display: "flex", gap: "24px", height: "100%" }}>
      {/* Column 1: Left - Controls */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
          Users
        </h2>
        
        <div style={{ width: "100%", maxWidth: "500px", marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: UI.textMuted,
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            Select User
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
              cursor: "pointer",
              marginBottom: "16px",
            }}
          >
            <option value="">
              {loading ? "Loading..." : users.length === 0 ? "<No Users>" : "Select a user"}
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          
          <div style={{ display: "flex", gap: "16px" }}>
            <button
              onClick={handleNewUser}
              style={{
                flex: 1,
                background: WHITE,
                color: MONUMENT,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.17s",
                height: "42px",
              }}
              type="button"
            >
              New User
            </button>
            <button
              onClick={handleEditUser}
              disabled={!selectedUser}
              style={{
                flex: 1,
                background: WHITE,
                color: MONUMENT,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: selectedUser ? "pointer" : "not-allowed",
                transition: "background 0.17s",
                height: "42px",
                opacity: selectedUser ? 1 : 0.6,
              }}
              type="button"
            >
              Edit User
            </button>
            <button
              onClick={handleDeleteUser}
              disabled={!selectedUser}
              style={{
                flex: 1,
                background: "#dc3545",
                color: PAGE_TEXT,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: selectedUser ? "pointer" : "not-allowed",
                transition: "background 0.17s",
                height: "42px",
                opacity: selectedUser ? 1 : 0.6,
              }}
              type="button"
            >
              Delete User
            </button>
          </div>
        </div>

        {/* Positions Section */}
        <div style={{ width: "100%", maxWidth: "500px", marginTop: "48px" }}>
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
            Positions
          </h2>
          
          <div style={{ width: "100%", maxWidth: "500px", marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: UI.textMuted,
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Select Position
            </label>
            <select
              value={selectedPositionId}
              onChange={(e) => setSelectedPositionId(e.target.value)}
              disabled={loadingPositions}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                cursor: "pointer",
                marginBottom: "16px",
              }}
            >
              <option value="">
                {loadingPositions ? "Loading..." : positions.length === 0 ? "<No Positions>" : "Select a position"}
              </option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </select>
            
            <div style={{ display: "flex", gap: "16px" }}>
              <button
                onClick={handleNewPosition}
                style={{
                  flex: 1,
                  background: WHITE,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.17s",
                  height: "42px",
                }}
                type="button"
              >
                New Position
              </button>
              <button
                onClick={handleEditPosition}
                disabled={!selectedPositionId}
                style={{
                  flex: 1,
                  background: WHITE,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: selectedPositionId ? "pointer" : "not-allowed",
                  transition: "background 0.17s",
                  height: "42px",
                  opacity: selectedPositionId ? 1 : 0.6,
                }}
                type="button"
              >
                Edit Position
              </button>
              <button
                onClick={handleDeletePosition}
                disabled={!selectedPositionId}
                style={{
                  flex: 1,
                  background: "#dc3545",
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: selectedPositionId ? "pointer" : "not-allowed",
                  transition: "background 0.17s",
                  height: "42px",
                  opacity: selectedPositionId ? 1 : 0.6,
                }}
                type="button"
              >
                Delete Position
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Column 2: Right - User Details */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
          User Details
        </h2>
        
        {selectedUser ? (
          <div style={{ width: "100%", maxWidth: "500px" }}>
            {/* Line 1: Name and Phone */}
            <div style={{ marginBottom: "16px", display: "flex", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Name
                </div>
                <div style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}>
                  {selectedUser.name || "—"}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Phone
                </div>
                <div style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}>
                  {selectedUser.phone || "—"}
                </div>
              </div>
            </div>

            {/* Line 2: Email */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                Email
              </div>
              <div style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
              }}>
                {selectedUser.email || "—"}
              </div>
            </div>

            {/* Palette */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                Palette
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <select
                  value={detailsUiThemeId || "classic"}
                  onChange={(e) => setDetailsUiThemeId(e.target.value)}
                  disabled={isSavingPalette}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: isSavingPalette ? "wait" : "pointer",
                  }}
                >
                  {UI_THEME_LIST.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSavePalette}
                  disabled={
                    isSavingPalette ||
                    (selectedUser.ui_theme_id || "classic") === (detailsUiThemeId || "classic")
                  }
                  style={{
                    background: WHITE,
                    color: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    cursor:
                      isSavingPalette ||
                      (selectedUser.ui_theme_id || "classic") === (detailsUiThemeId || "classic")
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      isSavingPalette ||
                      (selectedUser.ui_theme_id || "classic") === (detailsUiThemeId || "classic")
                        ? 0.6
                        : 1,
                    whiteSpace: "nowrap",
                    height: "42px",
                  }}
                >
                  {isSavingPalette ? "Saving…" : "Save"}
                </button>
              </div>
              <p style={{ margin: "8px 0 0 0", fontSize: "0.85rem", color: UI.textMuted }}>
                Current: {getThemeDisplayName(selectedUser.ui_theme_id || "classic")}
              </p>
            </div>

            {/* Password */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                Password
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <input
                  type="text"
                  value={detailsPassword}
                  onChange={(e) => setDetailsPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSavePassword();
                    }
                  }}
                  disabled={isSavingPassword}
                  placeholder="Enter password"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={
                    isSavingPassword ||
                    !detailsPassword.trim() ||
                    detailsPassword.trim() === (selectedUser.password || "admin")
                  }
                  style={{
                    background: WHITE,
                    color: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    cursor:
                      isSavingPassword ||
                      !detailsPassword.trim() ||
                      detailsPassword.trim() === (selectedUser.password || "admin")
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      isSavingPassword ||
                      !detailsPassword.trim() ||
                      detailsPassword.trim() === (selectedUser.password || "admin")
                        ? 0.6
                        : 1,
                    whiteSpace: "nowrap",
                    height: "42px",
                  }}
                >
                  {isSavingPassword ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            {/* Line 3: Positions */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                Positions
              </div>
              <div style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #e0e0e0",
                fontSize: "1rem",
                color: MONUMENT,
                background: UI.inputBg,
                boxSizing: "border-box",
                minHeight: "42px",
              }}>
                {selectedUser.positions && selectedUser.positions.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {selectedUser.positions.map((position) => (
                      <label
                        key={position.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          fontSize: "1rem",
                          color: MONUMENT,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUser.primary_position_id === position.id}
                          onChange={() => handleUpdatePrimaryPosition(position.id)}
                          style={{
                            marginRight: "10px",
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                          }}
                        />
                        {position.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: UI.textMuted, fontSize: "0.95rem" }}>
            Select a user to view details
          </div>
        )}
      </div>

      {/* New User Modal */}
      {showNewUserModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                color: MONUMENT,
                marginTop: 0,
                marginBottom: "24px",
                fontWeight: 600,
              }}
            >
              New User
            </h2>
            
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Name *
              </label>
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Enter name"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="Enter email"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Number
              </label>
              <input
                type="tel"
                value={newUserPhone}
                onChange={(e) => setNewUserPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter phone number"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Password
              </label>
              <input
                type="text"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Enter password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "12px",
                  fontWeight: 500,
                }}
              >
                Positions
              </label>
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  padding: "12px",
                  background: UI.inputBg,
                }}
              >
                {positions.length === 0 ? (
                  <div style={{ color: "#999", fontSize: "0.9rem" }}>
                    No positions available. Add positions first.
                  </div>
                ) : (
                  positions.map((position) => (
                    <label
                      key={position.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "12px",
                        cursor: "pointer",
                        fontSize: "1rem",
                        color: MONUMENT,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPositionIds.includes(position.id)}
                        onChange={() => handlePositionToggle(position.id)}
                        style={{
                          marginRight: "10px",
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                        }}
                      />
                      {position.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "12px",
                  fontWeight: 500,
                }}
              >
                Primary Position
              </label>
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  padding: "12px",
                  background: UI.inputBg,
                }}
              >
                {positions.length === 0 ? (
                  <div style={{ color: "#999", fontSize: "0.9rem" }}>
                    No positions available. Add positions first.
                  </div>
                ) : (
                  positions.map((position) => (
                    <label
                      key={position.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "12px",
                        cursor: "pointer",
                        fontSize: "1rem",
                        color: MONUMENT,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={primaryPositionId === position.id}
                        onChange={() => handlePrimaryPositionChange(position.id)}
                        style={{
                          marginRight: "10px",
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                        }}
                      />
                      {position.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={handleCloseModal}
                disabled={isSubmitting}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isSubmitting}
                style={{
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                type="button"
              >
                {isSubmitting ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseEditModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                color: MONUMENT,
                marginTop: 0,
                marginBottom: "24px",
                fontWeight: 600,
              }}
            >
              Edit User
            </h2>
            
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Name *
              </label>
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Enter name"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="Enter email"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Number
              </label>
              <input
                type="tel"
                value={newUserPhone}
                onChange={(e) => setNewUserPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter phone number"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Password
              </label>
              <input
                type="text"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Enter password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "12px",
                  fontWeight: 500,
                }}
              >
                Positions
              </label>
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  padding: "12px",
                  background: UI.inputBg,
                }}
              >
                {positions.length === 0 ? (
                  <div style={{ color: "#999", fontSize: "0.9rem" }}>
                    No positions available. Add positions first.
                  </div>
                ) : (
                  positions.map((position) => (
                    <label
                      key={position.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "12px",
                        cursor: "pointer",
                        fontSize: "1rem",
                        color: MONUMENT,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPositionIds.includes(position.id)}
                        onChange={() => handlePositionToggle(position.id)}
                        style={{
                          marginRight: "10px",
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                        }}
                      />
                      {position.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "12px",
                  fontWeight: 500,
                }}
              >
                Primary Position
              </label>
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  padding: "12px",
                  background: UI.inputBg,
                }}
              >
                {positions.length === 0 ? (
                  <div style={{ color: "#999", fontSize: "0.9rem" }}>
                    No positions available. Add positions first.
                  </div>
                ) : (
                  positions.map((position) => (
                    <label
                      key={position.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "12px",
                        cursor: "pointer",
                        fontSize: "1rem",
                        color: MONUMENT,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={primaryPositionId === position.id}
                        onChange={() => handlePrimaryPositionChange(position.id)}
                        style={{
                          marginRight: "10px",
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                        }}
                      />
                      {position.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={handleCloseEditModal}
                disabled={isSubmitting}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUser}
                disabled={isSubmitting}
                style={{
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                type="button"
              >
                {isSubmitting ? "Updating..." : "Update User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {showDeleteUserModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => !isDeletingUser && setShowDeleteUserModal(false)}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                color: MONUMENT,
                marginTop: 0,
                marginBottom: "16px",
                fontWeight: 600,
              }}
            >
              Delete User
            </h2>
            <p
              style={{
                fontSize: "1rem",
                color: "#666",
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              Are you sure you want to delete {selectedUser ? selectedUser.name : "this user"}? This action cannot be undone and all user data will be permanently removed.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setShowDeleteUserModal(false)}
                disabled={isDeletingUser}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isDeletingUser ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isDeletingUser ? 0.6 : 1,
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteUser}
                disabled={isDeletingUser}
                style={{
                  background: "#dc3545",
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isDeletingUser ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isDeletingUser ? 0.6 : 1,
                }}
                type="button"
              >
                {isDeletingUser ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Position Modal */}
      {showNewPositionModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseNewPositionModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                color: MONUMENT,
                marginTop: 0,
                marginBottom: "24px",
                fontWeight: 600,
              }}
            >
              New Position
            </h2>
            
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Position *
              </label>
              <input
                type="text"
                value={newPositionName}
                onChange={(e) => setNewPositionName(e.target.value)}
                placeholder="Enter position name"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={handleCloseNewPositionModal}
                disabled={isSubmittingPosition}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmittingPosition ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmittingPosition ? 0.6 : 1,
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePosition}
                disabled={isSubmittingPosition}
                style={{
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmittingPosition ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmittingPosition ? 0.6 : 1,
                }}
                type="button"
              >
                {isSubmittingPosition ? "Creating..." : "Create Position"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Position Modal */}
      {showEditPositionModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseEditPositionModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                color: MONUMENT,
                marginTop: 0,
                marginBottom: "24px",
                fontWeight: 600,
              }}
            >
              Edit Position
            </h2>
            
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Position *
              </label>
              <input
                type="text"
                value={newPositionName}
                onChange={(e) => setNewPositionName(e.target.value)}
                placeholder="Enter position name"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: UI.inputBg,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={handleCloseEditPositionModal}
                disabled={isSubmittingPosition}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmittingPosition ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmittingPosition ? 0.6 : 1,
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePosition}
                disabled={isSubmittingPosition}
                style={{
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSubmittingPosition ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isSubmittingPosition ? 0.6 : 1,
                }}
                type="button"
              >
                {isSubmittingPosition ? "Updating..." : "Update Position"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Position Confirmation Modal */}
      {showDeletePositionModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => !isDeletingPosition && setShowDeletePositionModal(false)}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                color: MONUMENT,
                marginTop: 0,
                marginBottom: "16px",
                fontWeight: 600,
              }}
            >
              Delete Position
            </h2>
            <p
              style={{
                fontSize: "1rem",
                color: "#666",
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              Are you sure you want to delete {positions.find((p) => p.id === parseInt(selectedPositionId))?.name || "this position"}? This action cannot be undone and all position data will be permanently removed.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setShowDeletePositionModal(false)}
                disabled={isDeletingPosition}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isDeletingPosition ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isDeletingPosition ? 0.6 : 1,
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeletePosition}
                disabled={isDeletingPosition}
                style={{
                  background: "#dc3545",
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isDeletingPosition ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isDeletingPosition ? 0.6 : 1,
                }}
                type="button"
              >
                {isDeletingPosition ? "Deleting..." : "Delete Position"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
