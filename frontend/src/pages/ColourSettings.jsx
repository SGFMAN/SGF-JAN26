import React, { useState } from "react";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const SECTION_GREY = UI.panelBg;

// Initial Polytec - Doors & Panels colors organized by category
const INITIAL_POLYTEC_COLOURS = {
  "Woodmatt timberprint & solid": [
    "Nordic Oak", "Tasmanian Oak", "Palace Teak", "Angora Oak", "Blossom White",
    "Perugian Walnut", "Bottega Oak", "Rojo Walnut", "Arcadia Oak", "Boston Oak",
    "Ligurian Walnut", "Quartiera Maple", "Plantation Ash", "Palomera Oak", "Black Ply",
    "Natural Ply", "Black", "Coastal Oak", "Notaio Walnut", "Casentino Beech",
    "Silk Bespoke", "Estella Oak", "Prime Oak", "Serene", "Cinder",
    "Florentine Walnut", "Antico Oak", "Australian Native", "Empire Oak", "Havana Oak"
  ],
  "Smooth timberprint & solid": [
    "Verdelho", "Botanic", "Topiary", "Aston White", "Habitat",
    "Onyx Figured-Wood", "Ochre Figured-Wood", "Agave", "Oasis", "Gossamer White",
    "Pallido", "Mercurio Grey", "Sienna Figured-Wood", "Adriatic", "Elemental Grey",
    "Arabica", "Forage"
  ],
  "Timberprint & solid": [
    "New Antique White", "Polar White", "Parchment", "Porcelain", "Moss Grey",
    "Alabaster", "Husk", "Designer White", "Avion Grey", "Greige",
    "Café Cream", "White Cotton", "Antique", "Classic White", "Marni Lini",
    "Blossom White", "Amaro", "Whitewood", "White Mist", "Gesso Lini",
    "Maison Oak", "Soft Walnut", "Crema Lini", "Malt", "Natural Oak",
    "Tuross Oak", "Marina Grey", "Jamaican Walnut", "European Walnut", "Combat Teak",
    "Tessuto Milan", "Taupe", "Stone Grey", "Rocco Lini", "Tasmanian Oak",
    "Notaio Walnut", "Prime Oak", "Strata Grey", "Artisan Oak", "Cinder",
    "Ferro", "Char Oak", "Truffle Lini", "Belgian Oak", "Shannon Oak",
    "Black Silk", "Graphite", "Wenge"
  ],
  "Timberprint, solid & abstract": [
    "Empire Titanium Oak", "Black", "Feldspar Shimmer", "Cavia Lini", "Aluminium",
    "Nickel", "Oxford", "Nouveau Grey", "Oyster Grey", "Canterbury Grey"
  ],
  "Metallic Leaf": [
    "Light Brass Leaf", "Rose Gold Leaf", "Pure Gold Leaf", "Copper Leaf",
    "Bronze Gold Leaf", "Platinum Leaf"
  ]
};

// Helper function to generate a color hex from a color name
const getColorFromName = (name) => {
  // This is a simple hash function to generate consistent colors from names
  // In a real application, you'd want actual color values
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r = (hash & 0xFF0000) >> 16;
  const g = (hash & 0xFF00) >> 8;
  const b = hash & 0xFF;
  // Ensure minimum brightness for visibility
  return `#${[Math.max(r, 100), Math.max(g, 100), Math.max(b, 100)].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
};

export default function ColourSettings() {
  const [polytecColours, setPolytecColours] = useState(INITIAL_POLYTEC_COLOURS);
  const [colorImages, setColorImages] = useState({}); // Store image URLs by color name
  const [selectedGroup, setSelectedGroup] = useState(null); // Track selected color group
  const [showModal, setShowModal] = useState(false);
  const [editingColor, setEditingColor] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    imageUrl: ""
  });

  const getColourHex = (r, g, b) => {
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  };

  const handleColorClick = (colorName, category) => {
    setEditingColor({ name: colorName, category });
    setEditForm({
      name: colorName,
      category: category,
      imageUrl: colorImages[colorName] || "" // Load existing image if available
    });
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingColor(null);
    setEditForm({ name: "", category: "", imageUrl: "" });
  };

  const handleModalOk = () => {
    if (!editForm.name.trim() || !editForm.category) {
      return; // Don't save if name or category is empty
    }

    // Create updated colors object
    const updatedColours = { ...polytecColours };

    // Remove color from old category if it exists
    if (editingColor) {
      updatedColours[editingColor.category] = updatedColours[editingColor.category].filter(
        c => c !== editingColor.name
      );
    }

    // Add color to new category
    if (!updatedColours[editForm.category]) {
      updatedColours[editForm.category] = [];
    }
    updatedColours[editForm.category].push(editForm.name);

    // Sort the category array to maintain order
    updatedColours[editForm.category].sort();

    // Update image storage if image was provided
    if (editForm.imageUrl) {
      const updatedImages = { ...colorImages };
      // Remove old image entry if name changed
      if (editingColor && editingColor.name !== editForm.name) {
        delete updatedImages[editingColor.name];
      }
      // Add/update image for new name
      updatedImages[editForm.name] = editForm.imageUrl;
      setColorImages(updatedImages);
    }

    setPolytecColours(updatedColours);
    handleModalClose();
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditForm({ ...editForm, imageUrl: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px", overflow: "auto" }}>
      <h2 style={{ fontSize: "1.5rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
        Colour Settings
      </h2>

      {/* 2 Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: "24px", flex: 1, minHeight: 0 }}>
        {/* Column 1: Color Groups */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}>
          <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
            Color Groups
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Colorbond Option */}
            <div
              onClick={() => setSelectedGroup("colorbond")}
              style={{
                padding: "16px 12px",
                border: selectedGroup === "colorbond" ? "2px solid " + MONUMENT : "1px solid #ddd",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                backgroundColor: selectedGroup === "colorbond" ? UI.inputBg : "transparent",
              }}
              onMouseEnter={(e) => {
                if (selectedGroup !== "colorbond") {
                  e.currentTarget.style.backgroundColor = UI.inputBg;
                }
              }}
              onMouseLeave={(e) => {
                if (selectedGroup !== "colorbond") {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <div style={{ fontSize: "1rem", fontWeight: 600, color: MONUMENT }}>
                Colorbond
              </div>
            </div>

            {/* Polytec Option */}
            <div
              onClick={() => setSelectedGroup("polytec")}
              style={{
                padding: "16px 12px",
                border: selectedGroup === "polytec" ? "2px solid " + MONUMENT : "1px solid #ddd",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                backgroundColor: selectedGroup === "polytec" ? UI.inputBg : "transparent",
              }}
              onMouseEnter={(e) => {
                if (selectedGroup !== "polytec") {
                  e.currentTarget.style.backgroundColor = UI.inputBg;
                }
              }}
              onMouseLeave={(e) => {
                if (selectedGroup !== "polytec") {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <div style={{ fontSize: "1rem", fontWeight: 600, color: MONUMENT }}>
                Polytec - Doors & Panels
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Selected Group Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}>
          {selectedGroup === "colorbond" && (
            <>
              <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
                Colorbond Colours
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {COLORBOND_COLOURS.map((colour, index) => {
                  const hex = getColourHex(colour.r, colour.g, colour.b);
                  return (
                    <div
                      key={index}
                      style={{
                        background: "transparent",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "12px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "4px",
                          backgroundColor: hex,
                          border: "1px solid #ccc",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 500, color: MONUMENT }}>
                          {colour.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--sgf-text-primary)" }}>
                          R: {colour.r} G: {colour.g} B: {colour.b}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {selectedGroup === "polytec" && (
            <>
              <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
                Polytec - Doors & Panels
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {Object.entries(polytecColours).map(([category, colors]) => (
                  <div key={category} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <h4 style={{ 
                      fontSize: "0.95rem", 
                      margin: 0, 
                      color: MONUMENT, 
                      fontWeight: 600,
                      paddingBottom: "4px",
                      borderBottom: "1px solid #ddd"
                    }}>
                      {category}
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {colors.map((colorName, index) => {
                        return (
                          <div
                            key={index}
                            onClick={() => handleColorClick(colorName, category)}
                            style={{
                              background: "transparent",
                              border: "1px solid #ddd",
                              borderRadius: "8px",
                              padding: "10px 8px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              maxWidth: "100%",
                              boxSizing: "border-box",
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = UI.inputBg;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "4px",
                                border: "1px solid #ccc",
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: UI.inputBg,
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              {colorImages[colorName] ? (
                                <img
                                  src={colorImages[colorName]}
                                  alt={colorName}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    fontSize: "6px",
                                    color: "var(--sgf-text-primary)",
                                    fontWeight: 600,
                                    textAlign: "center",
                                    lineHeight: "1",
                                    letterSpacing: "0.3px",
                                  }}
                                >
                                  Soon
                                </div>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "0.85rem", fontWeight: 500, color: MONUMENT }}>
                                {colorName}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!selectedGroup && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              height: "100%",
              color: "var(--sgf-text-primary)",
              fontSize: "0.9rem"
            }}>
              Select a color group from the left to view colors
            </div>
          )}
        </div>
      </div>

      {/* Edit Color Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleModalClose}
        >
          <div
            style={{
              backgroundColor: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "500px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.3rem", margin: "0 0 20px 0", color: MONUMENT, fontWeight: 600 }}>
              Edit Polytec Color
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Color Name */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}>
                  Color Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Subgroup Dropdown */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}>
                  Subgroup
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    backgroundColor: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select a subgroup</option>
                  {Object.keys(polytecColours).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Image Upload */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "6px" }}>
                  Color Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                />
                {editForm.imageUrl && (
                  <div style={{ marginTop: "10px" }}>
                    <img
                      src={editForm.imageUrl}
                      alt="Preview"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "200px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
              <button
                onClick={handleModalClose}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  backgroundColor: WHITE,
                  color: MONUMENT,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = UI.inputBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = WHITE;
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleModalOk}
                disabled={!editForm.name.trim() || !editForm.category}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: (!editForm.name.trim() || !editForm.category) ? "#ccc" : MONUMENT,
                  color: WHITE,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: (!editForm.name.trim() || !editForm.category) ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (editForm.name.trim() && editForm.category) {
                    e.currentTarget.style.backgroundColor = "#1a1a1b";
                  }
                }}
                onMouseLeave={(e) => {
                  if (editForm.name.trim() && editForm.category) {
                    e.currentTarget.style.backgroundColor = MONUMENT;
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
