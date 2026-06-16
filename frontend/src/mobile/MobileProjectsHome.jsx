import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";
import MobileProjectCard from "./MobileProjectCard";
import logo from "../images/logo.png";
import "./mobile.css";

const API_URL = "";

const STATE_OPTIONS = ["All", "VIC", "QLD"];

export default function MobileProjectsHome() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState(getStateFilter());

  useEffect(() => {
    void fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  function handleStateFilter(next) {
    setStateFilter(next);
    saveStateFilter(next);
  }

  function getFilteredProjects() {
    let filtered = projects.filter(
      (project) => project.status !== "Hotlist" && project.status !== "Cancelled"
    );

    if (stateFilter !== "All") {
      filtered = filtered.filter(
        (project) => (project.state || "").toUpperCase() === stateFilter.toUpperCase()
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((project) => {
        const suburb = (project.suburb || "").toLowerCase();
        const street = (project.street || "").toLowerCase();
        const name = (project.name || "").toLowerCase();
        const client = (project.client_name || project.client1_name || "").toLowerCase();
        const status = (project.status || "").toLowerCase();
        return (
          suburb.includes(query) ||
          street.includes(query) ||
          name.includes(query) ||
          client.includes(query) ||
          status.includes(query)
        );
      });
    }

    filtered.sort((a, b) => {
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      const streetA = (a.street || "").toLowerCase();
      const streetB = (b.street || "").toLowerCase();
      return streetA.localeCompare(streetB);
    });

    return filtered;
  }

  const filteredProjects = getFilteredProjects();

  return (
    <div className="mobile-shell sgf-mobile-only">
      <header className="mobile-shell__header">
        <Link to="/projects" className="mobile-shell__header-back" aria-label="SGF Central home">
          <img src={logo} alt="SGF" style={{ width: 36, height: "auto" }} />
        </Link>
        <h1 className="mobile-shell__header-title">Projects</h1>
      </header>

      <div className="mobile-shell__search-wrap">
        <input
          type="search"
          className="mobile-shell__search"
          placeholder="Search suburb, street, client, status…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          aria-label="Search projects"
        />
        <div className="mobile-filter-row">
          {STATE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`mobile-filter-chip${
                stateFilter === option ? " mobile-filter-chip--active" : ""
              }`}
              onClick={() => handleStateFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-shell__body">
        {loading && <p className="mobile-shell__status">Loading projects…</p>}
        {error && (
          <p className="mobile-shell__status mobile-shell__status--error">Error: {error}</p>
        )}
        {!loading && !error && filteredProjects.length === 0 && (
          <p className="mobile-shell__status">No projects match your search.</p>
        )}
        {!loading && !error && filteredProjects.length > 0 && (
          <div className="mobile-project-list">
            {filteredProjects.map((project) => (
              <MobileProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
