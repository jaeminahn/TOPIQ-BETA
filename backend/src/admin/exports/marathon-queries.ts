import type { AdminExportDataset, AdminExportFilters, SqlQuery } from './types.js';

export function marathonExportQuery(dataset: AdminExportDataset, filters: AdminExportFilters): SqlQuery {
  const values: unknown[]=[];
  const param=(value:unknown) => {values.push(value);return `$${values.length}`;};
  const clauses:string[]=[];
  if (filters.section) clauses.push(`s.section=${param(filters.section)}`);
  if (filters.mockTestId) clauses.push(dataset==='sessions'
    ? `EXISTS (SELECT 1 FROM topik_app.marathon_items origin WHERE origin.session_id=s.session_id AND origin.mock_test_id=${param(filters.mockTestId)})`
    : `mi.mock_test_id=${param(filters.mockTestId)}`);
  if (filters.mode || (filters.rating!=='all' && filters.rating!=='none') || filters.resultEmail==='accepted') clauses.push('FALSE');
  if (filters.status==='abandoned') clauses.push("s.status='abandoned'");
  // A marathon has no final submission: "submitted" means finalized individual answers.
  if (filters.status==='submitted') clauses.push(dataset==='sessions'
    ? 'EXISTS (SELECT 1 FROM topik_app.marathon_items answered WHERE answered.session_id=s.session_id AND answered.submitted_at IS NOT NULL)'
    : 'mi.submitted_at IS NOT NULL');
  if (filters.status==='in_progress') clauses.push("s.status='in_progress'");
  const date=dataset==='sessions'?'s.started_at':'COALESCE(mi.submitted_at,mi.presented_at)';
  if (filters.from) clauses.push(`${date}>=(${param(filters.from)}::date AT TIME ZONE 'Asia/Seoul')`);
  if (filters.to) clauses.push(`${date}<((${param(filters.to)}::date+INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul')`);
  if (filters.itemType) clauses.push(`iv.item_type=${param(filters.itemType)}`);
  if (filters.outcome==='answered') clauses.push('mi.submitted_at IS NOT NULL');
  if (filters.outcome==='unanswered') clauses.push('mi.submitted_at IS NULL');
  if (filters.outcome==='correct') clauses.push('mi.is_correct=TRUE');
  if (filters.outcome==='incorrect') clauses.push('mi.is_correct=FALSE');
  const join=dataset==='sessions'?'LEFT JOIN':'JOIN';
  const base=`FROM topik_app.marathon_sessions s ${join} topik_app.marathon_items mi USING(session_id)
    ${join} topik_bank.item_versions iv ON iv.item_id=mi.item_id AND iv.item_version=mi.item_version
    ${join} topik_app.mock_tests mt ON mt.mock_test_id=mi.mock_test_id
    WHERE ${clauses.length?clauses.join(' AND '):'TRUE'}`;
  const response=`SELECT 'marathon'::text AS source,s.session_id,s.browser_id AS user_id,s.status,s.started_at,
    mi.submitted_at AS completed_at,s.section,mi.set_id,mi.item_order,mi.test_position,mi.item_id,mi.item_version,iv.item_type,
    mt.mock_test_id,mt.slug AS mock_test_slug,mt.title_ko AS mock_test_title_ko,mt.title_en AS mock_test_title_en,
    mi.selected_option,mi.correct_answer,
    CASE WHEN mi.submitted_at IS NULL THEN 'unanswered' WHEN mi.is_correct THEN 'correct' ELSE 'incorrect' END AS response_outcome,
    mi.is_correct,mi.response_time_ms,mi.selection_count>1 AS answer_changed,mi.selection_count,
    mi.first_selected_at,mi.final_selected_at,mi.policy_version,mi.difficulty AS marathon_difficulty,
    mi.requested_difficulty,mi.recent_accuracy ${base}`;
  if (dataset==='responses') return {text:response,values};
  if (dataset==='sessions') return {text:`SELECT 'marathon'::text AS source,s.session_id,s.browser_id AS user_id,s.status,s.started_at,s.abandoned_at,
    s.abandoned_at AS completed_at,s.section,COUNT(mi.item_order)::int AS total_items,COUNT(mi.submitted_at)::int AS answered_count,
    COUNT(*) FILTER(WHERE mi.item_order IS NOT NULL AND mi.submitted_at IS NULL)::int AS unanswered_count,COUNT(*) FILTER(WHERE mi.is_correct)::int AS correct_count,
    COUNT(*) FILTER(WHERE mi.is_correct=FALSE)::int AS incorrect_count,
    ROUND(COUNT(*) FILTER(WHERE mi.is_correct)*100.0/NULLIF(COUNT(mi.submitted_at),0),2) AS score_pct,
    string_agg(DISTINCT mi.policy_version,',') AS policy_version ${base} GROUP BY s.session_id`,values};
  const minimum=param(filters.minAssignedCount);
  return {text:`WITH selected AS (SELECT mi.*,s.section,iv.item_type,iv.primary_skill,iv.target_level,iv.predicted_difficulty,iv.irt_difficulty,iv.irt_discrimination,
      mt.slug AS mock_test_slug,mt.title_ko AS mock_test_title_ko,mt.title_en AS mock_test_title_en ${base}),
    stats AS (SELECT mock_test_id,set_id,test_position,item_id,item_version,
      COUNT(*)::int AS assigned_count,COUNT(submitted_at)::int AS answered_count,
      COUNT(*) FILTER(WHERE submitted_at IS NULL)::int AS unanswered_count,
      COUNT(*) FILTER(WHERE is_correct)::int AS correct_count,COUNT(*) FILTER(WHERE is_correct=FALSE)::int AS incorrect_count,
      ROUND(COUNT(*) FILTER(WHERE is_correct)*100.0/NULLIF(COUNT(submitted_at),0),2) AS answered_accuracy_pct,
      ROUND(COUNT(*) FILTER(WHERE is_correct)*100.0/COUNT(*),2) AS overall_accuracy_pct,
      ${[1,2,3,4].map((n) => `COUNT(*) FILTER(WHERE selected_option=${n} AND submitted_at IS NOT NULL)::int AS option_${n}_count,
        ROUND(COUNT(*) FILTER(WHERE selected_option=${n} AND submitted_at IS NOT NULL)*100.0/NULLIF(COUNT(submitted_at),0),2) AS option_${n}_pct`).join(',')},
      AVG(response_time_ms) FILTER(WHERE submitted_at IS NOT NULL) AS avg_answered_response_time_ms,
      PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY response_time_ms) FILTER(WHERE submitted_at IS NOT NULL) AS median_answered_response_time_ms,
      COUNT(*) FILTER(WHERE selection_count>1 AND submitted_at IS NOT NULL)::int AS answer_changed_count,
      ROUND(COUNT(*) FILTER(WHERE selection_count>1 AND submitted_at IS NOT NULL)*100.0/NULLIF(COUNT(submitted_at),0),2) AS answer_changed_rate_pct,
      string_agg(DISTINCT difficulty::text,',' ORDER BY difficulty::text) AS marathon_difficulty,
      string_agg(DISTINCT policy_version,',') AS policy_version FROM selected GROUP BY mock_test_id,set_id,test_position,item_id,item_version),
    latest AS (SELECT DISTINCT ON (mock_test_id,set_id,test_position,item_id,item_version) * FROM selected
      ORDER BY mock_test_id,set_id,test_position,item_id,item_version,presented_at DESC)
    SELECT 'marathon'::text AS source,st.*,q.mock_test_slug,q.mock_test_title_ko,q.mock_test_title_en,q.section,q.item_type,
      q.primary_skill,q.target_level,q.predicted_difficulty,q.irt_difficulty,q.irt_discrimination,q.correct_answer,q.explanation,
      q.question_json->>'questionPrompt' AS question_prompt,q.question_json->>'stem' AS stem,q.question_json->>'passage' AS passage,
      q.question_json->>'auxiliaryText' AS auxiliary_text,q.question_json->>'highlightText' AS highlight_text,
      ${[1,2,3,4].map((n) => `COALESCE((SELECT option->>'imageUrl' FROM jsonb_array_elements(q.question_json->'visualOptions') option WHERE (option->>'number')::int=${n}),q.question_json->'choices'->>${n-1}) AS choice_${n}`).join(',')},
      q.question_json->'transcript' AS transcript_json,q.question_json->'visualOptions' AS visual_options_json,q.question_json AS content_json
    FROM stats st JOIN latest q USING(mock_test_id,set_id,test_position,item_id,item_version) WHERE st.assigned_count>=${minimum}`,values};
}
