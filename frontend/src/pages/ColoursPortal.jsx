import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import ThreeDVis from "./ThreeDVis";

const API_URL = "";

export default function ColoursPortal() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // All the state variables that ThreeDVis needs
  const [roofColour, setRoofColour] = useState("Select");
  const [claddingColour, setCladdingColour] = useState("Select");
  const [baseboardsColour, setBaseboardsColour] = useState("Select");
  const [roofStyle, setRoofStyle] = useState("Select");
  const [fasciaGutterColour, setFasciaGutterColour] = useState("Select");
  const [balustradeColour, setBalustradeColour] = useState("Select");
  const [frontDoorColour, setFrontDoorColour] = useState("Select");
  const [windowFramesColour, setWindowFramesColour] = useState("Select");
  const [windowSurroundsColour, setWindowSurroundsColour] = useState("Select");

  useEffect(() => {
    // Fetch full project data
    async function fetchProject() {
      try {
        const response = await fetch(`${API_URL}/api/projects/${projectId}`);
        if (!response.ok) {
          throw new Error("Project not found");
        }
        const projectData = await response.json();
        setProject(projectData);
        
        // Load all current colour values
        setRoofColour(projectData.roof_colour || "Select");
        setCladdingColour(projectData.cladding_colour || "Select");
        setBaseboardsColour(projectData.baseboards_colour || "Select");
        setRoofStyle(projectData.roof_style || "Select");
        setFasciaGutterColour(projectData.fascia_gutter_colour || "Select");
        setBalustradeColour(projectData.balustrade_colour || "Select");
        setFrontDoorColour(projectData.front_door_colour || "Select");
        setWindowFramesColour(projectData.window_frames_colour || "Select");
        setWindowSurroundsColour(projectData.window_surrounds_colour || "Select");
      } catch (error) {
        console.error("Error fetching project:", error);
        setError("Project not found");
      } finally {
        setLoading(false);
      }
    }
    
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  // Save function for roof, cladding, baseboards (used by ThreeDVis)
  async function saveColoursFromProjectPage(nextRoof, nextCladding, nextBaseboards) {
    if (!projectId) {
      console.error("Cannot save colours: no project ID");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/update-colours`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roof_colour: nextRoof === "Select" ? null : nextRoof,
          cladding_colour: nextCladding === "Select" ? null : nextCladding,
          baseboards_colour: nextBaseboards === "Select" ? null : nextBaseboards,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save colours");
      }

      // Update local project state
      setProject(prev => ({
        ...prev,
        roof_colour: nextRoof === "Select" ? null : nextRoof,
        cladding_colour: nextCladding === "Select" ? null : nextCladding,
        baseboards_colour: nextBaseboards === "Select" ? null : nextBaseboards,
      }));
    } catch (error) {
      console.error("Error saving colours from project page:", error);
      alert(`Failed to save colours: ${error.message}`);
    }
  }

  // Save function for roof style
  async function handleRoofStyleChange(e) {
    const newValue = e.target.value;
    setRoofStyle(newValue);
    
    if (!projectId) {
      console.error("Cannot save: no project ID");
      return;
    }

    try {
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project?.status || null,
          stream: project?.stream || null,
          suburb: project?.suburb || null,
          street: project?.street || null,
          state: project?.state || null,
          deposit: project?.deposit || null,
          project_cost: project?.project_cost || null,
          roof_style: newValue === "Select" ? null : newValue,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        setProject(prev => ({
          ...prev,
          roof_style: newValue === "Select" ? null : newValue,
        }));
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  // Save function for fascia/gutter colour
  async function handleFasciaGutterColourChange(e) {
    const newValue = e.target.value;
    setFasciaGutterColour(newValue);
    
    if (!projectId) {
      console.error("Cannot save: no project ID");
      return;
    }

    try {
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project?.status || null,
          stream: project?.stream || null,
          suburb: project?.suburb || null,
          street: project?.street || null,
          state: project?.state || null,
          deposit: project?.deposit || null,
          project_cost: project?.project_cost || null,
          fascia_gutter_colour: newValue === "Select" ? null : newValue,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        setProject(prev => ({
          ...prev,
          fascia_gutter_colour: newValue === "Select" ? null : newValue,
        }));
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  // Save function for balustrade colour
  async function handleBalustradeColourChange(e) {
    const newValue = e.target.value;
    setBalustradeColour(newValue);
    
    if (!projectId) {
      console.error("Cannot save: no project ID");
      return;
    }

    try {
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project?.status || null,
          stream: project?.stream || null,
          suburb: project?.suburb || null,
          street: project?.street || null,
          state: project?.state || null,
          deposit: project?.deposit || null,
          project_cost: project?.project_cost || null,
          balustrade_colour: newValue === "Select" ? null : newValue,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        setProject(prev => ({
          ...prev,
          balustrade_colour: newValue === "Select" ? null : newValue,
        }));
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  // Save function for front door colour
  async function handleFrontDoorColourChange(e) {
    const newValue = e.target.value;
    setFrontDoorColour(newValue);
    
    if (!projectId) {
      console.error("Cannot save: no project ID");
      return;
    }

    try {
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project?.status || null,
          stream: project?.stream || null,
          suburb: project?.suburb || null,
          street: project?.street || null,
          state: project?.state || null,
          deposit: project?.deposit || null,
          project_cost: project?.project_cost || null,
          front_door_colour: newValue === "Select" ? null : newValue,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        setProject(prev => ({
          ...prev,
          front_door_colour: newValue === "Select" ? null : newValue,
        }));
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  // Save function for window frames colour
  async function handleWindowFramesColourChange(e) {
    const newValue = e.target.value;
    setWindowFramesColour(newValue);
    
    if (!projectId) {
      console.error("Cannot save: no project ID");
      return;
    }

    try {
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project?.status || null,
          stream: project?.stream || null,
          suburb: project?.suburb || null,
          street: project?.street || null,
          state: project?.state || null,
          deposit: project?.deposit || null,
          project_cost: project?.project_cost || null,
          window_frames_colour: newValue === "Select" ? null : newValue,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        setProject(prev => ({
          ...prev,
          window_frames_colour: newValue === "Select" ? null : newValue,
        }));
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  // Save function for window surrounds colour
  async function handleWindowSurroundsColourChange(e) {
    const newValue = e.target.value;
    setWindowSurroundsColour(newValue);
    
    if (!projectId) {
      console.error("Cannot save: no project ID");
      return;
    }

    try {
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project?.status || null,
          stream: project?.stream || null,
          suburb: project?.suburb || null,
          street: project?.street || null,
          state: project?.state || null,
          deposit: project?.deposit || null,
          project_cost: project?.project_cost || null,
          window_surrounds_colour: newValue === "Select" ? null : newValue,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        setProject(prev => ({
          ...prev,
          window_surrounds_colour: newValue === "Select" ? null : newValue,
        }));
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  // Update function (for refreshing project data)
  async function handleUpdate() {
    if (!projectId) return;
    
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`);
      if (response.ok) {
        const projectData = await response.json();
        setProject(projectData);
        
        // Update all colour states
        setRoofColour(projectData.roof_colour || "Select");
        setCladdingColour(projectData.cladding_colour || "Select");
        setBaseboardsColour(projectData.baseboards_colour || "Select");
        setRoofStyle(projectData.roof_style || "Select");
        setFasciaGutterColour(projectData.fascia_gutter_colour || "Select");
        setBalustradeColour(projectData.balustrade_colour || "Select");
        setFrontDoorColour(projectData.front_door_colour || "Select");
        setWindowFramesColour(projectData.window_frames_colour || "Select");
        setWindowSurroundsColour(projectData.window_surrounds_colour || "Select");
      }
    } catch (error) {
      console.error("Error updating project:", error);
    }
  }

  if (loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        background: "#323233",
        color: "#fff"
      }}>
        Loading...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        background: "#323233",
        color: "#fff"
      }}>
        {error || "Project not found"}
      </div>
    );
  }

  // Render the full ThreeDVis component with all the same props as in Colours.jsx
  return (
    <ThreeDVis 
      project={project} 
      onBack={null} // No back button for client portal
      onUpdate={handleUpdate}
      roofColour={roofColour}
      claddingColour={claddingColour}
      baseboardsColour={baseboardsColour}
      setRoofColour={setRoofColour}
      setCladdingColour={setCladdingColour}
      setBaseboardsColour={setBaseboardsColour}
      saveColoursFromProjectPage={saveColoursFromProjectPage}
      roofStyle={roofStyle}
      setRoofStyle={setRoofStyle}
      handleRoofStyleChange={handleRoofStyleChange}
      fasciaGutterColour={fasciaGutterColour}
      setFasciaGutterColour={setFasciaGutterColour}
      handleFasciaGutterColourChange={handleFasciaGutterColourChange}
      balustradeColour={balustradeColour}
      setBalustradeColour={setBalustradeColour}
      handleBalustradeColourChange={handleBalustradeColourChange}
      frontDoorColour={frontDoorColour}
      setFrontDoorColour={setFrontDoorColour}
      handleFrontDoorColourChange={handleFrontDoorColourChange}
      windowFramesColour={windowFramesColour}
      setWindowFramesColour={setWindowFramesColour}
      handleWindowFramesColourChange={handleWindowFramesColourChange}
      windowSurroundsColour={windowSurroundsColour}
      setWindowSurroundsColour={setWindowSurroundsColour}
      handleWindowSurroundsColourChange={handleWindowSurroundsColourChange}
    />
  );
}
