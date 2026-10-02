import type { PoolClient } from 'pg';
import { sanitizeQuestion } from '../exam/domain.js';
import { defaultDifficulty, type Candidate, type Difficulty } from './domain.js';

type QuestionRow = Parameters<typeof sanitizeQuestion>[0];
export type InventoryItem = Candidate & {
  setId: string; itemId: string; itemVersion: number; mockTestId: string;
  titleKo: string; titleEn: string; section: string; position: number;
  defaultDifficulty: Difficulty; overrideDifficulty: Difficulty | null;
  updatedBy: string | null; updatedAt: string | null;
  correctCount: number; ready: boolean;
  question: ReturnType<typeof sanitizeQuestion>; correctAnswer: number; explanation: string;
  audioAssetId: string | null; visualAssetIds: string[];
};

export async function inventory(client: Pick<PoolClient,'query'>, browserId?: string): Promise<InventoryItem[]> {
  const { rows } = await client.query<QuestionRow & {
    set_id: string; mock_test_id: string; title_ko: string; title_en: string; set_count: number;
    correct_answer: number; explanation: string; override_difficulty: Difficulty | null;
    updated_by: string | null; updated_at: string | null; visual_asset_ids: string[];
    answered_count: number; correct_count: number; personal_count: number;
  }>(`
    WITH published AS (
      SELECT DISTINCT ON (mts.set_id) mts.set_id,mts.section,mt.mock_test_id,mt.title_ko,mt.title_en
      FROM topik_app.mock_tests mt JOIN topik_app.mock_test_sections mts USING(mock_test_id)
      WHERE mt.is_published AND mts.section IN ('reading','listening')
      ORDER BY mts.set_id,mt.display_order,mt.mock_test_id
    ), global_responses AS (
      SELECT item_id,item_version,is_correct FROM topik_app.response_observations WHERE selected_option IS NOT NULL
      UNION ALL
      SELECT si.item_id,si.item_version,a.selected_option=iv.correct_answer
      FROM topik_app.sessions s JOIN topik_app.session_items si USING(session_id)
      JOIN topik_app.answer_states a USING(session_id,item_order)
      JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
      WHERE s.status='abandoned' AND NOT EXISTS (SELECT 1 FROM topik_app.response_observations ro WHERE ro.session_id=si.session_id AND ro.item_order=si.item_order)
      UNION ALL
      SELECT item_id,item_version,is_correct FROM topik_app.marathon_items WHERE submitted_at IS NOT NULL
    ), counts AS (
      SELECT item_id,item_version,COUNT(*)::int AS answered_count,COUNT(*) FILTER(WHERE is_correct)::int AS correct_count
      FROM global_responses GROUP BY item_id,item_version
    ), personal AS (
      SELECT item_id,COUNT(*)::int AS personal_count FROM (
        SELECT mi.item_id FROM topik_app.marathon_items mi JOIN topik_app.marathon_sessions ms USING(session_id) WHERE ms.browser_id=$1
        UNION ALL
        SELECT si.item_id FROM topik_app.session_items si JOIN topik_app.sessions s USING(session_id)
        WHERE s.browser_id=$1 AND (EXISTS (SELECT 1 FROM topik_app.response_events e WHERE e.session_id=si.session_id AND e.item_order=si.item_order)
          OR EXISTS (SELECT 1 FROM topik_app.answer_states a WHERE a.session_id=si.session_id AND a.item_order=si.item_order))
      ) exposures GROUP BY item_id
    )
    SELECT p.*,qsi.position AS test_position,qsi.position AS item_order,qsi.item_id,qsi.item_version,
      COUNT(*) OVER(PARTITION BY p.set_id)::int AS set_count,
      iv.item_type,iv.stem,iv.choices,iv.content_json,iv.correct_answer,iv.explanation,
      NULL::smallint AS selected_option,d.difficulty AS override_difficulty,d.updated_by,d.updated_at,
      COALESCE(c.answered_count,0) AS answered_count,COALESCE(c.correct_count,0) AS correct_count,
      COALESCE(personal.personal_count,0) AS personal_count,
      COALESCE(sa.audio_asset_id,la.audio_asset_id) AS audio_asset_id,1 AS audio_repeat_count,
      COALESCE(visuals.options,'[]'::jsonb) AS visual_assets,visuals.material AS material_visual,
      COALESCE(visuals.ids,'{}'::uuid[]) AS visual_asset_ids
    FROM published p JOIN topik_bank.question_set_items qsi USING(set_id)
    JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
    LEFT JOIN topik_app.marathon_difficulties d ON d.set_id=p.set_id AND d.item_id=qsi.item_id
    LEFT JOIN counts c ON c.item_id=iv.item_id AND c.item_version=iv.item_version
    LEFT JOIN personal ON personal.item_id=iv.item_id
    LEFT JOIN topik_app.question_set_item_audio_bindings sb ON sb.set_id=p.set_id AND sb.position=qsi.position AND sb.is_current
    LEFT JOIN topik_app.tts_audio_assets sa ON sa.audio_asset_id=sb.audio_asset_id AND sa.deleted_at IS NULL
    LEFT JOIN topik_app.item_audio_bindings lb ON lb.item_id=iv.item_id AND lb.item_version=iv.item_version AND lb.is_current AND sa.audio_asset_id IS NULL
    LEFT JOIN topik_app.tts_audio_assets la ON la.audio_asset_id=lb.audio_asset_id AND la.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('number',option_number,'imageUrl',storage_url) ORDER BY option_number) FILTER(WHERE visual_role='choice') AS options,
        (jsonb_agg(jsonb_build_object('imageUrl',storage_url,'description',COALESCE(iv.content_json->'visual_material'->>'description',''))) FILTER(WHERE visual_role='material'))->0 AS material,
        array_agg(visual_asset_id) AS ids
      FROM topik_app.item_visual_assets WHERE item_id=iv.item_id AND item_version=iv.item_version AND is_current AND storage_url<>''
    ) visuals ON TRUE
    ORDER BY p.title_ko,qsi.position`, [browserId ?? null]);
  return rows.map((row) => {
    // Paired questions can keep their shared material on the leading member only.
    const group = row.item_type.startsWith('paired_') ? rows.filter((other) => other.set_id===row.set_id && other.item_type===row.item_type) : [row];
    const content = { ...row.content_json };
    for (const key of ['passage','dialogue_turns','auxiliary_text']) {
      if (!content[key] || (Array.isArray(content[key]) && !content[key].length)) {
        content[key] = group.find((other) => {
          const value = other.content_json[key];
          return Array.isArray(value) ? value.length>0 : Boolean(value);
        })?.content_json[key];
      }
    }
    const question = sanitizeQuestion({ ...row, content_json: content }, { includeTranscript: true });
    const base = defaultDifficulty(row.test_position,row.set_count);
    const visualsRequired = row.item_type.startsWith('visual_') || (Array.isArray(content.visual_options) && content.visual_options.length>0);
    const materialRequired = row.section==='reading' && (row.test_position===10 || Boolean(content.visual_material));
    const ready = row.correct_answer>=1 && row.correct_answer<=4
      && (visualsRequired ? question.visualOptions.length===4 : question.choices.length===4 && question.choices.every((choice) => choice.trim()))
      && (!materialRequired || Boolean(question.materialVisual))
      && (row.section!=='listening' || Boolean(question.audioAssetId));
    return {
      setId: row.set_id, itemId: row.item_id, itemVersion: row.item_version, mockTestId: row.mock_test_id,
      titleKo: row.title_ko,titleEn: row.title_en,section: row.section,position: row.test_position,
      defaultDifficulty: base,overrideDifficulty: row.override_difficulty,difficulty: row.override_difficulty ?? base,
      updatedBy: row.updated_by,updatedAt: row.updated_at,answeredCount: row.answered_count,correctCount: row.correct_count,
      personalCount: row.personal_count,ready: Boolean(ready),question,correctAnswer: row.correct_answer,explanation: row.explanation ?? '',
      audioAssetId: row.audio_asset_id ?? null,visualAssetIds: row.visual_asset_ids,
    };
  });
}
