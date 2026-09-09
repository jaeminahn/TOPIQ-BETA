import type { AdminExportDataset, AdminExportFilters, SqlQuery } from "./types.js";

export function buildSessionFilters(filters: AdminExportFilters, values: unknown[], alias = "s") {
  const clauses: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.status === "all") clauses.push(`${alias}.status IN ('submitted','abandoned')`);
  else clauses.push(`${alias}.status=${parameter(filters.status)}`);
  if (filters.mockTestId) clauses.push(`${alias}.mock_test_id=${parameter(filters.mockTestId)}`);
  if (filters.mode) clauses.push(`${alias}.mode=${parameter(filters.mode)}`);
  if (filters.from) {
    clauses.push(`COALESCE(${alias}.submitted_at,${alias}.abandoned_at) >= (${parameter(filters.from)}::date AT TIME ZONE 'Asia/Seoul')`);
  }
  if (filters.to) {
    clauses.push(`COALESCE(${alias}.submitted_at,${alias}.abandoned_at) < ((${parameter(filters.to)}::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul')`);
  }
  if (filters.section) {
    clauses.push(`EXISTS (SELECT 1 FROM topik_app.session_items section_item WHERE section_item.session_id=${alias}.session_id AND section_item.section=${parameter(filters.section)})`);
  }
  return clauses;
}

function questionQuery(filters: AdminExportFilters, ordered: boolean): SqlQuery {
  const values: unknown[] = [];
  const sessionFilters = buildSessionFilters(filters, values);
  const inventoryFilters: string[] = [];
  const responseFilters: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.mockTestId) inventoryFilters.push(`mt.mock_test_id=${parameter(filters.mockTestId)}`);
  if (filters.section) inventoryFilters.push(`mts.section=${parameter(filters.section)}`);
  if (filters.itemType) {
    inventoryFilters.push(`iv.item_type=${parameter(filters.itemType)}`);
    responseFilters.push(`iv.item_type=${parameter(filters.itemType)}`);
  }
  if (filters.section) responseFilters.push(`si.section=${parameter(filters.section)}`);
  const minimum = parameter(filters.minAssignedCount);
  const text = `
    WITH filtered_sessions AS (
      SELECT s.*,COALESCE(s.submitted_at,s.abandoned_at) AS completed_at
        FROM topik_app.sessions s
       WHERE ${sessionFilters.join(" AND ")}
    ), question_inventory AS (
      SELECT mt.mock_test_id,mt.slug AS mock_test_slug,mt.title_ko AS mock_test_title_ko,
             mt.title_en AS mock_test_title_en,mts.section,qsi.set_id,qsi.set_version,
             qsi.position AS test_position,iv.item_id,iv.item_version,iv.item_type,
             iv.primary_skill,iv.target_level,iv.predicted_difficulty,iv.irt_difficulty,
             iv.irt_discrimination,COALESCE(iv.content_json->>'question_prompt','') AS question_prompt,
             COALESCE(NULLIF(iv.content_json->>'stem',''),iv.stem,'') AS stem,
             COALESCE(iv.content_json->>'passage','') AS passage,
             COALESCE(iv.content_json->>'auxiliary_text','') AS auxiliary_text,
             COALESCE(iv.content_json->>'highlight_text','') AS highlight_text,
             COALESCE(iv.content_json->'choices',iv.choices,'[]'::jsonb) AS export_choices,
             iv.correct_answer,iv.explanation,COALESCE(iv.content_json->'dialogue_turns','[]'::jsonb) AS transcript_json,
             COALESCE(iv.content_json->'visual_options','[]'::jsonb) AS visual_options_json,
             iv.content_json
        FROM topik_app.mock_tests mt
        JOIN topik_app.mock_test_sections mts ON mts.mock_test_id=mt.mock_test_id
        JOIN topik_bank.question_set_items qsi ON qsi.set_id=mts.set_id AND qsi.set_version=mts.set_version
        JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
       ${inventoryFilters.length ? `WHERE ${inventoryFilters.join(" AND ")}` : ""}
      UNION
      SELECT mt.mock_test_id,mt.slug,mt.title_ko,mt.title_en,si.section,si.set_id,si.set_version,
             si.test_position,iv.item_id,iv.item_version,iv.item_type,iv.primary_skill,
             iv.target_level,iv.predicted_difficulty,iv.irt_difficulty,iv.irt_discrimination,
             COALESCE(iv.content_json->>'question_prompt',''),
             COALESCE(NULLIF(iv.content_json->>'stem',''),iv.stem,''),
             COALESCE(iv.content_json->>'passage',''),COALESCE(iv.content_json->>'auxiliary_text',''),
             COALESCE(iv.content_json->>'highlight_text',''),
             COALESCE(iv.content_json->'choices',iv.choices,'[]'::jsonb),iv.correct_answer,iv.explanation,
             COALESCE(iv.content_json->'dialogue_turns','[]'::jsonb),
             COALESCE(iv.content_json->'visual_options','[]'::jsonb),iv.content_json
        FROM filtered_sessions fs
        JOIN topik_app.mock_tests mt ON mt.mock_test_id=fs.mock_test_id
        JOIN topik_app.session_items si ON si.session_id=fs.session_id
        JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
       ${responseFilters.length ? `WHERE ${responseFilters.join(" AND ")}` : ""}
    ), response_rows AS (
      SELECT fs.mock_test_id,si.section,si.set_id,si.set_version,si.test_position,si.item_id,si.item_version,
             COALESCE(ro.selected_option,a.selected_option) AS selected_option,
             iv.correct_answer,
             CASE WHEN ro.observation_id IS NOT NULL THEN ro.response_time_ms ELSE COALESCE((
               SELECT SUM(e.active_duration_delta_ms)::int FROM topik_app.response_events e
                WHERE e.session_id=fs.session_id AND e.item_order=si.item_order
             ),0) END AS response_time_ms,
             COALESCE(ro.answer_changed,a.selection_count>1,FALSE) AS answer_changed
        FROM filtered_sessions fs
        JOIN topik_app.session_items si ON si.session_id=fs.session_id
        JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
        LEFT JOIN topik_app.response_observations ro ON ro.session_id=si.session_id AND ro.item_order=si.item_order
        LEFT JOIN topik_app.answer_states a ON a.session_id=si.session_id AND a.item_order=si.item_order
       ${responseFilters.length ? `WHERE ${responseFilters.join(" AND ")}` : ""}
    ), stats AS (
      SELECT mock_test_id,section,set_id,set_version,test_position,item_id,item_version,
             COUNT(*)::int AS assigned_count,
             COUNT(*) FILTER (WHERE selected_option IS NOT NULL)::int AS answered_count,
             COUNT(*) FILTER (WHERE selected_option IS NULL)::int AS unanswered_count,
             COUNT(*) FILTER (WHERE selected_option=correct_answer)::int AS correct_count,
             COUNT(*) FILTER (WHERE selected_option IS NOT NULL AND selected_option<>correct_answer)::int AS incorrect_count,
             COUNT(*) FILTER (WHERE selected_option=1)::int AS option_1_count,
             COUNT(*) FILTER (WHERE selected_option=2)::int AS option_2_count,
             COUNT(*) FILTER (WHERE selected_option=3)::int AS option_3_count,
             COUNT(*) FILTER (WHERE selected_option=4)::int AS option_4_count,
             ROUND(AVG(response_time_ms) FILTER (WHERE selected_option IS NOT NULL),2) AS avg_answered_response_time_ms,
             ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms)
               FILTER (WHERE selected_option IS NOT NULL))::numeric,2) AS median_answered_response_time_ms,
             COUNT(*) FILTER (WHERE selected_option IS NOT NULL AND answer_changed)::int AS answer_changed_count
        FROM response_rows
       GROUP BY mock_test_id,section,set_id,set_version,test_position,item_id,item_version
    )
    SELECT qi.mock_test_id,qi.mock_test_slug,qi.mock_test_title_ko,qi.mock_test_title_en,
           qi.section,qi.set_id,qi.set_version,qi.test_position,qi.item_id,qi.item_version,
           qi.item_type,qi.primary_skill,qi.target_level,qi.predicted_difficulty,qi.irt_difficulty,
           qi.irt_discrimination,qi.question_prompt,qi.stem,qi.passage,qi.auxiliary_text,
           qi.highlight_text,qi.export_choices->>0 AS choice_1,qi.export_choices->>1 AS choice_2,
           qi.export_choices->>2 AS choice_3,qi.export_choices->>3 AS choice_4,qi.correct_answer,
           qi.explanation,qi.transcript_json::text AS transcript_json,
           qi.visual_options_json::text AS visual_options_json,qi.content_json::text AS content_json,
           COALESCE(st.assigned_count,0) AS assigned_count,COALESCE(st.answered_count,0) AS answered_count,
           COALESCE(st.unanswered_count,0) AS unanswered_count,COALESCE(st.correct_count,0) AS correct_count,
           COALESCE(st.incorrect_count,0) AS incorrect_count,
           CASE WHEN st.answered_count>0 THEN ROUND(st.correct_count*100.0/st.answered_count,2) END AS answered_accuracy_pct,
           CASE WHEN st.assigned_count>0 THEN ROUND(st.correct_count*100.0/st.assigned_count,2) END AS overall_accuracy_pct,
           COALESCE(st.option_1_count,0) AS option_1_count,COALESCE(st.option_2_count,0) AS option_2_count,
           COALESCE(st.option_3_count,0) AS option_3_count,COALESCE(st.option_4_count,0) AS option_4_count,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_1_count*100.0/st.answered_count,2) END AS option_1_pct,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_2_count*100.0/st.answered_count,2) END AS option_2_pct,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_3_count*100.0/st.answered_count,2) END AS option_3_pct,
           CASE WHEN st.answered_count>0 THEN ROUND(st.option_4_count*100.0/st.answered_count,2) END AS option_4_pct,
           st.avg_answered_response_time_ms,st.median_answered_response_time_ms,
           COALESCE(st.answer_changed_count,0) AS answer_changed_count,
           CASE WHEN st.answered_count>0 THEN ROUND(st.answer_changed_count*100.0/st.answered_count,2) END AS answer_changed_rate_pct
      FROM question_inventory qi
      LEFT JOIN stats st ON st.mock_test_id=qi.mock_test_id AND st.section=qi.section
       AND st.set_id=qi.set_id AND st.set_version=qi.set_version AND st.test_position=qi.test_position
       AND st.item_id=qi.item_id AND st.item_version=qi.item_version
     WHERE COALESCE(st.assigned_count,0) >= ${minimum}
     ${ordered ? "ORDER BY qi.mock_test_slug,qi.section,qi.test_position,qi.set_version,qi.item_version" : ""}`;
  return { text, values };
}

function responseQuery(filters: AdminExportFilters, ordered: boolean): SqlQuery {
  const values: unknown[] = [];
  const sessionFilters = buildSessionFilters(filters, values);
  const rowFilters: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.section) rowFilters.push(`response_rows.section=${parameter(filters.section)}`);
  if (filters.outcome === "answered") rowFilters.push("response_rows.response_outcome IN ('correct','incorrect')");
  if (["correct", "incorrect", "unanswered"].includes(filters.outcome)) {
    rowFilters.push(`response_rows.response_outcome=${parameter(filters.outcome)}`);
  }
  const text = `
    WITH filtered_sessions AS (
      SELECT s.*,COALESCE(s.submitted_at,s.abandoned_at) AS completed_at
        FROM topik_app.sessions s WHERE ${sessionFilters.join(" AND ")}
    ), response_rows AS (
      SELECT fs.session_id,fs.user_id,fs.mock_test_id,mt.slug AS mock_test_slug,
             mt.title_ko AS mock_test_title_ko,mt.title_en AS mock_test_title_en,
             fs.mode,fs.status,fs.started_at,fs.completed_at,fs.timed_out_submission,
             fs.score AS session_score,fs.max_score,
             CASE WHEN fs.score IS NOT NULL AND fs.max_score>0 THEN ROUND(fs.score*100.0/fs.max_score,2) END AS score_pct,
             af.rating,af.locale AS feedback_locale,si.section,si.set_id,si.set_version,si.item_order,
             si.test_position,si.item_id,si.item_version,iv.item_type,
             COALESCE(ro.selected_option,a.selected_option) AS selected_option,iv.correct_answer,
             CASE WHEN COALESCE(ro.selected_option,a.selected_option) IS NULL THEN 'unanswered'
                  WHEN COALESCE(ro.selected_option,a.selected_option)=iv.correct_answer THEN 'correct'
                  ELSE 'incorrect' END AS response_outcome,
             CASE WHEN COALESCE(ro.selected_option,a.selected_option) IS NULL THEN NULL
                  ELSE COALESCE(ro.selected_option,a.selected_option)=iv.correct_answer END AS is_correct,
             CASE WHEN ro.observation_id IS NOT NULL THEN ro.response_time_ms ELSE COALESCE((
               SELECT SUM(e.active_duration_delta_ms)::int FROM topik_app.response_events e
                WHERE e.session_id=fs.session_id AND e.item_order=si.item_order
             ),0) END AS response_time_ms,
             CASE WHEN fs.status='submitted' THEN ro.skipped END AS skipped,
             CASE WHEN fs.status='submitted' THEN ro.timed_out END AS timed_out,
             COALESCE(ro.answer_changed,a.selection_count>1,FALSE) AS answer_changed,
             COALESCE(a.selection_count,0) AS selection_count,a.first_selected_at,a.final_selected_at,
             si.policy_version
        FROM filtered_sessions fs
        JOIN topik_app.mock_tests mt ON mt.mock_test_id=fs.mock_test_id
        JOIN topik_app.session_items si ON si.session_id=fs.session_id
        JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
        LEFT JOIN topik_app.response_observations ro ON ro.session_id=si.session_id AND ro.item_order=si.item_order
        LEFT JOIN topik_app.answer_states a ON a.session_id=si.session_id AND a.item_order=si.item_order
        LEFT JOIN topik_app.attempt_feedback af ON af.session_id=fs.session_id
    )
    SELECT * FROM response_rows
     ${rowFilters.length ? `WHERE ${rowFilters.join(" AND ")}` : ""}
     ${ordered ? "ORDER BY completed_at,session_id,item_order" : ""}`;
  return { text, values };
}

function sessionQuery(filters: AdminExportFilters, ordered: boolean): SqlQuery {
  const values: unknown[] = [];
  const sessionFilters = buildSessionFilters(filters, values);
  const having: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.rating === "none") sessionFilters.push("af.rating IS NULL");
  else if (filters.rating !== "all") sessionFilters.push(`af.rating=${parameter(Number(filters.rating))}`);
  if (filters.resultEmail === "accepted") sessionFilters.push("email_state.result_email IS NOT NULL");
  if (filters.resultEmail === "not_accepted") sessionFilters.push("email_state.result_email IS NULL");
  if (filters.section) having.push(`BOOL_OR(si.section=${parameter(filters.section)})`);
  const text = `
    SELECT s.session_id,s.user_id,s.mock_test_id,mt.slug AS mock_test_slug,
           mt.title_ko AS mock_test_title_ko,mt.title_en AS mock_test_title_en,s.mode,s.status,
           s.started_at,s.submitted_at,s.abandoned_at,COALESCE(s.submitted_at,s.abandoned_at) AS completed_at,
           FLOOR(EXTRACT(EPOCH FROM (COALESCE(s.submitted_at,s.abandoned_at)-s.started_at)))::int AS duration_seconds,
           s.timed_out_submission,s.score,s.max_score,
           CASE WHEN s.score IS NOT NULL AND s.max_score>0 THEN ROUND(s.score*100.0/s.max_score,2) END AS score_pct,
           COUNT(si.item_order)::int AS total_items,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option) IS NOT NULL)::int AS answered_count,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option) IS NULL)::int AS unanswered_count,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option)=iv.correct_answer)::int AS correct_count,
           COUNT(*) FILTER (WHERE COALESCE(ro.selected_option,a.selected_option) IS NOT NULL
             AND COALESCE(ro.selected_option,a.selected_option)<>iv.correct_answer)::int AS incorrect_count,
           af.rating,af.locale AS feedback_locale,email_state.result_email,
           (email_state.result_email IS NOT NULL) AS result_email_accepted
      FROM topik_app.sessions s
      JOIN topik_app.mock_tests mt ON mt.mock_test_id=s.mock_test_id
      JOIN topik_app.session_items si ON si.session_id=s.session_id
      JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
      LEFT JOIN topik_app.response_observations ro ON ro.session_id=si.session_id AND ro.item_order=si.item_order
      LEFT JOIN topik_app.answer_states a ON a.session_id=si.session_id AND a.item_order=si.item_order
      LEFT JOIN topik_app.attempt_feedback af ON af.session_id=s.session_id
      LEFT JOIN LATERAL (
        SELECT red.email_original AS result_email
          FROM topik_app.result_email_deliveries red
         WHERE red.session_id=s.session_id
           AND red.status='accepted'
           AND red.revoked_at IS NULL
         ORDER BY red.accepted_at DESC NULLS LAST,red.requested_at DESC
         LIMIT 1
      ) email_state ON TRUE
     WHERE ${sessionFilters.join(" AND ")}
     GROUP BY s.session_id,mt.slug,mt.title_ko,mt.title_en,af.rating,af.locale,email_state.result_email
     ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
     ${ordered ? "ORDER BY completed_at,session_id" : ""}`;
  return { text, values };
}

export function buildAdminExportQuery(dataset: AdminExportDataset, filters: AdminExportFilters, ordered = true): SqlQuery {
  if (dataset === "questions") return questionQuery(filters, ordered);
  if (dataset === "responses") return responseQuery(filters, ordered);
  return sessionQuery(filters, ordered);
}

