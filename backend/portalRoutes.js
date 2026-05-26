const {
  isLegacyNumericProjectId,
  resolveProjectIdFromAccessToken,
} = require("./projectAccessToken");

module.exports = function registerPortalRoutes(app, pool, fs) {
  async function resolvePortalProjectId(routeParam) {
    if (isLegacyNumericProjectId(routeParam)) return null;
    return resolveProjectIdFromAccessToken(pool, routeParam);
  }

  // Portal: list projects where status is exactly "Design Phase"
  app.get("/api/portal/projects", async (req, res) => {
    try {
      if (!pool) {
        return res.status(500).json({ error: "DATABASE_URL not set" });
      }

      const r = await pool.query(
        `
          SELECT
            id,
            access_token,
            suburb,
            street,
            classification,
            stream,
            state,
            client_name AS "clientName"
          FROM projects
          WHERE status = 'Design Phase'
            -- on_hold can be stored as boolean or as string values; compare via ::text for safety
            AND (on_hold IS NULL OR on_hold::text IN ('f', 'false', '0'))
          ORDER BY suburb ASC NULLS LAST, street ASC NULLS LAST, updated_at DESC, id DESC
        `
      );

      return res.json(r.rows);
    } catch (e) {
      console.error("Error in GET /api/portal/projects:", e);
      return res.status(500).json({ error: "Failed to fetch portal projects" });
    }
  });

  const PORTAL_FULL_PROJECT_SELECT = `SELECT id, access_token, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, project_cost, salesperson, proposal_pdf_location, site_visit_status, site_visit_date, site_visit_time, site_visit_notes, site_visit_scheduled_date, site_visit_scheduled_period, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_authority, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, project_info_notes, specs, classification, project_log, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_status, drawings_pdf_location, drawings_history, drawings_viewed_date, drawings_sent_to_client_date, drawings_holder_date, draftsperson, drawings_holder, drawing_manager_notes, colours_status, colours_notes, colours_pdf_location, colours_sent_date, colours_reminder_sent_date, roof_colour, cladding_colour, baseboards_colour, roof_style, planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit, septic_notes, septic_email_sent_date, pic, number_of_robes, robe_widths, robe_plan_pdf_location, robe_colours_pdf_location, substatus, substatus_detail, on_hold, survey_status, soil_status, qp_number, planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant, planning_jf_section_173_agreement, planning_jf_plan_of_subdivision, planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan, planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report, planning_jf_planning_property_report_requested_at, planning_jf_planning_property_report_received_at, planning_jf_title_requested_at, planning_jf_title_received_at, planning_jf_covenant_requested_at, planning_jf_covenant_received_at, planning_jf_section_173_agreement_requested_at, planning_jf_section_173_agreement_received_at, planning_jf_plan_of_subdivision_requested_at, planning_jf_plan_of_subdivision_received_at, planning_jf_ebyda_stormwater_requested_at, planning_jf_ebyda_stormwater_received_at, planning_jf_byda_sewer_main_requested_at, planning_jf_byda_sewer_main_received_at, planning_jf_internal_sewer_plan_requested_at, planning_jf_internal_sewer_plan_received_at, planning_jf_sewer_main_size_depth_offset_requested_at, planning_jf_sewer_main_size_depth_offset_received_at, planning_jf_legal_point_discharge_requested_at, planning_jf_legal_point_discharge_received_at, planning_jf_property_info_report_requested_at, planning_jf_property_info_report_received_at, planning_jf_planning_property_report_path, planning_jf_title_path, planning_jf_covenant_path, planning_jf_section_173_agreement_path, planning_jf_plan_of_subdivision_path, planning_jf_ebyda_stormwater_path, planning_jf_byda_sewer_main_path, planning_jf_internal_sewer_plan_path, planning_jf_sewer_main_size_depth_offset_path, planning_jf_legal_point_discharge_path, planning_jf_property_info_report_path, planning_jf_job_file_pdf_path, duplicate_source_project_id, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active, client_notes FROM projects`;

  // Portal: full project row (same shape as GET /api/projects/:id) for read-only project page UI
  app.get("/api/portal/projects/:id/full", async (req, res) => {
    try {
      if (!pool) {
        return res.status(500).json({ error: "DATABASE_URL not set" });
      }

      const id = await resolvePortalProjectId(req.params.id);
      if (!id) {
        return res.status(404).json({ error: "Project not found" });
      }

      const r = await pool.query(
        `${PORTAL_FULL_PROJECT_SELECT}
          WHERE id = $1
            AND status = 'Design Phase'
            AND (on_hold IS NULL OR on_hold::text IN ('f', 'false', '0'))`,
        [id]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      const row = r.rows[0];
      const copiesR = await pool.query(
        `SELECT id FROM projects WHERE duplicate_source_project_id = $1 ORDER BY id ASC`,
        [id]
      );
      row.duplicate_linked_project_ids = copiesR.rows.map((x) => x.id);

      return res.json(row);
    } catch (e) {
      console.error("Error in GET /api/portal/projects/:id/full:", e);
      return res.status(500).json({ error: "Failed to fetch portal project" });
    }
  });

  // Portal: project details (only the allowed fields)
  app.get("/api/portal/projects/:id", async (req, res) => {
    try {
      if (!pool) {
        return res.status(500).json({ error: "DATABASE_URL not set" });
      }

      const id = await resolvePortalProjectId(req.params.id);
      if (!id) {
        return res.status(404).json({ error: "Project not found" });
      }

      const r = await pool.query(
        `
          SELECT
            suburb,
            street,
            classification,
            stream,
            state,
            client_name AS "clientName",
            email AS "clientEmail",
            phone AS "phoneNumber"
          FROM projects
          WHERE id = $1
            AND status = 'Design Phase'
            AND (on_hold IS NULL OR on_hold::text IN ('f', 'false', '0'))
        `,
        [id]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      return res.json(r.rows[0]);
    } catch (e) {
      console.error("Error in GET /api/portal/projects/:id:", e);
      return res.status(500).json({ error: "Failed to fetch portal project" });
    }
  });

  // Portal: stream the drawing PDF for the project (anti-cache headers)
  app.get("/api/portal/projects/:id/drawing", async (req, res) => {
    try {
      if (!pool) {
        return res.status(500).json({ error: "DATABASE_URL not set" });
      }

      const id = await resolvePortalProjectId(req.params.id);
      if (!id) {
        return res.status(404).json({ error: "Project not found" });
      }

      const r = await pool.query(
        `
          SELECT drawings_pdf_location
          FROM projects
          WHERE id = $1 AND status = 'Design Phase'
        `,
        [id]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      const drawingsPdfPath = r.rows[0].drawings_pdf_location;
      if (!drawingsPdfPath) {
        return res.status(404).json({ error: "Drawings PDF not found" });
      }

      try {
        await fs.access(drawingsPdfPath);
      } catch (e) {
        return res.status(404).json({ error: "Drawings PDF not found" });
      }

      const fileBuffer = await fs.readFile(drawingsPdfPath);

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Drawings.pdf"`);
      res.send(fileBuffer);
    } catch (e) {
      console.error("Error in GET /api/portal/projects/:id/drawing:", e);
      return res.status(500).json({ error: "Failed to serve drawings PDF" });
    }
  });
};
