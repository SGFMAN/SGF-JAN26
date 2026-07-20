/**
 * Project list queries — lite mode omits large TEXT/path columns not needed on grid pages.
 */

const PROJECT_SELECT_COLUMNS =
  "id, access_token, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, project_cost, salesperson, proposal_pdf_location, site_visit_status, site_visit_date, site_visit_time, site_visit_notes, site_visit_scheduled_date, site_visit_scheduled_period, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_authority, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, project_info_notes, specs, classification, project_log, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_status, drawings_pdf_location, drawings_history, drawings_viewed_date, drawings_sent_to_client_date, drawings_holder_date, draftsperson, drawings_holder, drawing_manager_notes, colours_status, colours_notes, colours_pdf_location, colours_sent_date, colours_reminder_sent_date, colours_plan_trace_polygon, roof_colour, cladding_colour, baseboards_colour, roof_style, windowframes_colour, windowsurrounds_colour, door_colour, slidingdoor_colour, planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit, septic_notes, septic_email_sent_date, pic, number_of_robes, robe_widths, robe_plan_pdf_location, robe_colours_pdf_location, substatus, substatus_detail, on_hold, survey_status, soil_status, qp_number, planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant, planning_jf_section_173_agreement, planning_jf_plan_of_subdivision, planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan, planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report, planning_jf_planning_property_report_requested_at, planning_jf_planning_property_report_received_at, planning_jf_title_requested_at, planning_jf_title_received_at, planning_jf_covenant_requested_at, planning_jf_covenant_received_at, planning_jf_section_173_agreement_requested_at, planning_jf_section_173_agreement_received_at, planning_jf_plan_of_subdivision_requested_at, planning_jf_plan_of_subdivision_received_at, planning_jf_ebyda_stormwater_requested_at, planning_jf_ebyda_stormwater_received_at, planning_jf_byda_sewer_main_requested_at, planning_jf_byda_sewer_main_received_at, planning_jf_internal_sewer_plan_requested_at, planning_jf_internal_sewer_plan_received_at, planning_jf_sewer_main_size_depth_offset_requested_at, planning_jf_sewer_main_size_depth_offset_received_at, planning_jf_legal_point_discharge_requested_at, planning_jf_legal_point_discharge_received_at, planning_jf_property_info_report_requested_at, planning_jf_property_info_report_received_at, planning_jf_planning_property_report_path, planning_jf_title_path, planning_jf_covenant_path, planning_jf_section_173_agreement_path, planning_jf_plan_of_subdivision_path, planning_jf_ebyda_stormwater_path, planning_jf_byda_sewer_main_path, planning_jf_internal_sewer_plan_path, planning_jf_sewer_main_size_depth_offset_path, planning_jf_legal_point_discharge_path, planning_jf_property_info_report_path, planning_jf_job_file_pdf_path, planning_written_advice, planning_written_advice_requested_at, planning_written_advice_received_at, planning_town_planning, planning_town_planning_requested_at, planning_town_planning_received_at, planning_land_flooding_regulation, planning_land_flooding_fpa_requested_at, planning_land_flooding_fpa_received_at, planning_land_flooding_cc_requested_at, planning_land_flooding_cc_received_at, planning_bal, planning_bal_requested_at, planning_bal_received_at, planning_footing_certification_requested_at, planning_footing_certification_received_at, planning_energy_report_requested_at, planning_energy_report_received_at, planning_energy_specs_added_to_plans, duplicate_source_project_id, project_lat, project_lng, project_geocoded_at, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active, client_notes";

const LITE_OMIT_EXACT = new Set([
  "project_log",
  "notes",
  "project_info_notes",
  "colours_notes",
  "client_notes",
  "proposal_pdf_location",
  "drawings_pdf_location",
  "colours_pdf_location",
  "window_order_pdf_location",
  "robe_plan_pdf_location",
  "robe_colours_pdf_location",
]);

function omitFromLite(column) {
  const c = column.trim();
  if (LITE_OMIT_EXACT.has(c)) return true;
  if (c.endsWith("_path")) return true;
  return false;
}

const PROJECT_LIST_COLUMNS = PROJECT_SELECT_COLUMNS.split(",")
  .map((c) => c.trim())
  .filter((c) => !omitFromLite(c))
  .join(", ");

function buildProjectsListQuery(useLite) {
  const cols = useLite ? PROJECT_LIST_COLUMNS : PROJECT_SELECT_COLUMNS;
  return `SELECT ${cols} FROM projects ORDER BY updated_at DESC, id DESC`;
}

module.exports = {
  PROJECT_SELECT_COLUMNS,
  buildProjectsListQuery,
};
