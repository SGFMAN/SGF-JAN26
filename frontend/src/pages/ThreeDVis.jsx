import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import grassImage from "../images/grass.jpg";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";

const MONUMENT = "#323233";
const WHITE = "#fff";
const COLOUR_OPTIONS = ["Select", ...COLORBOND_COLOURS.map(c => c.name)];
const ROOF_STYLE_OPTIONS = ["Select", "Affordable", "Superior", "Skillion"];
// Window frames are only available in these colours
const WINDOW_FRAME_COLOUR_OPTIONS = ["Select", "Monument", "Paperbark", "White", "Primrose", "Black", "Surfmist", "Woodland Grey"];
// Window surrounds can be any Colorbond colour
const WINDOW_SURROUND_COLOUR_OPTIONS = ["Select", ...COLORBOND_COLOURS.map(c => c.name)];

const BUILDING_PARTS = [
  { key: "cladding", label: "Cladding" },
  { key: "roof", label: "Roof" },
  { key: "baseboards", label: "Baseboards" },
  { key: "fasciaGutter", label: "Fascia & Gutter" },
  { key: "balustrade", label: "Balustrade" },
  { key: "frontDoor", label: "Front Door" },
  { key: "windowFrames", label: "Window Frames" },
  { key: "windowSurrounds", label: "Window Surrounds" },
];

export default function ThreeDVis({ 
  project, 
  onBack, 
  onUpdate,
  roofColour,
  claddingColour,
  baseboardsColour,
  setRoofColour,
  setCladdingColour,
  setBaseboardsColour,
  saveColoursFromProjectPage,
  roofStyle,
  setRoofStyle,
  handleRoofStyleChange,
  fasciaGutterColour,
  setFasciaGutterColour,
  handleFasciaGutterColourChange,
  balustradeColour,
  setBalustradeColour,
  handleBalustradeColourChange,
  frontDoorColour,
  setFrontDoorColour,
  handleFrontDoorColourChange,
  windowFramesColour,
  setWindowFramesColour,
  handleWindowFramesColourChange,
  windowSurroundsColour,
  setWindowSurroundsColour,
  handleWindowSurroundsColourChange
}) {

  async function handleRoofColourChange(e) {
    const newValue = e.target.value;
    setRoofColour(newValue);
    await saveColoursFromProjectPage(newValue, claddingColour, baseboardsColour);
    if (onUpdate) onUpdate();
  }

  async function handleCladdingColourChange(e) {
    const newValue = e.target.value;
    setCladdingColour(newValue);
    await saveColoursFromProjectPage(roofColour, newValue, baseboardsColour);
    if (onUpdate) onUpdate();
  }

  async function handleBaseboardsColourChange(e) {
    const newValue = e.target.value;
    setBaseboardsColour(newValue);
    await saveColoursFromProjectPage(roofColour, claddingColour, newValue);
    if (onUpdate) onUpdate();
  }

  async function handleFasciaGutterColourChangeWrapper(e) {
    if (handleFasciaGutterColourChange) {
      await handleFasciaGutterColourChange(e);
    }
  }

  async function handleBalustradeColourChangeWrapper(e) {
    if (handleBalustradeColourChange) {
      await handleBalustradeColourChange(e);
    }
  }

  async function handleFrontDoorColourChangeWrapper(e) {
    if (handleFrontDoorColourChange) {
      await handleFrontDoorColourChange(e);
    }
  }

  async function handleWindowFramesColourChangeWrapper(e) {
    if (handleWindowFramesColourChange) {
      await handleWindowFramesColourChange(e);
    }
  }

  async function handleWindowSurroundsColourChangeWrapper(e) {
    if (handleWindowSurroundsColourChange) {
      await handleWindowSurroundsColourChange(e);
    }
  }

  const [selectedBuildingPart, setSelectedBuildingPart] = useState("cladding");
  const [activeSection, setActiveSection] = useState("external");

  // Helper function to get available colours for a building part
  const getAvailableColours = (partKey) => {
    if (partKey === "windowFrames") {
      // Window frames have limited colours, map "Black" to "Night Sky" but keep "Black" as display name
      return WINDOW_FRAME_COLOUR_OPTIONS.filter(opt => opt !== "Select").map(opt => {
        const colour = opt === "Black" 
          ? COLORBOND_COLOURS.find(c => c.name === "Night Sky")
          : COLORBOND_COLOURS.find(c => c.name === opt);
        if (colour) {
          // Return colour object but with display name
          return { ...colour, displayName: opt };
        }
        return null;
      }).filter(Boolean);
    } else {
      // All other parts can use all Colorbond colours
      return COLORBOND_COLOURS.map(c => ({ ...c, displayName: c.name }));
    }
  };

  // Helper function to get current selected colour for a building part
  const getCurrentColour = (partKey) => {
    let colour;
    switch (partKey) {
      case "roof": colour = roofColour || "Select"; break;
      case "cladding": colour = claddingColour || "Select"; break;
      case "baseboards": colour = baseboardsColour || "Select"; break;
      case "fasciaGutter": colour = fasciaGutterColour || "Select"; break;
      case "balustrade": colour = balustradeColour || "Select"; break;
      case "frontDoor": colour = frontDoorColour || "Select"; break;
      case "windowFrames": colour = windowFramesColour || "Select"; break;
      case "windowSurrounds": colour = windowSurroundsColour || "Select"; break;
      default: colour = "Select";
    }
    // For window frames, "Black" maps to "Night Sky" in the colour list
    if (partKey === "windowFrames" && colour === "Black") {
      return "Night Sky";
    }
    return colour;
  };

  // Handler for when a colour is clicked
  const handleColourClick = async (colourName) => {
    // For window frames, "Night Sky" should be saved as "Black"
    const valueToSave = (selectedBuildingPart === "windowFrames" && colourName === "Night Sky") ? "Black" : colourName;
    
    switch (selectedBuildingPart) {
      case "roof":
        await handleRoofColourChange({ target: { value: valueToSave } });
        break;
      case "cladding":
        await handleCladdingColourChange({ target: { value: valueToSave } });
        break;
      case "baseboards":
        await handleBaseboardsColourChange({ target: { value: valueToSave } });
        break;
      case "fasciaGutter":
        await handleFasciaGutterColourChangeWrapper({ target: { value: valueToSave } });
        break;
      case "balustrade":
        await handleBalustradeColourChangeWrapper({ target: { value: valueToSave } });
        break;
      case "frontDoor":
        await handleFrontDoorColourChangeWrapper({ target: { value: valueToSave } });
        break;
      case "windowFrames":
        await handleWindowFramesColourChangeWrapper({ target: { value: valueToSave } });
        break;
      case "windowSurrounds":
        await handleWindowSurroundsColourChangeWrapper({ target: { value: valueToSave } });
        break;
    }
  };

  // Helper to get hex color from RGB
  const getColourHex = (r, g, b) => {
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  };

  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const baseboardsRef = useRef(null);
  const extrudedShapeRef = useRef(null);
  const superiorShapeRef = useRef(null);
  const affordableShapeRef = useRef(null);
  const skillionShapeRef = useRef(null);
  const weatherboardLinesRef = useRef([]);
  const superiorRoofRef = useRef([]);
  const affordableRoofRef = useRef([]);
  const skillionRoofRef = useRef(null);
  const claddingRef = useRef(null);
  const claddingMaterialRef = useRef(null);
  const polygonMaterialRef = useRef(null);
  const baseboardsMaterialRef = useRef(null);
  const porchTopMaterialRef = useRef(null);
  const porchSideMaterialRef = useRef(null);
  const windowCrossMaterialRef = useRef(null);
  const windowSurroundMaterialRef = useRef(null);
  const roofMaterialRef = useRef(null);
  const porchRoofMaterialRef = useRef(null);
  const porchRoofRef = useRef(null);
  const originalPorchRoofRef = useRef(null);
  const porchPostRefs = useRef([]);
  const superiorPorchRoofPlanesRef = useRef([]);
  const doorMaterialRef = useRef(null);
  const balustradePostMaterialRef = useRef(null);
  const balustradeHandrailMaterialRef = useRef(null);
  const balustradeBalusterMaterialRef = useRef(null);
  const angledBalusterMaterialRef = useRef(null);
  const animationFrameRef = useRef(null);
  const triangleRef = useRef(null);
  const leftRoofRef = useRef(null);
  const rightRoofRef = useRef(null);
  const isDraggingRef = useRef(false);
  const previousMouseXRef = useRef(0);
  const rotationSpeedRef = useRef(0.01);
  const cameraDistanceRef = useRef(15.556); // Initial distance from lookAt point
  const targetCameraHeightRef = useRef(1.8); // Target camera Y position (5000mm for roof, 1800mm for others)
  const currentCameraHeightRef = useRef(1.8); // Current camera Y position for smooth transitions
  const targetCameraDistanceRef = useRef(10.0); // Target camera distance for smooth zoom transitions (10000mm default)
  const currentCameraDistanceRef = useRef(15.556); // Current camera distance for smooth transitions
  const isInitialMountRef = useRef(true); // Track if this is the initial mount to prevent roofStyle from overriding initial camera position
  const previousRoofStyleRef = useRef(null); // Track previous roofStyle to detect actual changes

  // Initial setup useEffect - runs once
  useEffect(() => {
    if (!canvasRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    // Create sky gradient background
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 256;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d');
    const skyGradient = skyCtx.createLinearGradient(0, 0, 0, 512);
    skyGradient.addColorStop(0, '#87CEEB'); // Light blue at top
    skyGradient.addColorStop(0.5, '#B0E0E6'); // Lighter blue in middle
    skyGradient.addColorStop(1, '#E0F6FF'); // Very light blue/white at bottom
    skyCtx.fillStyle = skyGradient;
    skyCtx.fillRect(0, 0, 256, 512);
    const skyTexture = new THREE.CanvasTexture(skyCanvas);
    scene.background = skyTexture;
    sceneRef.current = scene;

    // Camera setup - slightly tilted view (isometric-like)
    const width = canvasRef.current.clientWidth;
    const height = canvasRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    
    // Initial camera position will be set after storing the camera ref
    // to match the default selectedBuildingPart (cladding)

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = false; // Disable shadows completely

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(10, 10, 5);
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-10, 5, -10);
    scene.add(directionalLight2);

    // Create grass ground plane using grass.jpg image
    const textureLoader = new THREE.TextureLoader();
    const grassTexture = textureLoader.load(grassImage);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(10, 10); // Repeat the pattern
    
    const grassGeometry = new THREE.PlaneGeometry(100, 100); // Large ground plane
    const grassMaterial = new THREE.MeshStandardMaterial({ 
      map: grassTexture,
      metalness: 0.1,
      roughness: 0.9
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    grass.receiveShadow = false;
    // Position will be set relative to baseboards after baseboards is created

    // Create baseboards cube: 11,300mm x 5,000mm x 650mm
    // Convert mm to meters for Three.js (divide by 1000)
    const baseboardsLength = 11.3;  // 11,300mm = 11.3m
    const baseboardsWidth = 5.0;     // 5,000mm = 5.0m
    const baseboardsHeight = 0.66;   // 660mm = 0.66m

    const baseboardsGeometry = new THREE.BoxGeometry(baseboardsLength, baseboardsHeight, baseboardsWidth);
    const baseboardsMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      metalness: 0.1,
      roughness: 0.7
    });
    baseboardsMaterialRef.current = baseboardsMaterial;
    const baseboards = new THREE.Mesh(baseboardsGeometry, baseboardsMaterial);
    baseboards.position.set(0, baseboardsHeight / 2, 0); // Position so bottom is at y=0
    scene.add(baseboards);
    baseboardsRef.current = baseboards;
    
    // Add black lines to all edges of the subfloor
    const baseboardsEdgesGeometry = new THREE.EdgesGeometry(baseboardsGeometry);
    const baseboardsEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const baseboardsEdges = new THREE.LineSegments(baseboardsEdgesGeometry, baseboardsEdgesMaterial);
    // Position relative to baseboards center (which is at baseboardsHeight/2 from ground)
    // Since baseboards center is at baseboardsHeight/2, edges should be at 0 relative to baseboards
    baseboardsEdges.position.set(0, 0, 0); // Relative to baseboards center
    baseboards.add(baseboardsEdges); // Add as child so it rotates with baseboards
    
    // Add grass to baseboards so it rotates with the building
    // Position relative to baseboards center (which is at baseboardsHeight/2 from ground)
    // Grass should be at ground level (y=0), so relative to baseboards center: 0 - baseboardsHeight/2
    grass.position.set(0, -baseboardsHeight / 2, 0); // Position relative to baseboards center
    baseboards.add(grass);

    // Create porch
    const porchWidth = 2.09;   // 2090mm = 2.09m
    const porchDepth = 1.545;   // 1545mm = 1.545m
    const porchHeight = 0.2;   // 200mm = 0.2m thick
    const porchOffsetFromLeft = 3.4; // 3400mm = 3.4m from left side (moved 400mm to the right)
    
    // Porch is adjacent to the long side (Z direction), positioned 3m from left side (X direction)
    // Building extends from X = -baseboardsLength/2 to X = baseboardsLength/2
    // Porch starts at X = -baseboardsLength/2 + porchOffsetFromLeft
    // Porch center X = -baseboardsLength/2 + porchOffsetFromLeft + porchWidth/2
    const porchCenterX = -baseboardsLength / 2 + porchOffsetFromLeft + porchWidth / 2;
    // Porch extends outward from the building in Z direction
    // Building extends from Z = -baseboardsWidth/2 to Z = baseboardsWidth/2
    // Porch should be adjacent, so its inner edge is at Z = baseboardsWidth/2
    // Porch center Z = baseboardsWidth/2 + porchDepth/2
    const porchCenterZ = baseboardsWidth / 2 + porchDepth / 2;
    
    const porchGeometry = new THREE.BoxGeometry(porchWidth, porchHeight, porchDepth);
    
    // Create decking board texture (brown boards with black gaps)
    // Boards run along the porch depth (perpendicular to building)
    const boardWidth = 0.09; // 90mm board width
    const gapWidth = 0.01; // 10mm gap
    const boardGapTotal = boardWidth + gapWidth; // 100mm total per board+gap
    
    // Calculate texture size based on porch dimensions
    // Texture width = porch width, texture height = rounded up to full boards
    const textureWidth = porchWidth;
    const textureHeight = Math.ceil(porchDepth / boardGapTotal) * boardGapTotal; // Round up to full boards
    
    // Create canvas for decking texture
    const deckingCanvas = document.createElement('canvas');
    const pixelsPerMeter = 100; // 100 pixels per meter for good detail
    deckingCanvas.width = Math.ceil(textureWidth * pixelsPerMeter);
    deckingCanvas.height = Math.ceil(textureHeight * pixelsPerMeter);
    const deckingCtx = deckingCanvas.getContext('2d');
    
    // Brown color for decking boards
    const boardColor = '#8B4513'; // Saddle brown
    const gapColor = '#000000'; // Black
    
    // Fill with board color first
    deckingCtx.fillStyle = boardColor;
    deckingCtx.fillRect(0, 0, deckingCanvas.width, deckingCanvas.height);
    
    // Draw black gaps (horizontal lines for boards running along porch depth)
    deckingCtx.fillStyle = gapColor;
    const boardPixels = boardWidth * pixelsPerMeter;
    const gapPixels = gapWidth * pixelsPerMeter;
    
    for (let y = boardPixels; y < deckingCanvas.height; y += boardPixels + gapPixels) {
      deckingCtx.fillRect(0, y, deckingCanvas.width, gapPixels);
    }
    
    const deckingTexture = new THREE.CanvasTexture(deckingCanvas);
    deckingTexture.wrapS = THREE.RepeatWrapping;
    deckingTexture.wrapT = THREE.RepeatWrapping;
    deckingTexture.repeat.set(1, 1);
    
    // Create materials for different faces
    // BoxGeometry faces: 0=right, 1=left, 2=top, 3=bottom, 4=front, 5=back
    const baseboardColor = 0x888888; // Grey baseboard color
    const topMaterial = new THREE.MeshStandardMaterial({ 
      color: baseboardColor, // Same color as baseboards (no decking texture)
      metalness: 0.1,
      roughness: 0.7
    });
    porchTopMaterialRef.current = topMaterial; // Store in ref so it can be updated with baseboard color
    const sideMaterial = new THREE.MeshStandardMaterial({ 
      color: baseboardColor,
      metalness: 0.1,
      roughness: 0.7
    });
    porchSideMaterialRef.current = sideMaterial; // Store in ref so it can be updated with baseboard color
    
    // Material array: [right, left, top, bottom, front, back]
    const porchMaterials = [
      sideMaterial, // right
      sideMaterial, // left
      topMaterial,  // top (decking)
      sideMaterial, // bottom
      sideMaterial, // front
      sideMaterial  // back
    ];
    
    const porch = new THREE.Mesh(porchGeometry, porchMaterials);
    // Position relative to baseboards center so it rotates with the building
    // Top of baseboards is at baseboardsHeight from ground
    // Porch top should be flush with baseboards top, so porch top is at baseboardsHeight
    // Porch center from ground = baseboardsHeight - porchHeight/2
    // Baseboards center is at baseboardsHeight/2 from ground
    // Porch center relative to baseboards center = (baseboardsHeight - porchHeight/2) - baseboardsHeight/2
    // = baseboardsHeight/2 - porchHeight/2
    porch.position.set(
      porchCenterX, 
      baseboardsHeight / 2 - porchHeight / 2, // Position so top is flush with baseboards top
      porchCenterZ
    );
    baseboards.add(porch); // Add as child so it rotates with baseboards
    // Add black edge lines to porch
    const porchEdgesGeometry = new THREE.EdgesGeometry(porchGeometry);
    const porchEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const porchEdges = new THREE.LineSegments(porchEdgesGeometry, porchEdgesMaterial);
    porch.add(porchEdges);

    // Create duplicate porch on top of existing one: 5mm thick, brown like steps
    const porchTopThickness = 0.005; // 5mm thick
    const porchTopGeometry = new THREE.BoxGeometry(porchWidth, porchTopThickness, porchDepth);
    const porchTopMaterial = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color(boardColor), // Same brown as steps
      metalness: 0.1,
      roughness: 0.8
    });
    const porchTop = new THREE.Mesh(porchTopGeometry, porchTopMaterial);
    
    // Position directly on top of existing porch
    // Existing porch top is at baseboardsHeight, so this should be at baseboardsHeight + porchTopThickness/2
    porchTop.position.set(
      porchCenterX,
      baseboardsHeight / 2 + porchTopThickness / 2, // On top of existing porch
      porchCenterZ
    );
    baseboards.add(porchTop); // Add as child so it rotates with baseboards

    // Create porch steps on the right edge (no handrails side)
    // Steps extend in Z direction (perpendicular to building) on the right side of porch
    const stepWidth = 0.25; // 250mm deep (extends outward)
    const stepThickness = 0.04; // 40mm thick
    // Calculate stepLength to extend to building while keeping outer end in place
    // Current outer edge is at: porchCenterZ + (porchDepth - 0.4)/2 = baseboardsWidth/2 + porchDepth - 0.2
    // Building is at: baseboardsWidth/2
    // New stepLength = outer edge - building = porchDepth - 0.2
    const stepLength = porchDepth - 0.2; // Extended to meet building, keeping outer end in place
    // Use the same brown as the porch decking (boardColor already defined above)
    const stepMaterial = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color(boardColor), // Same brown as porch decking boards
      metalness: 0.1,
      roughness: 0.8
    });
    
    // Create handrail material (used for all handrails)
    const handrailMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      metalness: 0.1,
      roughness: 0.7
    });
    
    // Create post material (used for all posts including step posts)
    const postMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      metalness: 0.1,
      roughness: 0.7
    });
    
    // Line material for step leading edge line
    const stepLineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x000000, // Black
      linewidth: 2
    });
    
    // Step 1: positioned on right edge of porch, lower by 165mm
    const step1Geometry = new THREE.BoxGeometry(stepWidth, stepThickness, stepLength);
    const step1 = new THREE.Mesh(step1Geometry, stepMaterial);
    // Step center X = porch right edge + stepWidth/2
    // Step center Z = adjusted so inner edge meets building and outer edge stays in place
    // Outer edge should be at: baseboardsWidth/2 + porchDepth - 0.2 (where it currently is)
    // Inner edge should be at: baseboardsWidth/2 (building)
    // Step center Z = (outer edge + inner edge) / 2 = baseboardsWidth/2 + (porchDepth - 0.2)/2
    const step1X = porchCenterX + porchWidth / 2 + stepWidth / 2;
    const step1Z = baseboardsWidth / 2 + (porchDepth - 0.2) / 2; // Center so inner edge meets building
    const step1TopY = baseboardsHeight - 0.165; // Lower by 165mm from porch top
    step1.position.set(
      step1X,
      (step1TopY - stepThickness / 2) - baseboardsHeight / 2, // Top at step1TopY, relative to baseboards center
      step1Z
    );
    baseboards.add(step1);
    
    // Step 2: positioned outward from step 1, lower by 330mm
    const step2Geometry = new THREE.BoxGeometry(stepWidth, stepThickness, stepLength);
    const step2 = new THREE.Mesh(step2Geometry, stepMaterial);
    // Step center X = step1 outer edge + stepWidth/2
    const step2X = step1X + stepWidth / 2 + stepWidth / 2;
    const step2Z = step1Z; // Same Z as step1
    const step2TopY = baseboardsHeight - 0.330; // Lower by 330mm from porch top
    step2.position.set(
      step2X,
      (step2TopY - stepThickness / 2) - baseboardsHeight / 2, // Top at step2TopY, relative to baseboards center
      step2Z
    );
    baseboards.add(step2);
    
    // Step 3: positioned outward from step 2, lower by 495mm
    const step3Geometry = new THREE.BoxGeometry(stepWidth, stepThickness, stepLength);
    const step3 = new THREE.Mesh(step3Geometry, stepMaterial);
    // Step center X = step2 outer edge + stepWidth/2
    const step3X = step2X + stepWidth / 2 + stepWidth / 2;
    const step3Z = step1Z; // Same Z as step1
    const step3TopY = baseboardsHeight - 0.495; // Lower by 495mm from porch top
    step3.position.set(
      step3X,
      (step3TopY - stepThickness / 2) - baseboardsHeight / 2, // Top at step3TopY, relative to baseboards center
      step3Z
    );
    baseboards.add(step3);

    // Add post on step 3 only: 100mm x 100mm, extends from ground to top of step post
    const stepPostSize = 0.1; // 100mm = 0.1m
    const stepPostTopY = step3TopY + 0.975; // Top of post (975mm above step top)
    const stepPostHeight = stepPostTopY; // Height from ground to top of post
    const stepPostInset = 0.145; // 145mm = 0.145m
    
    // Calculate stair angle: from step 1 to step 3 (used for both post and handrail)
    const stepDeltaX = step3X - step1X; // Distance between step 1 and step 3 in X
    const stepDeltaY = step3TopY - step1TopY; // Height difference (step 3 is lower, so negative)
    const stairAngle = Math.atan2(stepDeltaY, stepDeltaX); // Angle in X-Y plane
    
    // Step 3 post (only one - first two removed)
    const step3PostX = step3X + stepWidth / 2 - stepPostInset + 0.05; // Moved 50mm to the right (away from large post)
    const step3PostZ = porchCenterZ + porchDepth / 2 - stepPostInset; // Keep at original position based on full porchDepth
    // step1PostX and step1PostZ still needed for handrail positioning
    // Keep step1PostZ at original position (based on full porchDepth) so posts and balustrade don't move
    const step1PostX = step1X + stepWidth / 2 - stepPostInset;
    const step1PostZ = porchCenterZ + porchDepth / 2 - stepPostInset;
    const step3PostGeometry = new THREE.BoxGeometry(stepPostSize, stepPostHeight, stepPostSize);
    const step3Post = new THREE.Mesh(step3PostGeometry, postMaterial);
    step3Post.position.set(
      step3PostX,
      (stepPostHeight / 2) - baseboardsHeight / 2, // Center at half height from ground (extends from ground to top)
      step3PostZ
    );
    baseboards.add(step3Post);
    // Add black edge lines to step3 post
    const step3PostEdgesGeometry = new THREE.EdgesGeometry(step3PostGeometry);
    const step3PostEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const step3PostEdges = new THREE.LineSegments(step3PostEdgesGeometry, step3PostEdgesMaterial);
    step3Post.add(step3PostEdges);

    // Create porch roof (duplicate of porch, angled upward from building side to post side)
    const porchRoofThickness = 0.1; // 100mm thick (reduced from 200mm)
    const porchRoofGeometry = new THREE.BoxGeometry(porchWidth, porchRoofThickness, porchDepth);
    const porchRoofMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      metalness: 0,
      roughness: 1.0
    });
    porchRoofMaterialRef.current = porchRoofMaterial;
    const porchRoof = new THREE.Mesh(porchRoofGeometry, porchRoofMaterial);
    porchRoofRef.current = porchRoof; // Store in ref for conditional removal
    originalPorchRoofRef.current = porchRoof; // Store original separately so we don't lose it
    // Add black edge lines to original porch roof
    const originalPorchRoofEdgesGeometry = new THREE.EdgesGeometry(porchRoofGeometry);
    const originalPorchRoofEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const originalPorchRoofEdges = new THREE.LineSegments(originalPorchRoofEdgesGeometry, originalPorchRoofEdgesMaterial);
    porchRoof.add(originalPorchRoofEdges);
    
    // Rotate around X axis to angle upward (building side higher, post side at 2800mm)
    // Building side is at Z = baseboardsWidth/2 (inner edge)
    // Post side is at Z = baseboardsWidth/2 + porchDepth (outer edge)
    // Rotate around X axis (which runs along the width)
    // Positive rotation around X: positive Z points move down, negative Z points move up
    // So we need positive rotation to make building side (negative Z relative to center) go up
    const roofRise = 0.2; // 200mm rise from post side to building side
    const roofAngle = Math.atan(roofRise / porchDepth); // Angle to raise building side
    porchRoof.rotation.x = roofAngle; // Positive rotation to tilt building side up
    
    // Position so post side (outer edge, at +porchDepth/2 in local Z) is at 2800mm above ground
    // After rotation, post side is offset down by (porchDepth/2) * sin(angle)
    // So center Y = 2800mm + (porchDepth/2) * sin(angle) to compensate
    const rotationOffsetY = (porchDepth / 2) * Math.sin(roofAngle);
    // Adjust for reduced thickness: top stays at same level, so move center up by half the thickness difference
    const thicknessDifference = porchHeight - porchRoofThickness; // 100mm difference
    porchRoof.position.set(
      porchCenterX,
      2.8 - baseboardsHeight / 2 + rotationOffsetY + thicknessDifference / 2, // Post side at 2800mm, adjusted for rotation and thickness
      porchCenterZ
    );
    
    // Only add porch roof if roofStyle is not "Superior"
    // For now, we'll add it conditionally in the roof style useEffect
    // Don't add it here - it will be added in the roof style useEffect

    // Create porch posts at outside corners
    const postSize = 0.1;      // 100mm = 0.1m
    const postHeight = 2.7 + 0.11;    // 2810mm = 2.81m (increased by 110mm from 2700mm)
    const postInset = 0.145;   // 145mm = 0.145m inset from edges
    // postMaterial already created above for step posts
    balustradePostMaterialRef.current = postMaterial;

    // Porch corners (relative to baseboards center)
    // Porch extends from porchCenterX - porchWidth/2 to porchCenterX + porchWidth/2 in X
    // Porch extends from porchCenterZ - porchDepth/2 to porchCenterZ + porchDepth/2 in Z
    // Outer edge is farthest from the building at Z = porchCenterZ + porchDepth/2
    // Only need 2 posts on the outer edge corners
    
    // Left outer corner (X = left, Z = outer edge)
    const post1X = porchCenterX - porchWidth / 2 + postInset;
    const post1Z = porchCenterZ + porchDepth / 2 - postInset;
    
    // Right outer corner (X = right, Z = outer edge)
    const post2X = porchCenterX + porchWidth / 2 - postInset;
    const post2Z = porchCenterZ + porchDepth / 2 - postInset;

    const postPositions = [
      { x: post1X, z: post1Z }, // Left outer corner
      { x: post2X, z: post2Z }, // Right outer corner
    ];

    // Add post on house side (inner edge) of porch - 1000mm high
    const houseSidePostHeight = 1.0; // 1000mm = 1.0m
    const houseSidePostX = porchCenterX - porchWidth / 2 + postInset; // Left side of porch, inset 145mm
    const houseSidePostZ = baseboardsWidth / 2 + postSize / 2; // House side, flush against building wall (move out by half post width)
    const houseSidePostGeometry = new THREE.BoxGeometry(postSize, houseSidePostHeight, postSize);
    const houseSidePost = new THREE.Mesh(houseSidePostGeometry, postMaterial);
    houseSidePost.position.set(
      houseSidePostX,
      (0.66 + houseSidePostHeight / 2) - baseboardsHeight / 2, // Bottom at 660mm above ground
      houseSidePostZ
    );
    baseboards.add(houseSidePost);

    // Add handrail on top of house-side post, extending perpendicular to building to meet taller post
    const handrailWidth = 0.1; // 100mm wide
    const handrailHeight = 0.05; // 50mm tall
    // handrailMaterial already created above for step handrail
    balustradeHandrailMaterialRef.current = handrailMaterial;
    
    // Handrail bottom at 1660mm from ground, so center is at 1660 + height/2
    const handrailBottomY = 1.66; // 1660mm from ground (bottom of handrail)
    const handrailY = handrailBottomY + handrailHeight / 2; // Center Y position
    
    // Calculate length from building wall to tall post (perpendicular to building, Z direction)
    // Building wall is at baseboardsWidth / 2, tall post outer edge is at post1Z - postSize/2
    // We need to stop at the outer edge of the post, not go into it
    const buildingWallZ = baseboardsWidth / 2;
    const tallPostOuterEdgeZ = post1Z - postSize / 2; // Outer edge of tall post (closest to building)
    const handrailLength = Math.abs(tallPostOuterEdgeZ - buildingWallZ);
    
    // Create handrail geometry (width=X, height=Y, depth=Z)
    // To extend in Z direction, we need width in X, height in Y, and length in Z
    const handrailGeometry = new THREE.BoxGeometry(handrailWidth, handrailHeight, handrailLength);
    const handrail = new THREE.Mesh(handrailGeometry, handrailMaterial);
    
    // Position at midpoint between building wall and tall post outer edge in Z, same X as posts, at correct height
    const midZ = (buildingWallZ + tallPostOuterEdgeZ) / 2;
    
    handrail.position.set(
      houseSidePostX, // Same X as both posts
      handrailY - baseboardsHeight / 2, // Bottom at 1660mm from ground, relative to baseboards center
      midZ
    );
    
    // No rotation needed - BoxGeometry extends in Z by default (depth parameter)
    // The handrail extends from building wall to tall post outer edge in the Z direction
    
    baseboards.add(handrail);
    // Add black edge lines to handrail
    const handrailEdgesGeometry = new THREE.EdgesGeometry(handrailGeometry);
    const handrailEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const handrailEdges = new THREE.LineSegments(handrailEdgesGeometry, handrailEdgesMaterial);
    handrail.add(handrailEdges);

    // Add second handrail between the two long posts (outer corner posts)
    // Both posts are at the same Z (outer edge), different X positions
    const handrail2Length = Math.abs(post2X - post1X);
    const handrail2Geometry = new THREE.BoxGeometry(handrailWidth, handrailHeight, handrail2Length);
    const handrail2 = new THREE.Mesh(handrail2Geometry, handrailMaterial);
    
    // Position at midpoint between the two posts in X, at outer edge Z, at correct height
    const midX = (post1X + post2X) / 2;
    const outerEdgeZ = post1Z; // Both posts are at the same Z (outer edge)
    
    handrail2.position.set(
      midX,
      handrailY - baseboardsHeight / 2, // Bottom at 1660mm from ground, relative to baseboards center
      outerEdgeZ
    );
    
    // Rotate 90 degrees around Y axis to make it extend in X direction (along the porch front)
    handrail2.rotation.y = Math.PI / 2;
    
    baseboards.add(handrail2);
    // Add black edge lines to handrail2
    const handrail2EdgesGeometry = new THREE.EdgesGeometry(handrail2Geometry);
    const handrail2EdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const handrail2Edges = new THREE.LineSegments(handrail2EdgesGeometry, handrail2EdgesMaterial);
    handrail2.add(handrail2Edges);

    // Add handrail on step posts, starting flush with tall post and sloping down at stair angle
    const stepPostHandrailWidth = 0.1; // 100mm wide
    const stepPostHandrailThickness = 0.04; // 40mm thick
    const stepPostHandrailLength = 1.0; // 1000mm long
    // Create geometry with length in X direction (width=X, height=Y, depth=Z)
    const stepPostHandrailGeometry = new THREE.BoxGeometry(stepPostHandrailLength, stepPostHandrailThickness, stepPostHandrailWidth);
    const stepPostHandrail = new THREE.Mesh(stepPostHandrailGeometry, handrailMaterial);
    
    // Position lowered by 300mm from other handrails, starting flush with right tall post (post2X)
    // stairAngle already calculated above for step post
    // Hinged at the post, so the start position stays at this height
    const stepPostHandrailY = 1.66 + 0.05 / 2 - 0.3 + 0.01; // 1660mm + half of 50mm height - 300mm + 10mm = center Y
    stepPostHandrail.position.set(
      post2X + stepPostHandrailLength / 2 - 0.05 - 0.02 - 0.02, // Start at post2X, moved 50mm towards large post, then 40mm left (toward tall post)
      (stepPostHandrailY - baseboardsHeight / 2), // Lowered by 290mm from other handrails (hinged point, raised 10mm)
      step1PostZ
    );
    // Rotate around Z axis to match stair angle (slopes down)
    stepPostHandrail.rotation.z = stairAngle;
    
    baseboards.add(stepPostHandrail);
    // Add black edge lines to step post handrail
    const stepPostHandrailEdgesGeometry = new THREE.EdgesGeometry(stepPostHandrailGeometry);
    const stepPostHandrailEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const stepPostHandrailEdges = new THREE.LineSegments(stepPostHandrailEdgesGeometry, stepPostHandrailEdgesMaterial);
    stepPostHandrail.add(stepPostHandrailEdges);

    // Duplicate angled handrail 900mm lower
    const stepPostHandrail2Geometry = new THREE.BoxGeometry(stepPostHandrailLength, stepPostHandrailThickness, stepPostHandrailWidth);
    const stepPostHandrail2 = new THREE.Mesh(stepPostHandrail2Geometry, handrailMaterial);
    
    // Position 900mm lower than the first handrail, then raised by 75mm, then lowered by 20mm
    const stepPostHandrail2Y = stepPostHandrailY - 0.9 + 0.075 - 0.02; // 900mm lower, then raised 75mm, then lowered 20mm
    stepPostHandrail2.position.set(
      post2X + stepPostHandrailLength / 2 - 0.05 - 0.02 - 0.02, // Same X position as first handrail
      (stepPostHandrail2Y - baseboardsHeight / 2), // 845mm lower than first handrail (900mm - 75mm + 20mm)
      step1PostZ
    );
    // Rotate around Z axis to match stair angle (slopes down)
    stepPostHandrail2.rotation.z = stairAngle;
    
    baseboards.add(stepPostHandrail2);
    // Add black edge lines to step post handrail2
    const stepPostHandrail2EdgesGeometry = new THREE.EdgesGeometry(stepPostHandrail2Geometry);
    const stepPostHandrail2EdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const stepPostHandrail2Edges = new THREE.LineSegments(stepPostHandrail2EdgesGeometry, stepPostHandrail2EdgesMaterial);
    stepPostHandrail2.add(stepPostHandrail2Edges);

    // Duplicate bottom angled handrail 100mm lower
    const stepPostHandrail3Width = 0.04; // 40mm wide (instead of 100mm)
    const stepPostHandrail3Thickness = 0.15; // 150mm thick (instead of 70mm)
    const stepPostHandrail3Geometry = new THREE.BoxGeometry(stepPostHandrailLength, stepPostHandrail3Thickness, stepPostHandrail3Width);
    const stepPostHandrail3 = new THREE.Mesh(stepPostHandrail3Geometry, handrailMaterial);
    
    // Position 100mm lower than the bottom handrail, then lowered by another 80mm
    const stepPostHandrail3Y = stepPostHandrail2Y - 0.1 - 0.08; // 100mm lower, then 80mm more = 180mm lower
    stepPostHandrail3.position.set(
      post2X + stepPostHandrailLength / 2 - 0.05 - 0.02 - 0.02, // Same X position as other handrails
      (stepPostHandrail3Y - baseboardsHeight / 2), // 100mm lower than bottom handrail
      step1PostZ
    );
    // Rotate around Z axis to match stair angle (slopes down)
    stepPostHandrail3.rotation.z = stairAngle;
    
    baseboards.add(stepPostHandrail3);
    // Add black edge lines to step post handrail3
    const stepPostHandrail3EdgesGeometry = new THREE.EdgesGeometry(stepPostHandrail3Geometry);
    const stepPostHandrail3EdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const stepPostHandrail3Edges = new THREE.LineSegments(stepPostHandrail3EdgesGeometry, stepPostHandrail3EdgesMaterial);
    stepPostHandrail3.add(stepPostHandrail3Edges);

    // Add upright posts between angled handrails (top and bottom)
    // Posts need to be positioned along the angled handrails and match the slope
    // Use the same material as regular balusters so they change with balustrade color
    const angledBalusterMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      metalness: 0.1,
      roughness: 0.7
    });
    angledBalusterMaterialRef.current = angledBalusterMaterial; // Store in ref for color updates
    
    const angledBalusterWidth = 0.04; // 40mm
    const angledBalusterDepth = 0.04; // 40mm
    const angledHandrailThickness = stepPostHandrailThickness; // 40mm
    const angledMaxGap = 0.125; // 125mm maximum gap
    
    // Calculate spacing along the handrail length
    const angledHandrailLength = stepPostHandrailLength; // 1000mm
    const minAngledPosts = Math.ceil((angledHandrailLength - angledMaxGap) / (angledBalusterWidth + angledMaxGap));
    const angledSpacing = (angledHandrailLength - minAngledPosts * angledBalusterWidth) / (minAngledPosts + 1);
    
    // Calculate positions along the handrail (in X direction, starting from post2X)
    const handrailStartX = post2X + stepPostHandrailLength / 2 - 0.05 - 0.02 - 0.02; // Start position of handrail
    const handrailStartY = stepPostHandrailY; // Top rail center Y
    const handrailEndY = stepPostHandrail2Y; // Bottom rail center Y
    
    // For each post position, calculate the Y position based on the handrail slope
    for (let i = 0; i < minAngledPosts; i++) {
      const postOffsetX = -stepPostHandrailLength / 2 + angledSpacing + i * (angledBalusterWidth + angledSpacing);
      const postX = handrailStartX + postOffsetX;
      
      // Calculate Y position at this X offset along the angled handrail
      // The handrail slopes down at stairAngle, so Y decreases as X increases
      const postOffsetY = postOffsetX * Math.tan(stairAngle); // Y offset due to angle
      const postCenterY = handrailStartY + postOffsetY; // Center Y of top rail at this position
      const postBottomY = postCenterY - angledHandrailThickness / 2; // Bottom of top rail
      
      // Bottom rail center Y at this position
      const bottomRailCenterY = handrailEndY + postOffsetY;
      const bottomRailTopY = bottomRailCenterY + angledHandrailThickness / 2; // Top of bottom rail
      
      // Post height spans from bottom of top rail to top of bottom rail
      const angledBalusterHeight = bottomRailTopY - postBottomY;
      
      // Create baluster post
      const angledBalusterGeometry = new THREE.BoxGeometry(angledBalusterWidth, angledBalusterHeight, angledBalusterDepth);
      const angledBaluster = new THREE.Mesh(angledBalusterGeometry, angledBalusterMaterial);
      
      // Position at calculated X and Y, with center at midpoint between rails
      const balusterCenterY = (postBottomY + bottomRailTopY) / 2;
      angledBaluster.position.set(
        postX,
        (balusterCenterY - baseboardsHeight / 2),
        step1PostZ
      );
      
      baseboards.add(angledBaluster);
      // Add black edge lines to angled baluster
      const angledBalusterEdgesGeometry = new THREE.EdgesGeometry(angledBalusterGeometry);
      const angledBalusterEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const angledBalusterEdges = new THREE.LineSegments(angledBalusterEdgesGeometry, angledBalusterEdgesMaterial);
      angledBaluster.add(angledBalusterEdges);
    }

    // Add upright posts between top and bottom handrails
    const balusterWidth = 0.04; // 40mm
    const balusterDepth = 0.04; // 40mm
    const topHandrailBottomY = 1.66; // 1660mm from ground
    const bottomHandrailTopY = 0.76 + handrailHeight; // 760mm + 50mm = 810mm from ground
    const balusterHeight = topHandrailBottomY - bottomHandrailTopY; // 850mm (spans between handrails)
    const maxGap = 0.125; // 125mm maximum gap between posts
    
    const balusterMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      metalness: 0.1,
      roughness: 0.7
    });
    balustradeBalusterMaterialRef.current = balusterMaterial;

    // Function to calculate number of posts and spacing for a given length
    const calculatePostSpacing = (length) => {
      // Calculate minimum number of posts needed: (length - maxGap) / (balusterWidth + maxGap)
      // This ensures max gap of 125mm
      const minPosts = Math.ceil((length - maxGap) / (balusterWidth + maxGap));
      const numPosts = Math.max(1, minPosts); // At least 1 post
      
      // Calculate actual gap: (length - numPosts * balusterWidth) / (numPosts + 1)
      const totalPostWidth = numPosts * balusterWidth;
      const totalGap = length - totalPostWidth;
      const gap = totalGap / (numPosts + 1);
      
      return { numPosts, gap };
    };

    // First set of posts: along the handrail from building wall to tall post (Z direction)
    const spacing1 = calculatePostSpacing(handrailLength);
    const startZ1 = buildingWallZ + spacing1.gap;
    
    for (let i = 0; i < spacing1.numPosts; i++) {
      const postZ = startZ1 + i * (balusterWidth + spacing1.gap);
      const balusterGeometry = new THREE.BoxGeometry(balusterWidth, balusterHeight, balusterDepth);
      const baluster = new THREE.Mesh(balusterGeometry, balusterMaterial);
      baluster.position.set(
        houseSidePostX,
        (bottomHandrailTopY + balusterHeight / 2) - baseboardsHeight / 2, // Center between handrails
        postZ
      );
      baseboards.add(baluster);
      // Add black edge lines to baluster
      const balusterEdgesGeometry = new THREE.EdgesGeometry(balusterGeometry);
      const balusterEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const balusterEdges = new THREE.LineSegments(balusterEdgesGeometry, balusterEdgesMaterial);
      baluster.add(balusterEdges);
    }

    // Second set of posts: along the handrail between the two outer posts (X direction)
    const spacing2 = calculatePostSpacing(handrail2Length);
    const startX2 = post1X + spacing2.gap;
    
    for (let i = 0; i < spacing2.numPosts; i++) {
      const postX = startX2 + i * (balusterWidth + spacing2.gap);
      const balusterGeometry = new THREE.BoxGeometry(balusterWidth, balusterHeight, balusterDepth);
      const baluster = new THREE.Mesh(balusterGeometry, balusterMaterial);
      baluster.position.set(
        postX,
        (bottomHandrailTopY + balusterHeight / 2) - baseboardsHeight / 2, // Center between handrails
        outerEdgeZ
      );
      baseboards.add(baluster);
      // Add black edge lines to baluster
      const balusterEdgesGeometry = new THREE.EdgesGeometry(balusterGeometry);
      const balusterEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const balusterEdges = new THREE.LineSegments(balusterEdgesGeometry, balusterEdgesMaterial);
      baluster.add(balusterEdges);
    }

    // Duplicate the two handrails at lower height (760mm from ground)
    const lowerHandrailBottomY = 0.76; // 760mm from ground (bottom of handrail)
    const lowerHandrailY = lowerHandrailBottomY + handrailHeight / 2; // Center Y position

    // First lower handrail (from building wall to tall post)
    const lowerHandrail1Geometry = new THREE.BoxGeometry(handrailWidth, handrailHeight, handrailLength);
    const lowerHandrail1 = new THREE.Mesh(lowerHandrail1Geometry, handrailMaterial);
    lowerHandrail1.position.set(
      houseSidePostX, // Same X as both posts
      lowerHandrailY - baseboardsHeight / 2, // Bottom at 760mm from ground, relative to baseboards center
      midZ
    );
    baseboards.add(lowerHandrail1);
    // Add black edge lines to lower handrail1
    const lowerHandrail1EdgesGeometry = new THREE.EdgesGeometry(lowerHandrail1Geometry);
    const lowerHandrail1EdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const lowerHandrail1Edges = new THREE.LineSegments(lowerHandrail1EdgesGeometry, lowerHandrail1EdgesMaterial);
    lowerHandrail1.add(lowerHandrail1Edges);

    // Second lower handrail (between the two outer posts)
    const lowerHandrail2Geometry = new THREE.BoxGeometry(handrailWidth, handrailHeight, handrail2Length);
    const lowerHandrail2 = new THREE.Mesh(lowerHandrail2Geometry, handrailMaterial);
    lowerHandrail2.position.set(
      midX,
      lowerHandrailY - baseboardsHeight / 2, // Bottom at 760mm from ground, relative to baseboards center
      outerEdgeZ
    );
    lowerHandrail2.rotation.y = Math.PI / 2; // Rotate 90 degrees around Y axis to extend in X direction
    baseboards.add(lowerHandrail2);
    // Add black edge lines to lower handrail2
    const lowerHandrail2EdgesGeometry = new THREE.EdgesGeometry(lowerHandrail2Geometry);
    const lowerHandrail2EdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const lowerHandrail2Edges = new THREE.LineSegments(lowerHandrail2EdgesGeometry, lowerHandrail2EdgesMaterial);
    lowerHandrail2.add(lowerHandrail2Edges);

    postPositions.forEach((pos) => {
      const postGeometry = new THREE.BoxGeometry(postSize, postHeight, postSize);
      const post = new THREE.Mesh(postGeometry, postMaterial);
      // Position relative to baseboards center
      // Post sits on ground (y=0), so center is at postHeight/2 from ground
      // Baseboards center is at baseboardsHeight/2 from ground
      // Post center relative to baseboards = postHeight/2 - baseboardsHeight/2
      post.position.set(
        pos.x,
        postHeight / 2 - baseboardsHeight / 2, // Position so bottom is on ground
        pos.z
      );
      baseboards.add(post); // Add as child so it rotates with baseboards
      porchPostRefs.current.push(post); // Store ref for later modification
      // Add black edge lines to porch post
      const postEdgesGeometry = new THREE.EdgesGeometry(postGeometry);
      const postEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const postEdges = new THREE.LineSegments(postEdgesGeometry, postEdgesMaterial);
      post.add(postEdges);
    });

    // Create window - exact copy of porch but red and tilted upwards, with swapped dimensions
    // Window thickness is 20mm
    const windowThickness = 0.02; // 20mm
    // Window dimensions (calculated first to determine geometry and gradient height)
    // Calculate window position so top window surround aligns with top door surround
    // Door top surround top edge: (doorBottomHeight + doorHeight) + doorSurroundWidth + 0.02
    // Door: bottom=0.71m, height=2.1m, so door top = 2.81m
    // Door top surround center: 2.81 + 0.06/2 + 0.02 = 2.86m
    // Door top surround top edge: 2.86 + 0.06/2 = 2.89m
    // Window top surround top should be at 2.89m
    // Window top surround center: (windowBottomHeight + windowHeightAfterRotation) + surroundWidth/2 + 0.02
    // Window top surround top: (windowBottomHeight + windowHeightAfterRotation) + surroundWidth + 0.02 = 2.89m
    // So: (windowBottomHeight + windowHeightAfterRotation) = 2.89 - 0.06 - 0.02 = 2.81m
    const doorTopSurroundTop = (0.71 + 2.1) + 0.06/2 + 0.02 + 0.06/2; // 2.89m (top edge of door top surround)
    const windowBottomHeight = 0.96; // 960mm above ground
    const windowTop = doorTopSurroundTop - 0.06 - 0.02; // 2.81m (where window top should be)
    const windowHeightAfterRotation = windowTop - windowBottomHeight; // 2.81 - 0.96 = 1.85m
    const windowCenterYFromGround = windowBottomHeight + windowHeightAfterRotation / 2;
    
    const windowGeometry = new THREE.BoxGeometry(porchDepth, windowThickness, windowHeightAfterRotation);
    
    // Create gradient texture for window (dark grey to lighter grey/green)
    // Window height is calculated (1.85m), scale texture to match
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = Math.round(256 * (windowHeightAfterRotation / 1.545)); // Scale height to match window height
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#6b7d6b'); // Lighter grey/green at top
    gradient.addColorStop(1, '#2a2a2a'); // Dark grey at bottom
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const windowTexture = new THREE.CanvasTexture(canvas);
    
    const windowMaterial = new THREE.MeshStandardMaterial({ 
      map: windowTexture,
      metalness: 0.3,
      roughness: 0.4
    });
    
    // Window cross material (white)
    const crossMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, // White
      metalness: 0.1,
      roughness: 0.7
    });
    windowCrossMaterialRef.current = crossMaterial;
    
    // Window surround material (white)
    const surroundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, // White
      metalness: 0.1,
      roughness: 0.7
    });
    windowSurroundMaterialRef.current = surroundMaterial;
    
    // Function to create a window and surrounds at a given X position
    const createWindowAndSurrounds = (windowCenterXPos) => {
      // Create window
      const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
      windowMesh.position.set(
        windowCenterXPos, 
        windowCenterYFromGround - baseboardsHeight / 2, // 300mm above cladding bottom
        baseboardsWidth / 2 + windowThickness / 2 // Flush with wall, accounting for rotated depth
      );
      windowMesh.rotation.x = Math.PI / 2; // Rotate 90 degrees around X to tilt it upwards (vertical)
      baseboards.add(windowMesh);
      
      // Create cross over window
      const crossThickness = 0.04; // 40mm
      const crossBarWidth = porchDepth; // Horizontal bar width = window width
      const crossBarHeight = windowHeightAfterRotation; // Vertical bar height = window height
      
      // Horizontal bars - two pieces stacked vertically with 10mm gap, centered at 600mm
      const horizontalGapCenterYFromGround = windowBottomHeight + 0.6; // 600mm from window bottom
      const horizontalGap = 0.01; // 10mm gap
      
      // Lower horizontal bar
      const lowerHorizontalBarY = horizontalGapCenterYFromGround - (horizontalGap / 2 + crossThickness / 2);
      const lowerHorizontalBarGeometry = new THREE.BoxGeometry(crossBarWidth, crossThickness, crossThickness);
      const lowerHorizontalBar = new THREE.Mesh(lowerHorizontalBarGeometry, crossMaterial);
      lowerHorizontalBar.position.set(
        windowCenterXPos,
        lowerHorizontalBarY - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      lowerHorizontalBar.rotation.x = Math.PI / 2;
      baseboards.add(lowerHorizontalBar);
      
      // Upper horizontal bar
      const upperHorizontalBarY = horizontalGapCenterYFromGround + (horizontalGap / 2 + crossThickness / 2);
      const upperHorizontalBarGeometry = new THREE.BoxGeometry(crossBarWidth, crossThickness, crossThickness);
      const upperHorizontalBar = new THREE.Mesh(upperHorizontalBarGeometry, crossMaterial);
      upperHorizontalBar.position.set(
        windowCenterXPos,
        upperHorizontalBarY - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      upperHorizontalBar.rotation.x = Math.PI / 2;
      baseboards.add(upperHorizontalBar);
      
      // Top horizontal bar
      const topHorizontalBarY = windowBottomHeight + windowHeightAfterRotation;
      const topHorizontalBarGeometry = new THREE.BoxGeometry(crossBarWidth, crossThickness, crossThickness);
      const topHorizontalBar = new THREE.Mesh(topHorizontalBarGeometry, crossMaterial);
      topHorizontalBar.position.set(
        windowCenterXPos,
        topHorizontalBarY - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      topHorizontalBar.rotation.x = Math.PI / 2;
      baseboards.add(topHorizontalBar);
      
      // Bottom horizontal bar
      const bottomHorizontalBarY = windowBottomHeight;
      const bottomHorizontalBarGeometry = new THREE.BoxGeometry(crossBarWidth, crossThickness, crossThickness);
      const bottomHorizontalBar = new THREE.Mesh(bottomHorizontalBarGeometry, crossMaterial);
      bottomHorizontalBar.position.set(
        windowCenterXPos,
        bottomHorizontalBarY - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      bottomHorizontalBar.rotation.x = Math.PI / 2;
      baseboards.add(bottomHorizontalBar);
      
      // Vertical bars - center, left, and right
      const verticalBarWidth = 0.06; // 60mm
      const verticalBarGeometry = new THREE.BoxGeometry(verticalBarWidth, crossThickness, crossBarHeight);
      
      // Center vertical bars - two 30mm pieces with 5mm gap
      const centerBarWidth = 0.03; // 30mm
      const centerGap = 0.005; // 5mm gap
      const centerBarGeometry = new THREE.BoxGeometry(centerBarWidth, crossThickness, crossBarHeight);
      
      // Left center bar
      const leftCenterBarX = windowCenterXPos - (centerGap / 2 + centerBarWidth / 2);
      const leftCenterBar = new THREE.Mesh(centerBarGeometry, crossMaterial);
      leftCenterBar.position.set(
        leftCenterBarX,
        windowCenterYFromGround - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      leftCenterBar.rotation.x = Math.PI / 2;
      baseboards.add(leftCenterBar);
      
      // Right center bar
      const rightCenterBarX = windowCenterXPos + (centerGap / 2 + centerBarWidth / 2);
      const rightCenterBar = new THREE.Mesh(centerBarGeometry, crossMaterial);
      rightCenterBar.position.set(
        rightCenterBarX,
        windowCenterYFromGround - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      rightCenterBar.rotation.x = Math.PI / 2;
      baseboards.add(rightCenterBar);
      
      // Left vertical bar
      const leftVerticalBarX = windowCenterXPos - porchDepth / 2;
      const leftVerticalBar = new THREE.Mesh(verticalBarGeometry, crossMaterial);
      leftVerticalBar.position.set(
        leftVerticalBarX,
        windowCenterYFromGround - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      leftVerticalBar.rotation.x = Math.PI / 2;
      baseboards.add(leftVerticalBar);
      
      // Right vertical bar
      const rightVerticalBarX = windowCenterXPos + porchDepth / 2;
      const rightVerticalBar = new THREE.Mesh(verticalBarGeometry, crossMaterial);
      rightVerticalBar.position.set(
        rightVerticalBarX,
        windowCenterYFromGround - baseboardsHeight / 2,
        baseboardsWidth / 2 + crossThickness / 2
      );
      rightVerticalBar.rotation.x = Math.PI / 2;
      baseboards.add(rightVerticalBar);

      // Window surrounds - 60mm frame around perimeter, 40mm thick, separate from window pieces
      const surroundWidth = 0.06; // 60mm frame width
      const surroundThickness = 0.04; // 40mm thick
      
      // Top surround
      const topSurroundGeometry = new THREE.BoxGeometry(porchDepth + surroundWidth * 2, surroundThickness, surroundWidth);
      const topSurround = new THREE.Mesh(topSurroundGeometry, surroundMaterial);
      topSurround.position.set(
        windowCenterXPos,
        (windowBottomHeight + windowHeightAfterRotation) + surroundWidth / 2 + 0.02 - baseboardsHeight / 2,
        baseboardsWidth / 2 + surroundThickness / 2
      );
      topSurround.rotation.x = Math.PI / 2;
      baseboards.add(topSurround);
      // Add black edge lines to top surround
      const topSurroundEdgesGeometry = new THREE.EdgesGeometry(topSurroundGeometry);
      const topSurroundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const topSurroundEdges = new THREE.LineSegments(topSurroundEdgesGeometry, topSurroundEdgesMaterial);
      topSurround.add(topSurroundEdges);
      
      // Bottom surround
      const bottomSurroundGeometry = new THREE.BoxGeometry(porchDepth + surroundWidth * 2, surroundThickness, surroundWidth);
      const bottomSurround = new THREE.Mesh(bottomSurroundGeometry, surroundMaterial);
      bottomSurround.position.set(
        windowCenterXPos,
        windowBottomHeight - surroundWidth / 2 - 0.02 - baseboardsHeight / 2,
        baseboardsWidth / 2 + surroundThickness / 2
      );
      bottomSurround.rotation.x = Math.PI / 2;
      baseboards.add(bottomSurround);
      // Add black edge lines to bottom surround
      const bottomSurroundEdgesGeometry = new THREE.EdgesGeometry(bottomSurroundGeometry);
      const bottomSurroundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const bottomSurroundEdges = new THREE.LineSegments(bottomSurroundEdgesGeometry, bottomSurroundEdgesMaterial);
      bottomSurround.add(bottomSurroundEdges);
      
      // Left surround
      // Reduce height by 30mm on top and 30mm on bottom (60mm total)
      const leftSurroundHeight = windowHeightAfterRotation + surroundWidth * 2 - 0.06; // Reduced by 60mm (30mm top + 30mm bottom)
      const leftSurroundGeometry = new THREE.BoxGeometry(surroundWidth, surroundWidth, leftSurroundHeight);
      const leftSurround = new THREE.Mesh(leftSurroundGeometry, surroundMaterial);
      leftSurround.position.set(
        windowCenterXPos - porchDepth / 2 - surroundWidth / 2,
        windowCenterYFromGround - baseboardsHeight / 2,
        baseboardsWidth / 2 + surroundThickness / 2
      );
      leftSurround.rotation.x = Math.PI / 2;
      baseboards.add(leftSurround);
      // Add black edge lines to left surround
      const leftSurroundEdgesGeometry = new THREE.EdgesGeometry(leftSurroundGeometry);
      const leftSurroundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const leftSurroundEdges = new THREE.LineSegments(leftSurroundEdgesGeometry, leftSurroundEdgesMaterial);
      leftSurround.add(leftSurroundEdges);
      
      // Right surround
      // Reduce height by 30mm on top and 30mm on bottom (60mm total)
      const rightSurroundHeight = windowHeightAfterRotation + surroundWidth * 2 - 0.06; // Reduced by 60mm (30mm top + 30mm bottom)
      const rightSurroundGeometry = new THREE.BoxGeometry(surroundWidth, surroundWidth, rightSurroundHeight);
      const rightSurround = new THREE.Mesh(rightSurroundGeometry, surroundMaterial);
      rightSurround.position.set(
        windowCenterXPos + porchDepth / 2 + surroundWidth / 2,
        windowCenterYFromGround - baseboardsHeight / 2,
        baseboardsWidth / 2 + surroundThickness / 2
      );
      rightSurround.rotation.x = Math.PI / 2;
      baseboards.add(rightSurround);
      // Add black edge lines to right surround
      const rightSurroundEdgesGeometry = new THREE.EdgesGeometry(rightSurroundGeometry);
      const rightSurroundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const rightSurroundEdges = new THREE.LineSegments(rightSurroundEdgesGeometry, rightSurroundEdgesMaterial);
      rightSurround.add(rightSurroundEdges);
    };
    
    // Create first window at 800mm from left side
    const windowOffsetFromLeft = 0.8; // 800mm
    const window1CenterX = -baseboardsLength / 2 + windowOffsetFromLeft + porchDepth / 2;
    createWindowAndSurrounds(window1CenterX);
    
    // Create second window 450mm from right side
    const window2CenterX = baseboardsLength / 2 - 0.45 - porchDepth / 2;
    createWindowAndSurrounds(window2CenterX);
    
    // Create third window 3450mm from right side
    const window3CenterX = baseboardsLength / 2 - 3.45 - porchDepth / 2;
    createWindowAndSurrounds(window3CenterX);

    // Create front door
    const doorWidth = 0.9;   // 900mm = 0.9m
    const doorHeight = 2.1;   // 2100mm = 2.1m
    const doorThickness = 0.005; // 5mm = 0.005m
    
    // Front door material (similar to window - grey)
    const doorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888, // Grey color
      metalness: 0.1,
      roughness: 0.7
    });
    doorMaterialRef.current = doorMaterial;
    
    // Front door geometry (width, thickness, height) - will be rotated like windows
    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorThickness, doorHeight);
    
    // Position door - 3800mm from left side, bottom at 710mm from ground
    const doorOffsetFromLeft = 3.8; // 3800mm = 3.8m from left side
    const doorCenterX = -baseboardsLength / 2 + doorOffsetFromLeft + doorWidth / 2;
    const doorBottomHeight = 0.71; // 710mm = 0.71m from ground
    const doorCenterYFromGround = doorBottomHeight + doorHeight / 2; // Center of door from ground
    
    const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
    doorMesh.position.set(
      doorCenterX,
      doorCenterYFromGround - baseboardsHeight / 2, // Relative to baseboards center (baseboards center is at baseboardsHeight/2)
      baseboardsWidth / 2 + doorThickness / 2 // Flush with wall, accounting for rotated depth
    );
    doorMesh.rotation.x = Math.PI / 2; // Rotate 90 degrees around X to tilt it upwards (vertical)
    baseboards.add(doorMesh);
    // Add black edge lines to front door
    const doorEdgesGeometry = new THREE.EdgesGeometry(doorGeometry);
    const doorEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const doorEdges = new THREE.LineSegments(doorEdgesGeometry, doorEdgesMaterial);
    doorMesh.add(doorEdges);

    // Add 4 rectangles (window panes) on the front door
    const rectangleWidth = 0.7;   // 700mm = 0.7m
    const rectangleHeight = 0.12;  // 120mm = 0.12m
    const rectangleThickness = 0.001; // 1mm thick
    const rectangleSpacing = 0.42; // 420mm = 0.42m spacing between rectangles
    
    // Create gradient texture for door rectangles (left to right gradient)
    const doorRectangleCanvas = document.createElement('canvas');
    doorRectangleCanvas.width = 256;
    doorRectangleCanvas.height = 256;
    const doorRectangleCtx = doorRectangleCanvas.getContext('2d');
    const doorRectangleGradient = doorRectangleCtx.createLinearGradient(0, 0, 256, 0); // Left to right
    doorRectangleGradient.addColorStop(0, '#6b7d6b'); // Lighter grey/green at left
    doorRectangleGradient.addColorStop(1, '#2a2a2a'); // Dark grey at right
    doorRectangleCtx.fillStyle = doorRectangleGradient;
    doorRectangleCtx.fillRect(0, 0, 256, 256);
    const doorRectangleTexture = new THREE.CanvasTexture(doorRectangleCanvas);
    
    // Outline material (dark grey)
    const doorRectangleOutlineMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333, // Dark grey
      metalness: 0.1,
      roughness: 0.7
    });
    
    // Door rectangle material (same gradient as window)
    const doorRectangleMaterial = new THREE.MeshStandardMaterial({ 
      map: doorRectangleTexture,
      metalness: 0.3,
      roughness: 0.4
    });
    
    // Calculate starting position to center rectangles vertically on door
    // Door height is 2.1m, we have 4 rectangles of 0.1m each = 0.4m total
    // 3 gaps of 0.42m = 1.26m total
    // Total used: 0.4 + 1.26 = 1.66m
    // Remaining: 2.1 - 1.66 = 0.44m
    // Start position: 0.44 / 2 = 0.22m from bottom of door
    const rectangleStartFromBottom = 0.22; // 220mm from bottom of door
    
    const outlineThickness = 0.002; // 2mm thick outline
    const outlineWidth = 0.003; // 3mm wide outline
    
    for (let i = 0; i < 4; i++) {
      // Rectangle geometry: width (X), thickness (Y), height (Z)
      // After rotation, X stays X, Y becomes Z (depth), Z becomes Y (height)
      const rectangleGeometry = new THREE.BoxGeometry(rectangleWidth, rectangleThickness, rectangleHeight);
      const rectangleMesh = new THREE.Mesh(rectangleGeometry, doorRectangleMaterial);
      
      // Calculate Y position: door bottom + start offset + (rectangle height/2) + (i * (rectangle height + spacing))
      const rectangleBottomFromDoorBottom = rectangleStartFromBottom + (i * (rectangleHeight + rectangleSpacing));
      const rectangleCenterYFromDoorBottom = rectangleBottomFromDoorBottom + rectangleHeight / 2;
      const rectangleCenterYFromGround = doorBottomHeight + rectangleCenterYFromDoorBottom;
      
      // Position: same X as door, calculated Y, slightly in front of door surface
      const rectangleZ = baseboardsWidth / 2 + doorThickness + rectangleThickness / 2 + 0.001;
      rectangleMesh.position.set(
        doorCenterX, // Same X as door (centered horizontally)
        rectangleCenterYFromGround - baseboardsHeight / 2, // Relative to baseboards center
        rectangleZ // In front of door surface with small offset
      );
      rectangleMesh.rotation.x = Math.PI / 2; // Same rotation as door (90 degrees around X)
      baseboards.add(rectangleMesh);
      // Add black edge lines to door rectangle
      const rectangleEdgesGeometry = new THREE.EdgesGeometry(rectangleGeometry);
      const rectangleEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
      const rectangleEdges = new THREE.LineSegments(rectangleEdgesGeometry, rectangleEdgesMaterial);
      rectangleMesh.add(rectangleEdges);
      
      // Create outline frame around the rectangle
      // Top edge
      const topOutlineGeometry = new THREE.BoxGeometry(rectangleWidth + outlineWidth * 2, outlineThickness, outlineWidth);
      const topOutline = new THREE.Mesh(topOutlineGeometry, doorRectangleOutlineMaterial);
      topOutline.position.set(
        doorCenterX,
        rectangleCenterYFromGround - baseboardsHeight / 2 + rectangleHeight / 2 + outlineWidth / 2,
        rectangleZ + outlineThickness / 2
      );
      topOutline.rotation.x = Math.PI / 2;
      baseboards.add(topOutline);
      
      // Bottom edge
      const bottomOutlineGeometry = new THREE.BoxGeometry(rectangleWidth + outlineWidth * 2, outlineThickness, outlineWidth);
      const bottomOutline = new THREE.Mesh(bottomOutlineGeometry, doorRectangleOutlineMaterial);
      bottomOutline.position.set(
        doorCenterX,
        rectangleCenterYFromGround - baseboardsHeight / 2 - rectangleHeight / 2 - outlineWidth / 2,
        rectangleZ + outlineThickness / 2
      );
      bottomOutline.rotation.x = Math.PI / 2;
      baseboards.add(bottomOutline);
      
      // Left edge
      const leftOutlineGeometry = new THREE.BoxGeometry(outlineWidth, outlineThickness, rectangleHeight);
      const leftOutline = new THREE.Mesh(leftOutlineGeometry, doorRectangleOutlineMaterial);
      leftOutline.position.set(
        doorCenterX - rectangleWidth / 2 - outlineWidth / 2,
        rectangleCenterYFromGround - baseboardsHeight / 2,
        rectangleZ + outlineThickness / 2
      );
      leftOutline.rotation.x = Math.PI / 2;
      baseboards.add(leftOutline);
      
      // Right edge
      const rightOutlineGeometry = new THREE.BoxGeometry(outlineWidth, outlineThickness, rectangleHeight);
      const rightOutline = new THREE.Mesh(rightOutlineGeometry, doorRectangleOutlineMaterial);
      rightOutline.position.set(
        doorCenterX + rectangleWidth / 2 + outlineWidth / 2,
        rectangleCenterYFromGround - baseboardsHeight / 2,
        rectangleZ + outlineThickness / 2
      );
      rightOutline.rotation.x = Math.PI / 2;
      baseboards.add(rightOutline);
    }

    // Add door surrounds (left, right, top) - same as window surrounds
    const doorSurroundWidth = 0.06; // 60mm frame width (same as window surrounds)
    const doorSurroundThickness = 0.04; // 40mm thick (same as window surrounds)
    
    // Top surround
    const doorTopSurroundGeometry = new THREE.BoxGeometry(doorWidth + doorSurroundWidth * 2, doorSurroundThickness, doorSurroundWidth);
    const doorTopSurround = new THREE.Mesh(doorTopSurroundGeometry, surroundMaterial);
    doorTopSurround.position.set(
      doorCenterX,
      (doorBottomHeight + doorHeight) + doorSurroundWidth / 2 + 0.02 - baseboardsHeight / 2,
      baseboardsWidth / 2 + doorSurroundThickness / 2
    );
    doorTopSurround.rotation.x = Math.PI / 2;
    baseboards.add(doorTopSurround);
    // Add black edge lines to door top surround
    const doorTopSurroundEdgesGeometry = new THREE.EdgesGeometry(doorTopSurroundGeometry);
    const doorTopSurroundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const doorTopSurroundEdges = new THREE.LineSegments(doorTopSurroundEdgesGeometry, doorTopSurroundEdgesMaterial);
    doorTopSurround.add(doorTopSurroundEdges);
    
    // Left surround
    const doorLeftSurroundGeometry = new THREE.BoxGeometry(doorSurroundWidth, doorSurroundWidth, doorHeight + doorSurroundWidth);
    const doorLeftSurround = new THREE.Mesh(doorLeftSurroundGeometry, surroundMaterial);
    doorLeftSurround.position.set(
      doorCenterX - doorWidth / 2 - doorSurroundWidth / 2,
      doorCenterYFromGround - baseboardsHeight / 2,
      baseboardsWidth / 2 + doorSurroundThickness / 2
    );
    doorLeftSurround.rotation.x = Math.PI / 2;
    baseboards.add(doorLeftSurround);
    // Add black edge lines to door left surround
    const doorLeftSurroundEdgesGeometry = new THREE.EdgesGeometry(doorLeftSurroundGeometry);
    const doorLeftSurroundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const doorLeftSurroundEdges = new THREE.LineSegments(doorLeftSurroundEdgesGeometry, doorLeftSurroundEdgesMaterial);
    doorLeftSurround.add(doorLeftSurroundEdges);
    
    // Right surround
    const doorRightSurroundGeometry = new THREE.BoxGeometry(doorSurroundWidth, doorSurroundWidth, doorHeight + doorSurroundWidth);
    const doorRightSurround = new THREE.Mesh(doorRightSurroundGeometry, surroundMaterial);
    doorRightSurround.position.set(
      doorCenterX + doorWidth / 2 + doorSurroundWidth / 2,
      doorCenterYFromGround - baseboardsHeight / 2,
      baseboardsWidth / 2 + doorSurroundThickness / 2
    );
    doorRightSurround.rotation.x = Math.PI / 2;
    baseboards.add(doorRightSurround);
    // Add black edge lines to door right surround
    const doorRightSurroundEdgesGeometry = new THREE.EdgesGeometry(doorRightSurroundGeometry);
    const doorRightSurroundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const doorRightSurroundEdges = new THREE.LineSegments(doorRightSurroundEdgesGeometry, doorRightSurroundEdgesMaterial);
    doorRightSurround.add(doorRightSurroundEdges);

    // Create weatherboard lines on baseboards every 220mm
    const baseboardWeatherboardSpacing = 0.22; // 220mm = 0.22m
    const baseboardLineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x000000, // Black
      linewidth: 2
    });
    
    // Create horizontal lines that wrap around the baseboards
    // Start from bottom and go up every 220mm
    for (let y = baseboardWeatherboardSpacing; y < baseboardsHeight; y += baseboardWeatherboardSpacing) {
      const yRelative = y - baseboardsHeight / 2; // Convert to relative coordinates
      const vertices = new Float32Array([
        // Start at front-left corner, go around the rectangle
        -baseboardsLength / 2, yRelative, -baseboardsWidth / 2,   // Front-left
        baseboardsLength / 2, yRelative, -baseboardsWidth / 2,    // Front-right
        baseboardsLength / 2, yRelative, baseboardsWidth / 2,     // Back-right
        -baseboardsLength / 2, yRelative, baseboardsWidth / 2,    // Back-left
        // Close the loop (back to start)
        -baseboardsLength / 2, yRelative, -baseboardsWidth / 2,   // Front-left
      ]);
      
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      
      const line = new THREE.LineLoop(lineGeometry, baseboardLineMaterial);
      baseboards.add(line);
    }

    // Helper function to create text sprite
    const createTextSprite = (text) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 64;
      canvas.height = 64;
      context.fillStyle = 'white';
      context.font = 'Bold 48px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 32, 32);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(0.3, 0.3, 1);
      return sprite;
    };

    // Define the 5 points (not shown, but remembered)
    // Points are in world coordinates (absolute)
    // Baseboards center is at (0, baseboardsHeight/2, 0) in world space
    // Top of baseboards is at Y = baseboardsHeight (absolute) = 0.65m
    
    // Point 1: Left side of short side (top edge of baseboards) - in world coordinates
    const point1X = -baseboardsLength / 2;
    const point1Y = baseboardsHeight; // Top of baseboards (absolute Y = 0.65m)
    const point1Z = -baseboardsWidth / 2;

    // Point 2: 2600mm (2.6m) above point 1
    const point2X = -baseboardsLength / 2;
    const point2Y = baseboardsHeight + 2.6; // 2.6m above top of baseboards
    const point2Z = -baseboardsWidth / 2;

    // Point 3: Between point 2 and point 4, raised to create angle
    // Superior: 15 degrees, Affordable: 3 degrees, Skillion: 5 degrees
    const angle15Deg = 15 * Math.PI / 180;
    const angle3Deg = 3 * Math.PI / 180;
    const angle5Deg = 5 * Math.PI / 180;
    const rise15 = (baseboardsWidth / 2) * Math.tan(angle15Deg);
    const rise3 = (baseboardsWidth / 2) * Math.tan(angle3Deg);
    const rise5 = (baseboardsWidth / 2) * Math.tan(angle5Deg);
    
    // Superior shape - 15 degree pitch
    const point3X_Superior = -baseboardsLength / 2;
    const point3Y_Superior = baseboardsHeight + 2.6 + rise15; // Above point 2 by the rise amount
    const point3Z_Superior = 0;
    
    // Affordable shape - 3 degree pitch
    const point3X_Affordable = -baseboardsLength / 2;
    const point3Y_Affordable = baseboardsHeight + 2.6 + rise3; // Above point 2 by the rise amount
    const point3Z_Affordable = 0;
    
    // Skillion shape - 5 degree pitch (rotated 180 degrees)
    // Point 3 is directly above point 2 (same X and Z, just higher Y)
    // There is a 5-degree angle between points 2, 4, and 3
    // The angle is at point 3, between the line from 3 to 2 (vertical) and the line from 3 to 4 (diagonal)
    // Horizontal distance from point 3 to point 4 is baseboardsWidth (from Z = -baseboardsWidth/2 to Z = baseboardsWidth/2)
    // For a 5-degree angle: tan(5°) = rise / baseboardsWidth
    const rise5_Skillion = baseboardsWidth * Math.tan(angle5Deg);
    const point3X_Skillion = -baseboardsLength / 2;
    const point3Y_Skillion = baseboardsHeight + 2.6 + rise5_Skillion; // Above point 2 by the rise amount
    const point3Z_Skillion = -baseboardsWidth / 2; // Same Z as point 2 (directly above it, left side)

    // Point 4: 2600mm (2.6m) above point 5
    const point4X = -baseboardsLength / 2;
    const point4Y = baseboardsHeight + 2.6; // Same height as point 2
    const point4Z = baseboardsWidth / 2;

    // Point 5: Right side of the same short side (top edge of baseboards)
    const point5X = -baseboardsLength / 2;
    const point5Y = baseboardsHeight; // Top of baseboards, same as point 1
    const point5Z = baseboardsWidth / 2;

    // Create function to build shape from points
    const createShapeFromPoints = (point3X, point3Y, point3Z) => {
      const shape = new THREE.Shape();
      // Points are in world coordinates, but since the extruded shape will be a child of baseboards,
      // we need to convert to coordinates relative to baseboards center
      // Baseboards center is at Y = baseboardsHeight/2 in world space
      // So subtract baseboardsHeight/2 from Y to get relative coordinates
      const shapePoint1 = new THREE.Vector2(point1Z, point1Y - baseboardsHeight / 2); // Z, Y (relative to baseboards center)
      const shapePoint2 = new THREE.Vector2(point2Z, point2Y - baseboardsHeight / 2);
      const shapePoint3 = new THREE.Vector2(point3Z, point3Y - baseboardsHeight / 2);
      const shapePoint4 = new THREE.Vector2(point4Z, point4Y - baseboardsHeight / 2);
      const shapePoint5 = new THREE.Vector2(point5Z, point5Y - baseboardsHeight / 2);
      
      shape.moveTo(shapePoint1.x, shapePoint1.y);
      shape.lineTo(shapePoint2.x, shapePoint2.y);
      shape.lineTo(shapePoint3.x, shapePoint3.y);
      shape.lineTo(shapePoint4.x, shapePoint4.y);
      shape.lineTo(shapePoint5.x, shapePoint5.y);
      shape.lineTo(shapePoint1.x, shapePoint1.y); // Close the shape
      
      return shape;
    };
    
    // Create Superior shape (15 degree pitch)
    const superiorShape = createShapeFromPoints(point3X_Superior, point3Y_Superior, point3Z_Superior);
    const extrudeSettings = {
      depth: baseboardsLength,
      bevelEnabled: false
    };
    const superiorExtrudeGeometry = new THREE.ExtrudeGeometry(superiorShape, extrudeSettings);
    superiorExtrudeGeometry.rotateY(Math.PI / 2);
    superiorExtrudeGeometry.translate(-baseboardsLength / 2, 0, 0);
    
    // Create Affordable shape (3 degree pitch)
    const affordableShape = createShapeFromPoints(point3X_Affordable, point3Y_Affordable, point3Z_Affordable);
    const affordableExtrudeGeometry = new THREE.ExtrudeGeometry(affordableShape, extrudeSettings);
    affordableExtrudeGeometry.rotateY(Math.PI / 2);
    affordableExtrudeGeometry.translate(-baseboardsLength / 2, 0, 0);
    
    const polygonMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc, // Lighter grey (darker than white but lighter than baseboards 0x888888)
      metalness: 0.1,
      roughness: 0.7,
      side: THREE.DoubleSide
    });
    polygonMaterialRef.current = polygonMaterial;
    
    const superiorMesh = new THREE.Mesh(superiorExtrudeGeometry, polygonMaterial);
    superiorShapeRef.current = superiorMesh;
    
    // Add black edge lines to superior cladding shape
    const superiorEdgesGeometry = new THREE.EdgesGeometry(superiorExtrudeGeometry);
    const superiorEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const superiorEdges = new THREE.LineSegments(superiorEdgesGeometry, superiorEdgesMaterial);
    superiorMesh.add(superiorEdges); // Add as child so it rotates with the mesh
    
    const affordableMesh = new THREE.Mesh(affordableExtrudeGeometry, polygonMaterial);
    affordableShapeRef.current = affordableMesh;
    
    // Add black edge lines to affordable cladding shape
    const affordableEdgesGeometry = new THREE.EdgesGeometry(affordableExtrudeGeometry);
    const affordableEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const affordableEdges = new THREE.LineSegments(affordableEdgesGeometry, affordableEdgesMaterial);
    affordableMesh.add(affordableEdges); // Add as child so it rotates with the mesh
    
    // Create Skillion shape (5 degree pitch)
    const skillionShape = createShapeFromPoints(point3X_Skillion, point3Y_Skillion, point3Z_Skillion);
    const skillionExtrudeGeometry = new THREE.ExtrudeGeometry(skillionShape, extrudeSettings);
    skillionExtrudeGeometry.rotateY(Math.PI / 2);
    skillionExtrudeGeometry.translate(-baseboardsLength / 2, 0, 0);
    
    const skillionMesh = new THREE.Mesh(skillionExtrudeGeometry, polygonMaterial);
    skillionShapeRef.current = skillionMesh;
    
    // Add black edge lines to skillion cladding shape
    const skillionEdgesGeometry = new THREE.EdgesGeometry(skillionExtrudeGeometry);
    const skillionEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const skillionEdges = new THREE.LineSegments(skillionEdgesGeometry, skillionEdgesMaterial);
    skillionMesh.add(skillionEdges); // Add as child so it rotates with the mesh
    
    // Show the appropriate shape based on roofStyle
    if (roofStyle === "Superior") {
      baseboards.add(superiorMesh); // Add as child so it rotates with baseboards
    } else if (roofStyle === "Affordable") {
      baseboards.add(affordableMesh); // Add as child so it rotates with baseboards
    } else if (roofStyle === "Skillion") {
      baseboards.add(skillionMesh); // Add as child so it rotates with baseboards
    }

    // Create weatherboard lines - dark grey flat planes every 200mm
    // Function to calculate Z coordinates at a given Y height for each roof style
    const getZAtHeight = (y, style) => {
      // Convert Y from world coordinates to relative to baseboards center
      const yRelative = y - baseboardsHeight / 2;
      const yWorld = y; // y is already in world coordinates
      
      if (style === "Superior") {
        // For Superior: shape goes from point1 (Y=baseboardsHeight, Z=-baseboardsWidth/2) 
        // to point2 (Y=baseboardsHeight+2.6, Z=-baseboardsWidth/2) on left
        // and point5 (Y=baseboardsHeight, Z=baseboardsWidth/2) to point4 (Y=baseboardsHeight+2.6, Z=baseboardsWidth/2) on right
        // Point 3 is at peak (Y=point3Y_Superior, Z=0)
        if (yWorld <= baseboardsHeight) {
          // Below cladding, return full width
          return { leftZ: -baseboardsWidth / 2, rightZ: baseboardsWidth / 2 };
        } else if (yWorld >= point3Y_Superior) {
          // At or above peak, no width
          return { leftZ: 0, rightZ: 0 };
        } else if (yWorld <= baseboardsHeight + 2.6) {
          // Between point1/5 and point2/4 - vertical sides
          return { leftZ: -baseboardsWidth / 2, rightZ: baseboardsWidth / 2 };
        } else {
          // Between point2/4 and point3 - tapered
          const t = (yWorld - (baseboardsHeight + 2.6)) / (point3Y_Superior - (baseboardsHeight + 2.6));
          const leftZ = -baseboardsWidth / 2 + (baseboardsWidth / 2) * t;
          const rightZ = baseboardsWidth / 2 - (baseboardsWidth / 2) * t;
          return { leftZ, rightZ };
        }
      } else if (style === "Affordable") {
        // Same logic as Superior but with point3Y_Affordable
        if (yWorld <= baseboardsHeight) {
          return { leftZ: -baseboardsWidth / 2, rightZ: baseboardsWidth / 2 };
        } else if (yWorld >= point3Y_Affordable) {
          return { leftZ: 0, rightZ: 0 };
        } else if (yWorld <= baseboardsHeight + 2.6) {
          return { leftZ: -baseboardsWidth / 2, rightZ: baseboardsWidth / 2 };
        } else {
          const t = (yWorld - (baseboardsHeight + 2.6)) / (point3Y_Affordable - (baseboardsHeight + 2.6));
          const leftZ = -baseboardsWidth / 2 + (baseboardsWidth / 2) * t;
          const rightZ = baseboardsWidth / 2 - (baseboardsWidth / 2) * t;
          return { leftZ, rightZ };
        }
      } else if (style === "Skillion") {
        // For Skillion: point 3 is directly above point 4
        // Left side: point1 to point2 (vertical)
        // Right side: point5 to point4 to point3 (vertical then angled)
        if (yWorld <= baseboardsHeight) {
          return { leftZ: -baseboardsWidth / 2, rightZ: baseboardsWidth / 2 };
        } else if (yWorld >= point3Y_Skillion) {
          return { leftZ: 0, rightZ: 0 };
        } else if (yWorld <= baseboardsHeight + 2.6) {
          // Vertical sides
          return { leftZ: -baseboardsWidth / 2, rightZ: baseboardsWidth / 2 };
        } else {
          // Between point4 and point3 - angled on right side only
          const t = (yWorld - (baseboardsHeight + 2.6)) / (point3Y_Skillion - (baseboardsHeight + 2.6));
          const leftZ = -baseboardsWidth / 2; // Left stays vertical
          const rightZ = baseboardsWidth / 2 - (baseboardsWidth / 2) * t; // Right tapers
          return { leftZ, rightZ };
        }
      }
      return { leftZ: -baseboardsWidth / 2, rightZ: baseboardsWidth / 2 };
    };

    // Weatherboard lines will be created in the roofStyle useEffect

    // Store renderer and camera for later use
    rendererRef.current = renderer;
    cameraRef.current = camera;
    
    // Initialize camera position to match default selectedBuildingPart (cladding)
    // Camera should be at 1.8m height and 10m distance for cladding
    const lookAtPoint = new THREE.Vector3(0, 2, 0);
    const initialHeight = 1.8;
    const initialDistance = 10.0;
    const heightDiff = initialHeight - lookAtPoint.y;
    const horizontalDistance = Math.sqrt(
      Math.max(0, initialDistance * initialDistance - heightDiff * heightDiff)
    );
    // Position camera at 45-degree angle (equal X and Z)
    const angle = Math.PI / 4; // 45 degrees
    camera.position.set(
      lookAtPoint.x + Math.cos(angle) * horizontalDistance,
      initialHeight,
      lookAtPoint.z + Math.sin(angle) * horizontalDistance
    );
    camera.lookAt(lookAtPoint);
    
    // Sync refs with initial position
    currentCameraHeightRef.current = initialHeight;
    targetCameraHeightRef.current = initialHeight;
    currentCameraDistanceRef.current = initialDistance;
    targetCameraDistanceRef.current = initialDistance;
    cameraDistanceRef.current = initialDistance;

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      // Smooth camera height and distance transitions
      if (cameraRef.current) {
        const lookAtPoint = new THREE.Vector3(0, 2, 0);
        
        // Smooth height interpolation
        const targetHeight = targetCameraHeightRef.current;
        const currentHeight = currentCameraHeightRef.current;
        const lerpFactor = 0.05;
        const newHeight = currentHeight + (targetHeight - currentHeight) * lerpFactor;
        currentCameraHeightRef.current = newHeight;
        
        // Smooth distance interpolation
        const targetDistance = targetCameraDistanceRef.current;
        const currentDistance = currentCameraDistanceRef.current;
        const newDistance = currentDistance + (targetDistance - currentDistance) * lerpFactor;
        currentCameraDistanceRef.current = newDistance;
        cameraDistanceRef.current = newDistance; // Update the main distance ref too
        
        // Calculate direction from lookAt point to current camera position
        const currentDirection = new THREE.Vector3()
          .subVectors(cameraRef.current.position, lookAtPoint)
          .normalize();
        
        // Get horizontal direction (project onto XZ plane)
        const horizontalDirection = new THREE.Vector3(currentDirection.x, 0, currentDirection.z).normalize();
        
        // Calculate new position maintaining the target height and distance
        const heightDiff = newHeight - lookAtPoint.y;
        const horizontalDistance = Math.sqrt(
          Math.max(0, newDistance * newDistance - heightDiff * heightDiff)
        );
        
        cameraRef.current.position.set(
          lookAtPoint.x + horizontalDirection.x * horizontalDistance,
          newHeight,
          lookAtPoint.z + horizontalDirection.z * horizontalDistance
        );
        cameraRef.current.lookAt(lookAtPoint);
      }
      
      // No automatic rotation - user controls rotation via drag
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();
    
    // Mouse drag controls for rotation
    const handleMouseDown = (e) => {
      isDraggingRef.current = true;
      previousMouseXRef.current = e.clientX;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }
    };
    
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !baseboardsRef.current) return;
      
      const deltaX = e.clientX - previousMouseXRef.current;
      baseboardsRef.current.rotation.y += deltaX * rotationSpeedRef.current;
      previousMouseXRef.current = e.clientX;
    };
    
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grab';
      }
    };
    
    const handleMouseLeave = () => {
      isDraggingRef.current = false;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grab';
      }
    };
    
    // Mouse wheel zoom handler
    const handleWheel = (e) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      
      const zoomSpeed = 0.05;
      const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
      
      // Update target distance for smooth animation
      targetCameraDistanceRef.current *= delta;
      
      // Clamp zoom distance
      targetCameraDistanceRef.current = Math.max(5, Math.min(30, targetCameraDistanceRef.current));
      
      // Also update current distance immediately for responsive feel
      currentCameraDistanceRef.current = targetCameraDistanceRef.current;
      cameraDistanceRef.current = targetCameraDistanceRef.current;
    };
    
    // Add event listeners
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'grab';
      canvasRef.current.addEventListener('mousedown', handleMouseDown);
      canvasRef.current.addEventListener('mousemove', handleMouseMove);
      canvasRef.current.addEventListener('mouseup', handleMouseUp);
      canvasRef.current.addEventListener('mouseleave', handleMouseLeave);
      canvasRef.current.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Handle window resize
    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current) return;
      const newWidth = canvasRef.current.clientWidth;
      const newHeight = canvasRef.current.clientHeight;
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // Remove mouse event listeners
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('mousedown', handleMouseDown);
        canvasRef.current.removeEventListener('mousemove', handleMouseMove);
        canvasRef.current.removeEventListener('mouseup', handleMouseUp);
        canvasRef.current.removeEventListener('mouseleave', handleMouseLeave);
        canvasRef.current.removeEventListener('wheel', handleWheel);
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      baseboardsGeometry.dispose();
      baseboardsMaterial.dispose();
      // Weatherboard lines removed
    };
  }, []);

  // Show/hide cladding shape and create roof planes based on roofStyle
  useEffect(() => {
    if (!baseboardsRef.current) return;
    
    // If shapes haven't been created yet, wait for them
    if (!superiorShapeRef.current || !affordableShapeRef.current || !skillionShapeRef.current) return;

    // Remove all weatherboard lines first
    if (weatherboardLinesRef.current) {
      weatherboardLinesRef.current.forEach(line => {
        if (baseboardsRef.current.children.includes(line)) {
          baseboardsRef.current.remove(line);
          line.geometry.dispose();
          line.material.dispose();
        }
      });
      weatherboardLinesRef.current = [];
    }

    // Remove all shapes first
    if (baseboardsRef.current.children.includes(superiorShapeRef.current)) {
      baseboardsRef.current.remove(superiorShapeRef.current);
    }
    if (baseboardsRef.current.children.includes(affordableShapeRef.current)) {
      baseboardsRef.current.remove(affordableShapeRef.current);
    }
    if (baseboardsRef.current.children.includes(skillionShapeRef.current)) {
      baseboardsRef.current.remove(skillionShapeRef.current);
    }

    // Remove all roof planes (including corrugated lines which are children)
    superiorRoofRef.current.forEach(roof => {
      if (baseboardsRef.current.children.includes(roof)) {
        // Dispose all children (corrugated lines) before disposing the roof
        roof.children.forEach(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        baseboardsRef.current.remove(roof);
        roof.geometry.dispose();
        roof.material.dispose();
      }
    });
    superiorRoofRef.current = [];
    
    affordableRoofRef.current.forEach(roof => {
      if (baseboardsRef.current.children.includes(roof)) {
        // Dispose all children (corrugated lines) before disposing the roof
        roof.children.forEach(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        baseboardsRef.current.remove(roof);
        roof.geometry.dispose();
        roof.material.dispose();
      }
    });
    affordableRoofRef.current = [];
    
    if (skillionRoofRef.current && baseboardsRef.current.children.includes(skillionRoofRef.current)) {
      baseboardsRef.current.remove(skillionRoofRef.current);
      skillionRoofRef.current.geometry.dispose();
      skillionRoofRef.current.material.dispose();
      skillionRoofRef.current = null;
    }

    // Constants for roof plane creation (needed for porch roof too)
    const baseboardsHeight = 0.65;
    const baseboardsLength = 11.3;
    const baseboardsWidth = 5.0;
    
    // Handle porch roof based on roof style
    // Remove current porch roof from scene (but don't dispose original)
    if (porchRoofRef.current && baseboardsRef.current.children.includes(porchRoofRef.current)) {
      baseboardsRef.current.remove(porchRoofRef.current);
      
      // Only dispose if it's the superior roof (not the original)
      if (porchRoofRef.current !== originalPorchRoofRef.current) {
        if (porchRoofRef.current.geometry) {
          porchRoofRef.current.geometry.dispose();
        }
        if (porchRoofRef.current.material && porchRoofRef.current.material !== porchRoofMaterialRef.current) {
          porchRoofRef.current.material.dispose();
        }
      }
      porchRoofRef.current = null;
    }
    
    // Remove superior porch roof planes if they exist
    superiorPorchRoofPlanesRef.current.forEach(plane => {
      if (baseboardsRef.current && baseboardsRef.current.children.includes(plane)) {
        baseboardsRef.current.remove(plane);
        if (plane.geometry) plane.geometry.dispose();
        if (plane.material) plane.material.dispose();
      }
    });
    superiorPorchRoofPlanesRef.current = [];
    
    // Create porch roof based on roof style
    if (roofStyle === "Superior") {
      // Create triangular superior porch roof using the porch post positions
      const porchWidth = 2.09;   // 2090mm = 2.09m
      const porchDepth = 1.545;   // 1545mm = 1.545m
      const porchOffsetFromLeft = 3.4; // 3400mm = 3.4m from left side
      const porchCenterX = -baseboardsLength / 2 + porchOffsetFromLeft + porchWidth / 2;
      const porchCenterZ = baseboardsWidth / 2 + porchDepth / 2;
      
      // Porch post positions and height - EXACTLY as defined in the initial setup
      const postSize = 0.1;      // 100mm = 0.1m
      const basePostHeight = 2.7 + 0.11;    // 2810mm = 2.81m (base height)
      const postInset = 0.145;   // 145mm = 0.145m inset from edges
      
      // For Superior, posts need to be taller to meet the underside of the superior porch roof
      // The porch roof stays at its original height, but posts need to be taller
      const heightOffset = 0.44; // 440mm = 0.44m - how much taller the posts need to be
      const superiorPostHeight = basePostHeight + heightOffset; // 3.25m = 2810mm + 440mm
      
      // Left post (Point 1): top of tall porch post on the left side
      // Use EXACT same positions as the posts are created in initial setup
      const post1X = porchCenterX - porchWidth / 2 + postInset;
      const post1Z = porchCenterZ + porchDepth / 2 - postInset;
      const point1X = post1X;
      // Triangle gable is 410mm higher than the original post height (460mm - 50mm)
      // Post center is at (basePostHeight / 2) - baseboardsHeight / 2, so top is at basePostHeight - baseboardsHeight / 2
      // Add 410mm (0.41m) for the triangle gable
      const point1Y = basePostHeight - baseboardsHeight / 2 + 0.41;
      const point1Z = post1Z;
      
      // Right post (Point 3): top of tall porch post on the right side
      const post2X = porchCenterX + porchWidth / 2 - postInset;
      const post2Z = porchCenterZ + porchDepth / 2 - postInset;
      const point3X = post2X;
      const point3Y = basePostHeight - baseboardsHeight / 2 + 0.41;
      const point3Z = post2Z;
      
      // Point 2: midway between point 1 and 3, elevated to create 15-degree angle
      const point2X = (point1X + point3X) / 2; // Midpoint X
      const point2Z = (point1Z + point3Z) / 2; // Midpoint Z
      
      // Point 2 Y will be calculated later based on the extended line
      const point2Y = point1Y;
      
      // Calculate points for the triangle
      const overhang = 0.15; // 150mm = 0.15m (100mm + 50mm)
      
      // Calculate direction vector from point 1 to point 3
      const direction = new THREE.Vector3(point3X - point1X, point3Y - point1Y, point3Z - point1Z);
      direction.normalize();
      
      // Extend point 1 backwards by overhang amount
      const extendedPoint1 = new THREE.Vector3(point1X, point1Y, point1Z).sub(direction.clone().multiplyScalar(overhang));
      
      // Extend point 3 forwards by overhang amount
      const extendedPoint3 = new THREE.Vector3(point3X, point3Y, point3Z).add(direction.clone().multiplyScalar(overhang));
      
      // Move line 150mm further away from the building (in +Z direction)
      const offsetFromBuilding = 0.15; // 150mm = 0.15m
      extendedPoint1.z += offsetFromBuilding;
      extendedPoint3.z += offsetFromBuilding;
      
      // Point 1: one end of the line
      const point1 = extendedPoint1;
      // Point 3: other end of the line
      const point3 = extendedPoint3;
      
      // Calculate the horizontal distance from point 1 to point 2 (half the distance from point 1 to point 3)
      const horizontalDistanceToPoint2 = Math.sqrt(
        Math.pow(point3.x - point1.x, 2) + Math.pow(point3.z - point1.z, 2)
      ) / 2; // Half the distance from point 1 to point 3
      
      // For a 15-degree angle at point 1 between points 3,1,2: rise = run * tan(15°)
      // The angle is measured from the horizontal line (point 1 to point 3) to the line (point 1 to point 2)
      const angle15Deg = 15 * Math.PI / 180;
      const rise = horizontalDistanceToPoint2 * Math.tan(angle15Deg);
      
      // Point 2: midpoint between point 1 and 3, elevated to create 15-degree angle
      const midpoint = new THREE.Vector3(
        (point1.x + point3.x) / 2,
        (point1.y + point3.y) / 2,
        (point1.z + point3.z) / 2
      );
      const point2 = new THREE.Vector3(midpoint.x, point1.y + rise, midpoint.z);
      
      // Extrude the triangle back towards the building to sit flush on the cladding
      // Cladding is at the building wall: Z = baseboardsWidth / 2
      const claddingZ = baseboardsWidth / 2;
      
      // Calculate how far back to extrude the triangle
      // The triangle front face is at point1.z, back face should be at claddingZ
      const extrusionDepth = point1.z - claddingZ;
      
      // Create vertices for the extruded triangle (6 vertices: front face + back face)
      // Back face: same X and Y, but Z moved to cladding (toward building)
      // Use the original triangle points WITHOUT any height offset - this is the gable shape
      const extrudedVertices = new Float32Array([
        // Front face: Point 1, Point 2, Point 3 (original triangle - the green triangle we made)
        point1.x, point1.y, point1.z,
        point2.x, point2.y, point2.z,
        point3.x, point3.y, point3.z,
        // Back face: Point 1, Point 2, Point 3 - same X and Y, Z moved to cladding
        point1.x, point1.y, claddingZ,
        point2.x, point2.y, claddingZ,
        point3.x, point3.y, claddingZ,
      ]);
      
      // Create indices for the extruded triangle
      // Front face, back face, and 3 side faces (one for each edge)
      const extrudedIndices = [
        // Front face (counter-clockwise when viewed from front)
        0, 1, 2,
        // Back face (clockwise when viewed from back = reverse winding: 3, 5, 4)
        3, 5, 4,
        // Side face 1: edge from point 1 to point 2
        0, 3, 1, 1, 3, 4,
        // Side face 2: edge from point 2 to point 3
        1, 4, 2, 2, 4, 5,
        // Side face 3: edge from point 3 to point 1
        2, 5, 0, 0, 5, 3,
      ];
      
      const triangleGeometry = new THREE.BufferGeometry();
      triangleGeometry.setAttribute('position', new THREE.BufferAttribute(extrudedVertices, 3));
      triangleGeometry.setIndex(extrudedIndices);
      triangleGeometry.computeVertexNormals();
      
      // Ensure normals are correct for proper lighting
      const normals = triangleGeometry.attributes.normal;
      if (normals) {
        for (let i = 0; i < normals.count; i++) {
          const x = normals.getX(i);
          const y = normals.getY(i);
          const z = normals.getZ(i);
          const length = Math.sqrt(x * x + y * y + z * z);
          if (length > 0) {
            normals.setXYZ(i, x / length, y / length, z / length);
          }
        }
        normals.needsUpdate = true;
      }
      
      // Use cladding color for the triangle
      let triangleColor = 0x888888; // Default grey
      if (claddingColour && claddingColour !== "Select") {
        const selectedColour = COLORBOND_COLOURS.find(c => c.name === claddingColour);
        if (selectedColour) {
          triangleColor = new THREE.Color(
            selectedColour.r / 255,
            selectedColour.g / 255,
            selectedColour.b / 255
          );
        }
      }
      
      const triangleMaterial = new THREE.MeshStandardMaterial({ 
        color: triangleColor,
        metalness: 0,
        roughness: 1.0,
        side: THREE.DoubleSide
      });
      porchRoofMaterialRef.current = triangleMaterial; // Store ref so it can be updated
    const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
    baseboardsRef.current.add(triangle);
    porchRoofRef.current = triangle; // Store ref for cleanup
    // Add black edge lines to superior porch roof triangle
    const triangleEdgesGeometry = new THREE.EdgesGeometry(triangleGeometry);
    const triangleEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const triangleEdges = new THREE.LineSegments(triangleEdgesGeometry, triangleEdgesMaterial);
    triangle.add(triangleEdges);
      
      // Create roof planes on top of the gable triangle
      // They sit directly on top, meet at the ridge (point2), and slope 15 degrees in Y only
      const roofPlaneThickness = 0.1; // 100mm = 0.1m
      const roofPlaneAngle = 15 * Math.PI / 180; // 15 degrees
      
      // Get roof color
      let roofPlaneColor = 0x888888; // Default grey
      if (roofColour && roofColour !== "Select") {
        const selectedColour = COLORBOND_COLOURS.find(c => c.name === roofColour);
        if (selectedColour) {
          roofPlaneColor = new THREE.Color(
            selectedColour.r / 255,
            selectedColour.g / 255,
            selectedColour.b / 255
          );
        }
      }
      
      const roofPlaneMaterial = new THREE.MeshStandardMaterial({
        color: roofPlaneColor,
        metalness: 0,
        roughness: 1.0,
        side: THREE.DoubleSide
      });
      
      // Create raised points for roof planes (50mm higher than triangle)
      const roofPlaneHeightOffset = 0.05; // 50mm = 0.05m
      const roofPlanePoint1 = new THREE.Vector3(point1.x, point1.y + roofPlaneHeightOffset, point1.z);
      const roofPlanePoint2 = new THREE.Vector3(point2.x, point2.y + roofPlaneHeightOffset, point2.z);
      const roofPlanePoint3 = new THREE.Vector3(point3.x, point3.y + roofPlaneHeightOffset, point3.z);
      
      // Left roof plane: from point1 to point2 (ridge)
      // The plane slopes down from the ridge (point2) at 15 degrees
      // It extends from the front face back to claddingZ
      // Calculate the direction from point1 to point2 (using raised roof plane points)
      const leftEdgeDir = new THREE.Vector3().subVectors(roofPlanePoint2, roofPlanePoint1).normalize();
      // Calculate perpendicular direction (pointing outward from the edge, in the plane of the triangle)
      const leftPerp = new THREE.Vector3().crossVectors(leftEdgeDir, new THREE.Vector3(0, 1, 0)).normalize();
      
      // Front edge: along point1 to point2 (at the front face Z, using raised points)
      const leftFrontP1 = roofPlanePoint1.clone();
      const leftFrontP2 = roofPlanePoint2.clone();
      
      // Back edge: same X and Y positions, but at claddingZ
      // The Y positions slope down at 15 degrees from the ridge
      // Calculate the horizontal distance from ridge to each point
      const leftDistFromRidge1 = Math.sqrt(
        Math.pow(roofPlanePoint1.x - roofPlanePoint2.x, 2) + Math.pow(roofPlanePoint1.z - roofPlanePoint2.z, 2)
      );
      const leftYDrop1 = leftDistFromRidge1 * Math.tan(roofPlaneAngle);
      
      const leftBackP1 = new THREE.Vector3(roofPlanePoint1.x, roofPlanePoint2.y - leftYDrop1, claddingZ);
      const leftBackP2 = new THREE.Vector3(roofPlanePoint2.x, roofPlanePoint2.y, claddingZ);
      
      // Create left roof plane geometry with thickness
      const leftRoofPlaneGeometry = new THREE.BufferGeometry();
      // Calculate normal for thickness offset (perpendicular to the plane)
      const leftPlaneNormal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(leftBackP1, leftFrontP1),
        new THREE.Vector3().subVectors(leftFrontP2, leftFrontP1)
      ).normalize();
      const leftThicknessOffset = leftPlaneNormal.clone().multiplyScalar(roofPlaneThickness / 2);
      
      // Top surface vertices
      const leftTop1 = leftFrontP1.clone().add(leftThicknessOffset);
      const leftTop2 = leftFrontP2.clone().add(leftThicknessOffset);
      const leftTop3 = leftBackP2.clone().add(leftThicknessOffset);
      const leftTop4 = leftBackP1.clone().add(leftThicknessOffset);
      
      // Bottom surface vertices
      const leftBottom1 = leftFrontP1.clone().sub(leftThicknessOffset);
      const leftBottom2 = leftFrontP2.clone().sub(leftThicknessOffset);
      const leftBottom3 = leftBackP2.clone().sub(leftThicknessOffset);
      const leftBottom4 = leftBackP1.clone().sub(leftThicknessOffset);
      
      const leftRoofPlaneVertices = new Float32Array([
        // Top surface
        leftTop1.x, leftTop1.y, leftTop1.z,
        leftTop2.x, leftTop2.y, leftTop2.z,
        leftTop3.x, leftTop3.y, leftTop3.z,
        leftTop4.x, leftTop4.y, leftTop4.z,
        // Bottom surface
        leftBottom1.x, leftBottom1.y, leftBottom1.z,
        leftBottom2.x, leftBottom2.y, leftBottom2.z,
        leftBottom3.x, leftBottom3.y, leftBottom3.z,
        leftBottom4.x, leftBottom4.y, leftBottom4.z,
      ]);
      
      const leftRoofPlaneIndices = [
        // Top surface
        0, 1, 2, 0, 2, 3,
        // Bottom surface
        4, 6, 5, 4, 7, 6,
        // Side faces
        0, 4, 1, 1, 4, 5,
        1, 5, 2, 2, 5, 6,
        2, 6, 3, 3, 6, 7,
        3, 7, 0, 0, 7, 4,
      ];
      
      leftRoofPlaneGeometry.setAttribute('position', new THREE.BufferAttribute(leftRoofPlaneVertices, 3));
      leftRoofPlaneGeometry.setIndex(leftRoofPlaneIndices);
      leftRoofPlaneGeometry.computeVertexNormals();
      
    const leftRoofPlaneMesh = new THREE.Mesh(leftRoofPlaneGeometry, roofPlaneMaterial);
    baseboardsRef.current.add(leftRoofPlaneMesh);
    superiorPorchRoofPlanesRef.current.push(leftRoofPlaneMesh);
    // Add black edge lines to left porch roof plane
    const leftRoofPlaneEdgesGeometry = new THREE.EdgesGeometry(leftRoofPlaneGeometry);
    const leftRoofPlaneEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const leftRoofPlaneEdges = new THREE.LineSegments(leftRoofPlaneEdgesGeometry, leftRoofPlaneEdgesMaterial);
    leftRoofPlaneMesh.add(leftRoofPlaneEdges);
      
      // Right roof plane: from point2 (ridge) to point3
      // The plane slopes down from the ridge (point2) at 15 degrees
      // Calculate the horizontal distance from ridge to point3
      const rightDistFromRidge3 = Math.sqrt(
        Math.pow(roofPlanePoint3.x - roofPlanePoint2.x, 2) + Math.pow(roofPlanePoint3.z - roofPlanePoint2.z, 2)
      );
      const rightYDrop3 = rightDistFromRidge3 * Math.tan(roofPlaneAngle);
      
      // Front edge: along point2 to point3 (at the front face Z)
      const rightFrontP1 = roofPlanePoint2.clone();
      const rightFrontP2 = roofPlanePoint3.clone();
      
      // Back edge: same X and Y positions, but at claddingZ
      const rightBackP1 = new THREE.Vector3(roofPlanePoint2.x, roofPlanePoint2.y, claddingZ);
      const rightBackP2 = new THREE.Vector3(roofPlanePoint3.x, roofPlanePoint2.y - rightYDrop3, claddingZ);
      
      // Create right roof plane geometry with thickness
      const rightRoofPlaneGeometry = new THREE.BufferGeometry();
      // Calculate normal for thickness offset
      const rightPlaneNormal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(rightBackP1, rightFrontP1),
        new THREE.Vector3().subVectors(rightFrontP2, rightFrontP1)
      ).normalize();
      const rightThicknessOffset = rightPlaneNormal.clone().multiplyScalar(roofPlaneThickness / 2);
      
      // Top surface vertices
      const rightTop1 = rightFrontP1.clone().add(rightThicknessOffset);
      const rightTop2 = rightFrontP2.clone().add(rightThicknessOffset);
      const rightTop3 = rightBackP2.clone().add(rightThicknessOffset);
      const rightTop4 = rightBackP1.clone().add(rightThicknessOffset);
      
      // Bottom surface vertices
      const rightBottom1 = rightFrontP1.clone().sub(rightThicknessOffset);
      const rightBottom2 = rightFrontP2.clone().sub(rightThicknessOffset);
      const rightBottom3 = rightBackP2.clone().sub(rightThicknessOffset);
      const rightBottom4 = rightBackP1.clone().sub(rightThicknessOffset);
      
      const rightRoofPlaneVertices = new Float32Array([
        // Top surface
        rightTop1.x, rightTop1.y, rightTop1.z,
        rightTop2.x, rightTop2.y, rightTop2.z,
        rightTop3.x, rightTop3.y, rightTop3.z,
        rightTop4.x, rightTop4.y, rightTop4.z,
        // Bottom surface
        rightBottom1.x, rightBottom1.y, rightBottom1.z,
        rightBottom2.x, rightBottom2.y, rightBottom2.z,
        rightBottom3.x, rightBottom3.y, rightBottom3.z,
        rightBottom4.x, rightBottom4.y, rightBottom4.z,
      ]);
      
      const rightRoofPlaneIndices = [
        // Top surface
        0, 1, 2, 0, 2, 3,
        // Bottom surface
        4, 6, 5, 4, 7, 6,
        // Side faces
        0, 4, 1, 1, 4, 5,
        1, 5, 2, 2, 5, 6,
        2, 6, 3, 3, 6, 7,
        3, 7, 0, 0, 7, 4,
      ];
      
      rightRoofPlaneGeometry.setAttribute('position', new THREE.BufferAttribute(rightRoofPlaneVertices, 3));
      rightRoofPlaneGeometry.setIndex(rightRoofPlaneIndices);
      rightRoofPlaneGeometry.computeVertexNormals();
      
    const rightRoofPlaneMesh = new THREE.Mesh(rightRoofPlaneGeometry, roofPlaneMaterial);
    baseboardsRef.current.add(rightRoofPlaneMesh);
    superiorPorchRoofPlanesRef.current.push(rightRoofPlaneMesh);
    // Add black edge lines to right porch roof plane
    const rightRoofPlaneEdgesGeometry = new THREE.EdgesGeometry(rightRoofPlaneGeometry);
    const rightRoofPlaneEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const rightRoofPlaneEdges = new THREE.LineSegments(rightRoofPlaneEdgesGeometry, rightRoofPlaneEdgesMaterial);
    rightRoofPlaneMesh.add(rightRoofPlaneEdges);
      
      // Update the actual post meshes to be taller for Superior
      porchPostRefs.current.forEach((post) => {
        if (post && post.geometry) {
          // Check if this is one of the tall posts (at post1Z or post2Z)
          const isTallPost = Math.abs(post.position.z - post1Z) < 0.01 || Math.abs(post.position.z - post2Z) < 0.01;
          if (isTallPost) {
            // Dispose old geometry
            post.geometry.dispose();
            // Create new taller geometry
            post.geometry = new THREE.BoxGeometry(postSize, superiorPostHeight, postSize);
            // Update position to account for new height
            post.position.y = superiorPostHeight / 2 - baseboardsHeight / 2;
            // Update edge lines for the new geometry
            // Remove old edge lines if they exist
            const oldEdges = post.children.find(child => child instanceof THREE.LineSegments);
            if (oldEdges) {
              post.remove(oldEdges);
              if (oldEdges.geometry) oldEdges.geometry.dispose();
              if (oldEdges.material) oldEdges.material.dispose();
            }
            // Add new edge lines with updated geometry
            const postEdgesGeometry = new THREE.EdgesGeometry(post.geometry);
            const postEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
            const postEdges = new THREE.LineSegments(postEdgesGeometry, postEdgesMaterial);
            post.add(postEdges);
          }
        }
      });
      
    } else if (roofStyle !== "Superior") {
      // Add regular porch roof for Affordable and Skillion (or when roofStyle is not set)
      // Use the original porch roof that was created in initial setup
      if (originalPorchRoofRef.current) {
        if (!baseboardsRef.current.children.includes(originalPorchRoofRef.current)) {
          baseboardsRef.current.add(originalPorchRoofRef.current);
        }
        porchRoofRef.current = originalPorchRoofRef.current; // Update current ref
      }
      
      // Reset posts to original height for Affordable/Skillion
      const basePostHeight = 2.7 + 0.11; // 2810mm = 2.81m
      const postSize = 0.1; // 100mm = 0.1m
      const porchWidth = 2.09;
      const porchDepth = 1.545;
      const porchOffsetFromLeft = 3.4;
      const porchCenterX = -baseboardsLength / 2 + porchOffsetFromLeft + porchWidth / 2;
      const porchCenterZ = baseboardsWidth / 2 + porchDepth / 2;
      const postInset = 0.145;
      const post1Z = porchCenterZ + porchDepth / 2 - postInset;
      const post2Z = porchCenterZ + porchDepth / 2 - postInset;
      
      porchPostRefs.current.forEach((post) => {
        if (post && post.geometry) {
          // Check if this is one of the tall posts (at post1Z or post2Z)
          const isTallPost = Math.abs(post.position.z - post1Z) < 0.01 || Math.abs(post.position.z - post2Z) < 0.01;
          if (isTallPost) {
            // Dispose old geometry
            post.geometry.dispose();
            // Create new geometry with original height
            post.geometry = new THREE.BoxGeometry(postSize, basePostHeight, postSize);
            // Update position to account for original height
            post.position.y = basePostHeight / 2 - baseboardsHeight / 2;
            // Update edge lines for the new geometry
            // Remove old edge lines if they exist
            const oldEdges = post.children.find(child => child instanceof THREE.LineSegments);
            if (oldEdges) {
              post.remove(oldEdges);
              if (oldEdges.geometry) oldEdges.geometry.dispose();
              if (oldEdges.material) oldEdges.material.dispose();
            }
            // Add new edge lines with updated geometry
            const postEdgesGeometry = new THREE.EdgesGeometry(post.geometry);
            const postEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
            const postEdges = new THREE.LineSegments(postEdgesGeometry, postEdgesMaterial);
            post.add(postEdges);
          }
        }
      });
    }

    // Constants already defined above for porch roof
    const eaveOverhang = 0.3;
    const bargeOverhang = 0.3;
    const roofThickness = 0.2; // 200mm thick
    const point2Y = baseboardsHeight + 2.6;
    const point2Z = -baseboardsWidth / 2;
    const point4Y = baseboardsHeight + 2.6;
    const point4Z = baseboardsWidth / 2;
    
    // Create roof material with current roof color if set
    let initialColor = 0x888888; // Default grey
    if (roofColour && roofColour !== "Select") {
      const selectedColour = COLORBOND_COLOURS.find(c => c.name === roofColour);
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        initialColor = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
      }
    }
    
    const roofMaterial = new THREE.MeshStandardMaterial({ 
      color: initialColor,
      metalness: 0,
      roughness: 1.0,
      side: THREE.DoubleSide
    });
    roofMaterialRef.current = roofMaterial;

    // Helper function to add corrugated lines to a roof plane using top surface vertices directly
    // topP1, topP2, topP3, topP4 are the 4 corners of the roof plane TOP SURFACE (in order: bottom-left, top-left, top-right, bottom-right)
    // Lines run perpendicular to the edge from topP2 to topP3 (ridge/eave), from edge topP2-topP3 to edge topP1-topP4
    const addCorrugatedLinesFromTopSurface = (roofMesh, topP1, topP2, topP3, topP4, spacing) => {
      if (!roofMesh) return;
      
      // Calculate the length along the perpendicular direction (from one edge to the opposite)
      const perpLength = new THREE.Vector3().subVectors(topP1, topP2).length();
      if (perpLength <= 0 || spacing <= 0) return;
      
      // Calculate number of lines needed based on spacing
      const numLines = Math.max(1, Math.floor(perpLength / spacing));
      
      // Create line geometry
      const linePoints = [];
      
      // Create lines at regular spacing intervals
      for (let i = 0; i <= numLines; i++) {
        const t = i / numLines;
        const startPoint = new THREE.Vector3().lerpVectors(topP2, topP3, t);
        const endPoint = new THREE.Vector3().lerpVectors(topP1, topP4, t);
        linePoints.push(startPoint.x, startPoint.y, startPoint.z);
        linePoints.push(endPoint.x, endPoint.y, endPoint.z);
      }
      
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
      roofMesh.add(lines);
    };

    // Add the appropriate shape and create roof planes based on roofStyle
    if (roofStyle === "Superior") {
      if (!baseboardsRef.current.children.includes(superiorShapeRef.current)) {
        baseboardsRef.current.add(superiorShapeRef.current);
      }
      
      // Superior: 2 roof planes at 15 degrees
      // Ridge line runs along the full length of the building at point 3's Y and Z
      const angle15Deg = 15 * Math.PI / 180;
      const rise15 = (baseboardsWidth / 2) * Math.tan(angle15Deg);
      const point3Y_Superior = baseboardsHeight + 2.6 + rise15;
      const point3Z_Superior = 0;
      const gableEndX = -baseboardsLength / 2; // Where the cladding shape is
      const farEndX = baseboardsLength / 2; // Other end of the building
      
      // Left roof plane: runs along the X-axis from gable end to far end
      // Ridge line is straight and parallel to X-axis at point 3's Y and Z
      // Eave edge is straight and parallel to X-axis at point 2's Y and Z
      // Roof is 200mm thick, so we need top and bottom surfaces
      const leftRoofGeometry = new THREE.BufferGeometry();
      
      // Define the 4 corner vertices of the roof plane
      // Bottom edge (eave): runs along X-axis, overhangs 300mm in Z direction
      // Top edge (ridge): runs along X-axis, overhangs 300mm at both ends in X direction (barge)
      const leftP1 = new THREE.Vector3(gableEndX - bargeOverhang, point2Y - baseboardsHeight / 2, point2Z - eaveOverhang); // Gable end, bottom
      const leftP2 = new THREE.Vector3(gableEndX - bargeOverhang, point3Y_Superior - baseboardsHeight / 2, point3Z_Superior); // Gable end, top (ridge)
      const leftP3 = new THREE.Vector3(farEndX + bargeOverhang, point3Y_Superior - baseboardsHeight / 2, point3Z_Superior); // Far end, top (ridge)
      const leftP4 = new THREE.Vector3(farEndX + bargeOverhang, point2Y - baseboardsHeight / 2, point2Z - eaveOverhang); // Far end, bottom
      
      // Calculate normal vector from three points on the plane
      const leftV1 = new THREE.Vector3().subVectors(leftP2, leftP1);
      const leftV2 = new THREE.Vector3().subVectors(leftP4, leftP1);
      const leftRoofNormal = new THREE.Vector3().crossVectors(leftV1, leftV2).normalize();
      
      const leftThicknessOffset = leftRoofNormal.clone().multiplyScalar(roofThickness / 2);
      
      // Bottom surface vertices (offset inward by half thickness)
      const leftBottom1 = leftP1.clone().sub(leftThicknessOffset);
      const leftBottom2 = leftP2.clone().sub(leftThicknessOffset);
      const leftBottom3 = leftP3.clone().sub(leftThicknessOffset);
      const leftBottom4 = leftP4.clone().sub(leftThicknessOffset);
      
      // Top surface vertices (offset outward by half thickness)
      const leftTop1 = leftP1.clone().add(leftThicknessOffset);
      const leftTop2 = leftP2.clone().add(leftThicknessOffset);
      const leftTop3 = leftP3.clone().add(leftThicknessOffset);
      const leftTop4 = leftP4.clone().add(leftThicknessOffset);
      
      const leftRoofVertices = new Float32Array([
        // Bottom surface
        leftBottom1.x, leftBottom1.y, leftBottom1.z,
        leftBottom2.x, leftBottom2.y, leftBottom2.z,
        leftBottom3.x, leftBottom3.y, leftBottom3.z,
        leftBottom4.x, leftBottom4.y, leftBottom4.z,
        // Top surface
        leftTop1.x, leftTop1.y, leftTop1.z,
        leftTop2.x, leftTop2.y, leftTop2.z,
        leftTop3.x, leftTop3.y, leftTop3.z,
        leftTop4.x, leftTop4.y, leftTop4.z,
      ]);
      
      leftRoofGeometry.setAttribute('position', new THREE.BufferAttribute(leftRoofVertices, 3));
      // Indices for a box: bottom face, top face, and 4 side faces
      const leftIndices = [
        // Bottom face
        0, 1, 2, 0, 2, 3,
        // Top face
        4, 6, 5, 4, 7, 6,
        // Side faces
        0, 4, 1, 1, 4, 5,
        1, 5, 2, 2, 5, 6,
        2, 6, 3, 3, 6, 7,
        3, 7, 0, 0, 7, 4,
      ];
      leftRoofGeometry.setIndex(leftIndices);
      leftRoofGeometry.computeVertexNormals();
    const leftRoofMesh = new THREE.Mesh(leftRoofGeometry, roofMaterial);
    baseboardsRef.current.add(leftRoofMesh);
    superiorRoofRef.current.push(leftRoofMesh);
    // Add black edge lines to superior left roof plane
    const superiorLeftRoofEdgesGeometry = new THREE.EdgesGeometry(leftRoofGeometry);
    const superiorLeftRoofEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const superiorLeftRoofEdges = new THREE.LineSegments(superiorLeftRoofEdgesGeometry, superiorLeftRoofEdgesMaterial);
    leftRoofMesh.add(superiorLeftRoofEdges);
      
      // Right roof plane: runs along the X-axis from gable end to far end
      const rightRoofGeometry = new THREE.BufferGeometry();
      
      // Define the 4 corner vertices of the roof plane
      // Bottom edge (eave): runs along X-axis, overhangs 300mm in Z direction
      // Top edge (ridge): runs along X-axis, overhangs 300mm at both ends in X direction (barge)
      const rightP1 = new THREE.Vector3(gableEndX - bargeOverhang, point4Y - baseboardsHeight / 2, point4Z + eaveOverhang); // Gable end, bottom
      const rightP2 = new THREE.Vector3(gableEndX - bargeOverhang, point3Y_Superior - baseboardsHeight / 2, point3Z_Superior); // Gable end, top (ridge)
      const rightP3 = new THREE.Vector3(farEndX + bargeOverhang, point3Y_Superior - baseboardsHeight / 2, point3Z_Superior); // Far end, top (ridge)
      const rightP4 = new THREE.Vector3(farEndX + bargeOverhang, point4Y - baseboardsHeight / 2, point4Z + eaveOverhang); // Far end, bottom
      
      // Calculate normal vector from three points on the plane
      const rightV1 = new THREE.Vector3().subVectors(rightP2, rightP1);
      const rightV2 = new THREE.Vector3().subVectors(rightP4, rightP1);
      const rightRoofNormal = new THREE.Vector3().crossVectors(rightV1, rightV2).normalize();
      
      const rightThicknessOffset = rightRoofNormal.clone().multiplyScalar(roofThickness / 2);
      
      // Bottom surface vertices (offset inward by half thickness)
      const rightBottom1 = rightP1.clone().sub(rightThicknessOffset);
      const rightBottom2 = rightP2.clone().sub(rightThicknessOffset);
      const rightBottom3 = rightP3.clone().sub(rightThicknessOffset);
      const rightBottom4 = rightP4.clone().sub(rightThicknessOffset);
      
      // Top surface vertices (offset outward by half thickness)
      const rightTop1 = rightP1.clone().add(rightThicknessOffset);
      const rightTop2 = rightP2.clone().add(rightThicknessOffset);
      const rightTop3 = rightP3.clone().add(rightThicknessOffset);
      const rightTop4 = rightP4.clone().add(rightThicknessOffset);
      
      const rightRoofVertices = new Float32Array([
        // Bottom surface
        rightBottom1.x, rightBottom1.y, rightBottom1.z,
        rightBottom2.x, rightBottom2.y, rightBottom2.z,
        rightBottom3.x, rightBottom3.y, rightBottom3.z,
        rightBottom4.x, rightBottom4.y, rightBottom4.z,
        // Top surface
        rightTop1.x, rightTop1.y, rightTop1.z,
        rightTop2.x, rightTop2.y, rightTop2.z,
        rightTop3.x, rightTop3.y, rightTop3.z,
        rightTop4.x, rightTop4.y, rightTop4.z,
      ]);
      
      rightRoofGeometry.setAttribute('position', new THREE.BufferAttribute(rightRoofVertices, 3));
      // Indices for a box
      const rightIndices = [
        // Bottom face
        0, 1, 2, 0, 2, 3,
        // Top face
        4, 6, 5, 4, 7, 6,
        // Side faces
        0, 4, 1, 1, 4, 5,
        1, 5, 2, 2, 5, 6,
        2, 6, 3, 3, 6, 7,
        3, 7, 0, 0, 7, 4,
      ];
      rightRoofGeometry.setIndex(rightIndices);
      rightRoofGeometry.computeVertexNormals();
    const rightRoofMesh = new THREE.Mesh(rightRoofGeometry, roofMaterial);
    baseboardsRef.current.add(rightRoofMesh);
    superiorRoofRef.current.push(rightRoofMesh);
    // Add black edge lines to superior right roof plane
    const superiorRightRoofEdgesGeometry = new THREE.EdgesGeometry(rightRoofGeometry);
    const superiorRightRoofEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const superiorRightRoofEdges = new THREE.LineSegments(superiorRightRoofEdgesGeometry, superiorRightRoofEdgesMaterial);
    rightRoofMesh.add(superiorRightRoofEdges);
    
    // Add corrugated lines to superior left roof (37.5mm spacing - half of 75mm)
    // Use top surface vertices directly to ensure correct height
    addCorrugatedLinesFromTopSurface(leftRoofMesh, leftTop1, leftTop2, leftTop3, leftTop4, 0.0375);
    // Add corrugated lines to superior right roof (37.5mm spacing - half of 75mm)
    addCorrugatedLinesFromTopSurface(rightRoofMesh, rightTop1, rightTop2, rightTop3, rightTop4, 0.0375);
      
    } else if (roofStyle === "Affordable") {
      if (!baseboardsRef.current.children.includes(affordableShapeRef.current)) {
        baseboardsRef.current.add(affordableShapeRef.current);
      }
      
      // Affordable: 2 roof planes at 3 degrees
      // Ridge line runs along the full length of the building at point 3's Y and Z
      const angle3Deg = 3 * Math.PI / 180;
      const rise3 = (baseboardsWidth / 2) * Math.tan(angle3Deg);
      const point3Y_Affordable = baseboardsHeight + 2.6 + rise3;
      const point3Z_Affordable = 0;
      const gableEndX = -baseboardsLength / 2; // Where the cladding shape is
      const farEndX = baseboardsLength / 2; // Other end of the building
      
      // Left roof plane: runs along the X-axis from gable end to far end
      // Ridge line is straight and parallel to X-axis at point 3's Y and Z
      // Eave edge is straight and parallel to X-axis at point 2's Y and Z
      // Roof is 200mm thick, so we need top and bottom surfaces
      const leftRoofGeometry = new THREE.BufferGeometry();
      
      // Define the 4 corner vertices of the roof plane
      // Bottom edge (eave): runs along X-axis, overhangs 300mm in Z direction
      // Top edge (ridge): runs along X-axis, overhangs 300mm at both ends in X direction (barge)
      const leftP1 = new THREE.Vector3(gableEndX - bargeOverhang, point2Y - baseboardsHeight / 2, point2Z - eaveOverhang); // Gable end, bottom
      const leftP2 = new THREE.Vector3(gableEndX - bargeOverhang, point3Y_Affordable - baseboardsHeight / 2, point3Z_Affordable); // Gable end, top (ridge)
      const leftP3 = new THREE.Vector3(farEndX + bargeOverhang, point3Y_Affordable - baseboardsHeight / 2, point3Z_Affordable); // Far end, top (ridge)
      const leftP4 = new THREE.Vector3(farEndX + bargeOverhang, point2Y - baseboardsHeight / 2, point2Z - eaveOverhang); // Far end, bottom
      
      // Calculate normal vector from three points on the plane
      const leftV1 = new THREE.Vector3().subVectors(leftP2, leftP1);
      const leftV2 = new THREE.Vector3().subVectors(leftP4, leftP1);
      const leftRoofNormal = new THREE.Vector3().crossVectors(leftV1, leftV2).normalize();
      
      const leftThicknessOffset = leftRoofNormal.clone().multiplyScalar(roofThickness / 2);
      
      // Bottom surface vertices (offset inward by half thickness)
      const leftBottom1 = leftP1.clone().sub(leftThicknessOffset);
      const leftBottom2 = leftP2.clone().sub(leftThicknessOffset);
      const leftBottom3 = leftP3.clone().sub(leftThicknessOffset);
      const leftBottom4 = leftP4.clone().sub(leftThicknessOffset);
      
      // Top surface vertices (offset outward by half thickness)
      const leftTop1 = leftP1.clone().add(leftThicknessOffset);
      const leftTop2 = leftP2.clone().add(leftThicknessOffset);
      const leftTop3 = leftP3.clone().add(leftThicknessOffset);
      const leftTop4 = leftP4.clone().add(leftThicknessOffset);
      
      const leftRoofVertices = new Float32Array([
        // Bottom surface
        leftBottom1.x, leftBottom1.y, leftBottom1.z,
        leftBottom2.x, leftBottom2.y, leftBottom2.z,
        leftBottom3.x, leftBottom3.y, leftBottom3.z,
        leftBottom4.x, leftBottom4.y, leftBottom4.z,
        // Top surface
        leftTop1.x, leftTop1.y, leftTop1.z,
        leftTop2.x, leftTop2.y, leftTop2.z,
        leftTop3.x, leftTop3.y, leftTop3.z,
        leftTop4.x, leftTop4.y, leftTop4.z,
      ]);
      
      leftRoofGeometry.setAttribute('position', new THREE.BufferAttribute(leftRoofVertices, 3));
      // Indices for a box: bottom face, top face, and 4 side faces
      const leftIndices = [
        // Bottom face
        0, 1, 2, 0, 2, 3,
        // Top face
        4, 6, 5, 4, 7, 6,
        // Side faces
        0, 4, 1, 1, 4, 5,
        1, 5, 2, 2, 5, 6,
        2, 6, 3, 3, 6, 7,
        3, 7, 0, 0, 7, 4,
      ];
      leftRoofGeometry.setIndex(leftIndices);
      leftRoofGeometry.computeVertexNormals();
    const leftRoofMesh = new THREE.Mesh(leftRoofGeometry, roofMaterial);
    baseboardsRef.current.add(leftRoofMesh);
    affordableRoofRef.current.push(leftRoofMesh);
    // Add black edge lines to affordable left roof plane
    const affordableLeftRoofEdgesGeometry = new THREE.EdgesGeometry(leftRoofGeometry);
    const affordableLeftRoofEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const affordableLeftRoofEdges = new THREE.LineSegments(affordableLeftRoofEdgesGeometry, affordableLeftRoofEdgesMaterial);
    leftRoofMesh.add(affordableLeftRoofEdges);
      
      // Right roof plane: runs along the X-axis from gable end to far end
      const rightRoofGeometry = new THREE.BufferGeometry();
      
      // Define the 4 corner vertices of the roof plane
      // Bottom edge (eave): runs along X-axis, overhangs 300mm in Z direction
      // Top edge (ridge): runs along X-axis, overhangs 300mm at both ends in X direction (barge)
      const rightP1 = new THREE.Vector3(gableEndX - bargeOverhang, point4Y - baseboardsHeight / 2, point4Z + eaveOverhang); // Gable end, bottom
      const rightP2 = new THREE.Vector3(gableEndX - bargeOverhang, point3Y_Affordable - baseboardsHeight / 2, point3Z_Affordable); // Gable end, top (ridge)
      const rightP3 = new THREE.Vector3(farEndX + bargeOverhang, point3Y_Affordable - baseboardsHeight / 2, point3Z_Affordable); // Far end, top (ridge)
      const rightP4 = new THREE.Vector3(farEndX + bargeOverhang, point4Y - baseboardsHeight / 2, point4Z + eaveOverhang); // Far end, bottom
      
      // Calculate normal vector from three points on the plane
      const rightV1 = new THREE.Vector3().subVectors(rightP2, rightP1);
      const rightV2 = new THREE.Vector3().subVectors(rightP4, rightP1);
      const rightRoofNormal = new THREE.Vector3().crossVectors(rightV1, rightV2).normalize();
      
      const rightThicknessOffset = rightRoofNormal.clone().multiplyScalar(roofThickness / 2);
      
      // Bottom surface vertices (offset inward by half thickness)
      const rightBottom1 = rightP1.clone().sub(rightThicknessOffset);
      const rightBottom2 = rightP2.clone().sub(rightThicknessOffset);
      const rightBottom3 = rightP3.clone().sub(rightThicknessOffset);
      const rightBottom4 = rightP4.clone().sub(rightThicknessOffset);
      
      // Top surface vertices (offset outward by half thickness)
      const rightTop1 = rightP1.clone().add(rightThicknessOffset);
      const rightTop2 = rightP2.clone().add(rightThicknessOffset);
      const rightTop3 = rightP3.clone().add(rightThicknessOffset);
      const rightTop4 = rightP4.clone().add(rightThicknessOffset);
      
      const rightRoofVertices = new Float32Array([
        // Bottom surface
        rightBottom1.x, rightBottom1.y, rightBottom1.z,
        rightBottom2.x, rightBottom2.y, rightBottom2.z,
        rightBottom3.x, rightBottom3.y, rightBottom3.z,
        rightBottom4.x, rightBottom4.y, rightBottom4.z,
        // Top surface
        rightTop1.x, rightTop1.y, rightTop1.z,
        rightTop2.x, rightTop2.y, rightTop2.z,
        rightTop3.x, rightTop3.y, rightTop3.z,
        rightTop4.x, rightTop4.y, rightTop4.z,
      ]);
      
      rightRoofGeometry.setAttribute('position', new THREE.BufferAttribute(rightRoofVertices, 3));
      // Indices for a box
      const rightIndices = [
        // Bottom face
        0, 1, 2, 0, 2, 3,
        // Top face
        4, 6, 5, 4, 7, 6,
        // Side faces
        0, 4, 1, 1, 4, 5,
        1, 5, 2, 2, 5, 6,
        2, 6, 3, 3, 6, 7,
        3, 7, 0, 0, 7, 4,
      ];
      rightRoofGeometry.setIndex(rightIndices);
      rightRoofGeometry.computeVertexNormals();
    const rightRoofMesh = new THREE.Mesh(rightRoofGeometry, roofMaterial);
    baseboardsRef.current.add(rightRoofMesh);
    affordableRoofRef.current.push(rightRoofMesh);
    // Add black edge lines to affordable right roof plane
    const affordableRightRoofEdgesGeometry = new THREE.EdgesGeometry(rightRoofGeometry);
    const affordableRightRoofEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const affordableRightRoofEdges = new THREE.LineSegments(affordableRightRoofEdgesGeometry, affordableRightRoofEdgesMaterial);
    rightRoofMesh.add(affordableRightRoofEdges);
    
    // Add corrugated lines to affordable left roof (75mm spacing - half of 150mm)
    // Use top surface vertices directly to ensure correct height
    addCorrugatedLinesFromTopSurface(leftRoofMesh, leftTop1, leftTop2, leftTop3, leftTop4, 0.075);
    // Add corrugated lines to affordable right roof (75mm spacing - half of 150mm)
    addCorrugatedLinesFromTopSurface(rightRoofMesh, rightTop1, rightTop2, rightTop3, rightTop4, 0.075);
      
    } else if (roofStyle === "Skillion") {
      if (!baseboardsRef.current.children.includes(skillionShapeRef.current)) {
        baseboardsRef.current.add(skillionShapeRef.current);
      }
      
      // Skillion: 1 roof plane at 5 degrees
      // Single plane runs along the X-axis from gable end to far end
      const angle5Deg = 5 * Math.PI / 180;
      const rise5_Skillion = baseboardsWidth * Math.tan(angle5Deg);
      const point3Y_Skillion = baseboardsHeight + 2.6 + rise5_Skillion;
      const point3Z_Skillion = -baseboardsWidth / 2; // Left side (rotated 180)
      const gableEndX = -baseboardsLength / 2; // Where the cladding shape is
      const farEndX = baseboardsLength / 2; // Other end of the building
      const skillionRoofThickness = 0.4; // 400mm thick
      
      // Single roof plane: runs along the X-axis from gable end to far end
      // Uniform 5-degree pitch: slopes from left (low) to right (high) - high side at porch side
      // Left side (Z = -baseboardsWidth/2): at point2Y height (low)
      // Right side (Z = baseboardsWidth/2, porch side): at point2Y + rise5_Skillion height (high)
      // This uniform slope applies at both gable end and far end
      const skillionRoofGeometry = new THREE.BufferGeometry();
      
      // Left side height (low)
      const leftSideY = point2Y;
      // Right side height (high, uniform rise) - this is the porch side
      const rightSideY = point2Y + rise5_Skillion;
      
      // Define the 4 corner vertices of the roof plane with uniform 5-degree pitch
      // Bottom-left: left side at gable end (with eave overhang)
      // Bottom-right: right side (porch side) at gable end (with eave overhang)
      // Top-right: right side (porch side) at far end (with eave overhang)
      // Top-left: left side at far end (with barge overhang)
      const skillionP1 = new THREE.Vector3(gableEndX - bargeOverhang, leftSideY - baseboardsHeight / 2, point2Z - eaveOverhang); // Gable end, bottom-left (low)
      const skillionP2 = new THREE.Vector3(gableEndX - bargeOverhang, rightSideY - baseboardsHeight / 2, point4Z + eaveOverhang); // Gable end, bottom-right (high, porch side)
      const skillionP3 = new THREE.Vector3(farEndX + bargeOverhang, rightSideY - baseboardsHeight / 2, point4Z + eaveOverhang); // Far end, top-right (high, porch side)
      const skillionP4 = new THREE.Vector3(farEndX + bargeOverhang, leftSideY - baseboardsHeight / 2, point2Z - eaveOverhang); // Far end, top-left (low)
      
      // Calculate normal vector from three points on the plane
      // P1->P2: bottom edge (left to right, same height)
      // P1->P4: left edge (bottom to top, rising)
      const skillionV1 = new THREE.Vector3().subVectors(skillionP2, skillionP1);
      const skillionV2 = new THREE.Vector3().subVectors(skillionP4, skillionP1);
      const skillionRoofNormal = new THREE.Vector3().crossVectors(skillionV1, skillionV2).normalize();
      
      const skillionThicknessOffset = skillionRoofNormal.multiplyScalar(skillionRoofThickness / 2);
      
      // Bottom surface vertices (offset inward by half thickness)
      const skillionBottom1 = skillionP1.clone().sub(skillionThicknessOffset);
      const skillionBottom2 = skillionP2.clone().sub(skillionThicknessOffset);
      const skillionBottom3 = skillionP3.clone().sub(skillionThicknessOffset);
      const skillionBottom4 = skillionP4.clone().sub(skillionThicknessOffset);
      
      // Top surface vertices (offset outward by half thickness)
      const skillionTop1 = skillionP1.clone().add(skillionThicknessOffset);
      const skillionTop2 = skillionP2.clone().add(skillionThicknessOffset);
      const skillionTop3 = skillionP3.clone().add(skillionThicknessOffset);
      const skillionTop4 = skillionP4.clone().add(skillionThicknessOffset);
      
      const skillionRoofVertices = new Float32Array([
        // Bottom surface
        skillionBottom1.x, skillionBottom1.y, skillionBottom1.z,
        skillionBottom2.x, skillionBottom2.y, skillionBottom2.z,
        skillionBottom3.x, skillionBottom3.y, skillionBottom3.z,
        skillionBottom4.x, skillionBottom4.y, skillionBottom4.z,
        // Top surface
        skillionTop1.x, skillionTop1.y, skillionTop1.z,
        skillionTop2.x, skillionTop2.y, skillionTop2.z,
        skillionTop3.x, skillionTop3.y, skillionTop3.z,
        skillionTop4.x, skillionTop4.y, skillionTop4.z,
      ]);
      
      skillionRoofGeometry.setAttribute('position', new THREE.BufferAttribute(skillionRoofVertices, 3));
      // Indices for a box: bottom face, top face, and 4 side faces
      // Ensure consistent winding order for uniform lighting
      const skillionIndices = [
        // Bottom face (counter-clockwise when viewed from below)
        0, 2, 1, 0, 3, 2,
        // Top face (counter-clockwise when viewed from above)
        4, 5, 6, 4, 6, 7,
        // Side faces
        0, 1, 4, 1, 5, 4,
        1, 2, 5, 2, 6, 5,
        2, 3, 6, 3, 7, 6,
        3, 0, 7, 0, 4, 7,
      ];
      skillionRoofGeometry.setIndex(skillionIndices);
      skillionRoofGeometry.computeVertexNormals();
      // Ensure normals are normalized for consistent lighting
      const normals = skillionRoofGeometry.attributes.normal;
      if (normals) {
        for (let i = 0; i < normals.count; i++) {
          const x = normals.getX(i);
          const y = normals.getY(i);
          const z = normals.getZ(i);
          const length = Math.sqrt(x * x + y * y + z * z);
          if (length > 0) {
            normals.setXYZ(i, x / length, y / length, z / length);
          }
        }
        normals.needsUpdate = true;
      }
    const skillionRoofMesh = new THREE.Mesh(skillionRoofGeometry, roofMaterial);
    baseboardsRef.current.add(skillionRoofMesh);
    skillionRoofRef.current = skillionRoofMesh;
    // Add black edge lines to skillion roof
    const skillionRoofEdgesGeometry = new THREE.EdgesGeometry(skillionRoofGeometry);
    const skillionRoofEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const skillionRoofEdges = new THREE.LineSegments(skillionRoofEdgesGeometry, skillionRoofEdgesMaterial);
    skillionRoofMesh.add(skillionRoofEdges);
    
    // Add corrugated lines to skillion roof (75mm spacing)
    // For skillion, lines run from left to right (perpendicular to the slope)
    // Use top surface vertices directly to ensure correct height
    addCorrugatedLinesFromTopSurface(skillionRoofMesh, skillionTop1, skillionTop2, skillionTop3, skillionTop4, 0.075);
    }

    // Create weatherboard lines based on current roofStyle
    const weatherboardStartY = baseboardsHeight + 0.2; // 200mm = 0.2m above baseboards
    const weatherboardSpacing = 0.2; // 200mm = 0.2m
    
    // Determine top of cladding and point 3 height based on roof style
    let claddingTopY = baseboardsHeight;
    let point3Y;
    if (roofStyle === "Superior") {
      const angle15Deg = 15 * Math.PI / 180;
      const rise15 = (baseboardsWidth / 2) * Math.tan(angle15Deg);
      claddingTopY = baseboardsHeight + 2.6 + rise15;
      point3Y = claddingTopY;
    } else if (roofStyle === "Affordable") {
      const angle3Deg = 3 * Math.PI / 180;
      const rise3 = (baseboardsWidth / 2) * Math.tan(angle3Deg);
      claddingTopY = baseboardsHeight + 2.6 + rise3;
      point3Y = claddingTopY;
    } else if (roofStyle === "Skillion") {
      const angle5Deg = 5 * Math.PI / 180;
      const rise5_Skillion = baseboardsWidth * Math.tan(angle5Deg);
      claddingTopY = baseboardsHeight + 2.6 + rise5_Skillion;
      point3Y = claddingTopY;
    }
    
    // Only create lines if we have a valid roof style
    if (roofStyle && roofStyle !== "Select" && point3Y) {
      // Create horizontal lines that wrap around the cladding shape
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000, // Black
        linewidth: 2
      });
      
      weatherboardLinesRef.current = [];
      // Loop all the way to the peak (point 3)
      for (let y = weatherboardStartY; y <= claddingTopY + 0.01; y += weatherboardSpacing) {
        // Calculate Z coordinates directly at this height - different logic for each roof style
        let leftZ, rightZ;
        
        if (y <= baseboardsHeight) {
          // Below cladding start
          leftZ = -baseboardsWidth / 2;
          rightZ = baseboardsWidth / 2;
        } else if (y <= baseboardsHeight + 2.6) {
          // Between point1/5 and point2/4 - vertical sides (full width) - same for all
          leftZ = -baseboardsWidth / 2;
          rightZ = baseboardsWidth / 2;
        } else {
          // Between point2/4 and point3 - tapered section
          // Calculate taper parameter: 0 at point2/4, 1 at point3
          const heightFromPoint24 = y - (baseboardsHeight + 2.6);
          const totalHeightToPoint3 = point3Y - (baseboardsHeight + 2.6);
          const t = Math.min(1, Math.max(0, heightFromPoint24 / totalHeightToPoint3)); // Clamp between 0 and 1
          
          if (roofStyle === "Skillion") {
            // Skillion (rotated 180): right stays vertical, left tapers from point2 to point3
            // Point 3 is directly above point 2, so only the left side tapers
            // Reduce the left side extent so weatherboard lines don't run as far toward the 5-degree side
            rightZ = baseboardsWidth / 2; // Right stays at full width (flat side)
            const leftZFull = -baseboardsWidth / 2 + (baseboardsWidth / 2) * t; // Left tapers from full width to center
            const reductionAmount = 0.3; // 300mm reduction
            leftZ = leftZFull + reductionAmount; // Reduce extent toward the 5-degree side
          } else if (roofStyle === "Superior" || roofStyle === "Affordable") {
            // Superior/Affordable: both sides taper symmetrically toward center (Z=0)
            // At point2/4: leftZ = -baseboardsWidth/2, rightZ = baseboardsWidth/2
            // At point3: leftZ = 0, rightZ = 0
            leftZ = -baseboardsWidth / 2 + (baseboardsWidth / 2) * t;
            rightZ = baseboardsWidth / 2 - (baseboardsWidth / 2) * t;
          } else {
            // Default fallback
            leftZ = -baseboardsWidth / 2;
            rightZ = baseboardsWidth / 2;
          }
        }
        
        // Skip if width is zero (at peak) - but for Skillion, we might still have left side
        if (roofStyle === "Skillion") {
          // For Skillion, skip only if both sides are at the same Z
          if (Math.abs(rightZ - leftZ) < 0.001) continue;
        } else {
          // For Superior/Affordable, skip when both converge to center
          if (Math.abs(rightZ - leftZ) < 0.001) continue;
        }
        
        // Create a rectangular loop that follows the shape at this height
        // The shape is extruded along X-axis, so at each Y height, we have a rectangle
        // Create vertices for the rectangle at this height (relative to baseboards center)
        const yRelative = y - baseboardsHeight / 2;
        const vertices = new Float32Array([
          // Start at front-left corner, go around the rectangle
          -baseboardsLength / 2, yRelative, leftZ,   // Front-left
          baseboardsLength / 2, yRelative, leftZ,    // Front-right
          baseboardsLength / 2, yRelative, rightZ,   // Back-right
          -baseboardsLength / 2, yRelative, rightZ,  // Back-left
          // Close the loop (back to start)
          -baseboardsLength / 2, yRelative, leftZ,   // Front-left
        ]);
        
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        const line = new THREE.LineLoop(lineGeometry, lineMaterial);
        baseboardsRef.current.add(line);
        weatherboardLinesRef.current.push(line);
      }
    }
  }, [roofStyle, roofColour]);

  // Update cladding color when claddingColour changes
  useEffect(() => {
    if (!polygonMaterialRef.current) return;
    
    let color;
    if (claddingColour && claddingColour !== "Select") {
      const selectedColour = COLORBOND_COLOURS.find(c => c.name === claddingColour);
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        color = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
      }
    } else {
      // Default grey color
      color = new THREE.Color(0xcccccc);
    }
    
    if (color) {
      polygonMaterialRef.current.color = color;
      
      // Also update superior porch roof material if it exists
      if (porchRoofMaterialRef.current && roofStyle === "Superior") {
        porchRoofMaterialRef.current.color = color;
      }
    }
  }, [claddingColour, roofStyle]);

  // Update baseboards color when baseboardsColour changes
  useEffect(() => {
    if (!baseboardsMaterialRef.current && !porchTopMaterialRef.current && !porchSideMaterialRef.current) return;
    
    let color;
    if (baseboardsColour && baseboardsColour !== "Select") {
      const selectedColour = COLORBOND_COLOURS.find(c => c.name === baseboardsColour);
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        color = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
      }
    } else {
      // Default grey color
      color = new THREE.Color(0x888888);
    }
    
    if (baseboardsMaterialRef.current && color) {
      baseboardsMaterialRef.current.color = color;
    }
    
    if (porchTopMaterialRef.current && color) {
      porchTopMaterialRef.current.color = color;
    }
    
    if (porchSideMaterialRef.current && color) {
      porchSideMaterialRef.current.color = color;
    }
  }, [baseboardsColour]);

  // Update window frames color when windowFramesColour changes
  useEffect(() => {
    if (!windowCrossMaterialRef.current) return;
    
    if (windowFramesColour && windowFramesColour !== "Select") {
      let selectedColour;
      // Handle "Black" as "Night Sky"
      if (windowFramesColour === "Black") {
        selectedColour = COLORBOND_COLOURS.find(c => c.name === "Night Sky");
      } else {
        selectedColour = COLORBOND_COLOURS.find(c => c.name === windowFramesColour);
      }
      
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        const color = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
        windowCrossMaterialRef.current.color = color;
      }
    } else {
      // Default white color
      windowCrossMaterialRef.current.color = new THREE.Color(0xffffff);
    }
  }, [windowFramesColour]);

  // Update window surrounds color when windowSurroundsColour changes
  useEffect(() => {
    if (!windowSurroundMaterialRef.current) return;
    
    if (windowSurroundsColour && windowSurroundsColour !== "Select") {
      const selectedColour = COLORBOND_COLOURS.find(c => c.name === windowSurroundsColour);
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        const color = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
        windowSurroundMaterialRef.current.color = color;
      }
    } else {
      // Default white color
      windowSurroundMaterialRef.current.color = new THREE.Color(0xffffff);
    }
  }, [windowSurroundsColour]);

  // Update camera height and distance based on selected building part
  useEffect(() => {
    // Set target distance to 10000mm (10m) for all building parts
    targetCameraDistanceRef.current = 10.0;
    
    // Set target height based on building part
    if (selectedBuildingPart === "roof") {
      targetCameraHeightRef.current = 5.0; // 5000mm for roof
    } else if (selectedBuildingPart === "baseboards") {
      targetCameraHeightRef.current = 0.6; // 600mm for baseboards
    } else {
      targetCameraHeightRef.current = 1.8; // 1800mm for everything else
    }
  }, [selectedBuildingPart]);

  // Update camera height and distance when roof style changes (treat like selecting roof)
  // Only trigger when roofStyle actually changes, not on initial mount
  useEffect(() => {
    // Skip on initial mount - let selectedBuildingPart control initial camera position
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousRoofStyleRef.current = roofStyle;
      return;
    }
    
    // Only run if roofStyle actually changed
    if (previousRoofStyleRef.current === roofStyle) {
      return;
    }
    previousRoofStyleRef.current = roofStyle;
    
    if (roofStyle) {
      // Set target distance to 10000mm (10m)
      targetCameraDistanceRef.current = 10.0;
      // Set target height to 5000mm (5m) for roof view
      targetCameraHeightRef.current = 5.0;
    }
  }, [roofStyle]);

  // Update roof color when roofColour changes (main roof and porch roof)
  useEffect(() => {
    if (!roofMaterialRef.current && !porchRoofMaterialRef.current && superiorPorchRoofPlanesRef.current.length === 0) return;
    
    let color;
    if (roofColour && roofColour !== "Select") {
      const selectedColour = COLORBOND_COLOURS.find(c => c.name === roofColour);
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        color = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
      }
    } else {
      // Default grey color
      color = new THREE.Color(0x888888);
    }
    
    // Update main roof material
    if (roofMaterialRef.current && color) {
      roofMaterialRef.current.color = color;
    }
    
    // Update porch roof material (gable)
    if (porchRoofMaterialRef.current && color) {
      porchRoofMaterialRef.current.color = color;
    }
    
    // Update superior porch roof planes
    superiorPorchRoofPlanesRef.current.forEach(plane => {
      if (plane && plane.material && color) {
        plane.material.color = color;
      }
    });
  }, [roofColour]);

  // Update front door color when frontDoorColour changes
  useEffect(() => {
    if (!doorMaterialRef.current) return;
    
    if (frontDoorColour && frontDoorColour !== "Select") {
      const selectedColour = COLORBOND_COLOURS.find(c => c.name === frontDoorColour);
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        const color = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
        doorMaterialRef.current.color = color;
      }
    } else {
      // Default grey color
      doorMaterialRef.current.color = new THREE.Color(0x888888);
    }
  }, [frontDoorColour]);

  // Update balustrade color when balustradeColour changes (posts, handrails, and balusters)
  useEffect(() => {
    if (!balustradePostMaterialRef.current && !balustradeHandrailMaterialRef.current && !balustradeBalusterMaterialRef.current && !angledBalusterMaterialRef.current) return;
    
    let color;
    if (balustradeColour && balustradeColour !== "Select") {
      const selectedColour = COLORBOND_COLOURS.find(c => c.name === balustradeColour);
      if (selectedColour) {
        // Convert RGB (0-255) to Three.js color (0-1)
        color = new THREE.Color(
          selectedColour.r / 255,
          selectedColour.g / 255,
          selectedColour.b / 255
        );
      }
    } else {
      // Default grey color
      color = new THREE.Color(0x888888);
    }
    
    // Update all balustrade materials
    if (balustradePostMaterialRef.current && color) {
      balustradePostMaterialRef.current.color = color;
    }
    
    if (balustradeHandrailMaterialRef.current && color) {
      balustradeHandrailMaterialRef.current.color = color;
    }
    
    if (balustradeBalusterMaterialRef.current && color) {
      balustradeBalusterMaterialRef.current.color = color;
    }
    
    if (angledBalusterMaterialRef.current && color) {
      angledBalusterMaterialRef.current.color = color;
    }
  }, [balustradeColour]);

  // Roof, gable, and weatherboard lines removed - only baseboards remain

  // Section components
  const ExternalSection = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px", height: "628px" }}>
      {/* Roof Style */}
      <div>
        <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "4px", fontWeight: "500" }}>
          Roof Style
        </div>
        <select
          value={roofStyle || "Select"}
          onChange={handleRoofStyleChange}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "none",
            fontSize: "0.9rem",
            color: MONUMENT,
            background: WHITE,
            boxSizing: "border-box",
          }}
        >
          {ROOF_STYLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {/* Building Part Selector */}
      <div>
        <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "4px", fontWeight: "500" }}>
          Building Part
        </div>
        <select
          value={selectedBuildingPart}
          onChange={(e) => setSelectedBuildingPart(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "none",
            fontSize: "0.9rem",
            color: MONUMENT,
            background: WHITE,
            boxSizing: "border-box",
          }}
        >
          {BUILDING_PARTS.map((part) => (
            <option key={part.key} value={part.key}>
              {part.label}
            </option>
          ))}
        </select>
      </div>

      {/* Colour Picker */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}>
        {getAvailableColours(selectedBuildingPart).map((colour) => {
          const hex = getColourHex(colour.r, colour.g, colour.b);
          const currentColour = getCurrentColour(selectedBuildingPart);
          const isSelected = currentColour === colour.name;
          
          return (
            <div
              key={colour.displayName || colour.name}
              onClick={() => handleColourClick(colour.name)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                padding: "4px",
                borderRadius: "4px",
                cursor: "pointer",
                backgroundColor: isSelected ? "#f0f0f0" : "transparent",
                border: isSelected ? "2px solid #ff0000" : "1px solid #ddd",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = "#f9f9f9";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <div
                style={{
                  width: "35px",
                  height: "35px",
                  borderRadius: "3px",
                  backgroundColor: hex,
                  border: "1px solid #ccc",
                  flexShrink: 0,
                }}
              />
              <div style={{ fontSize: "0.7rem", fontWeight: 500, color: MONUMENT, textAlign: "center", lineHeight: "1.1" }}>
                {colour.displayName || colour.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const FlooringSection = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px", height: "628px", padding: "20px" }}>
      <div style={{ fontSize: "1.2rem", color: MONUMENT, fontWeight: 500 }}>
        Flooring
      </div>
      <div style={{ color: "#666", fontSize: "0.9rem" }}>
        Flooring options coming soon...
      </div>
    </div>
  );

  const KitchenSection = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px", height: "628px", padding: "20px" }}>
      <div style={{ fontSize: "1.2rem", color: MONUMENT, fontWeight: 500 }}>
        Kitchen
      </div>
      <div style={{ color: "#666", fontSize: "0.9rem" }}>
        Kitchen options coming soon...
      </div>
    </div>
  );

  const BathroomSection = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px", height: "628px", padding: "20px" }}>
      <div style={{ fontSize: "1.2rem", color: MONUMENT, fontWeight: 500 }}>
        Bathroom
      </div>
      <div style={{ color: "#666", fontSize: "0.9rem" }}>
        Bathroom options coming soon...
      </div>
    </div>
  );

  const BedroomSection = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px", height: "628px", padding: "20px" }}>
      <div style={{ fontSize: "1.2rem", color: MONUMENT, fontWeight: 500 }}>
        Bedroom
      </div>
      <div style={{ color: "#666", fontSize: "0.9rem" }}>
        Bedroom options coming soon...
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "external":
        return <ExternalSection />;
      case "flooring":
        return <FlooringSection />;
      case "kitchen":
        return <KitchenSection />;
      case "bathroom":
        return <BathroomSection />;
      case "bedroom":
        return <BedroomSection />;
      default:
        return <ExternalSection />;
    }
  };

  const sections = [
    { key: "external", label: "External" },
    { key: "flooring", label: "Flooring" },
    { key: "kitchen", label: "Kitchen" },
    { key: "bathroom", label: "Bathroom" },
    { key: "bedroom", label: "Bedroom" },
  ];

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: "24px" }}>
        {/* Left side - Controls */}
        {renderSection()}

        {/* Right side - 3D Model and Submenu */}
        <div style={{ flex: 1, display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div style={{ height: "600px", maxWidth: "1000px", overflow: "hidden", marginTop: "28px" }}>
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          </div>
          {/* Submenu Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "28px" }}>
            {sections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                style={{
                  background: activeSection === section.key ? "#1a1a1b" : MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (activeSection !== section.key) {
                    e.currentTarget.style.background = "#1a1a1b";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSection !== section.key) {
                    e.currentTarget.style.background = MONUMENT;
                  }
                }}
              >
                {section.label}
              </button>
            ))}
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                  marginTop: "8px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1b")}
                onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
              >
                ← Back
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
