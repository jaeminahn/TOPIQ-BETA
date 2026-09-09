import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { AppError, notFound } from "../errors.js";
import type { DialogueTurn, TtsStyle } from "../google-tts.js";
import { buildNarrationScript, EXAM_TRACK_VERSION } from "../listening-narration.js";
import { AdminOverviewRepository } from "./overview-repository.js";

export class AdminListeningRepository extends AdminOverviewRepository {
  async listListeningItems(setId?: string, status?: "ready" | "missing" | "failed") {
    const values: unknown[] = [];
    const filters = ["iv.section = 'listening'"];
    if (setId) { values.push(setId); filters.push(`qsi.set_id = $${values.length}`); }
    const result = await pool.query(
      `WITH item_rows AS (
         SELECT qsi.set_id, qsi.set_version, qsi.position,
                iv.item_id, iv.item_version, iv.item_type,
                CASE WHEN LEFT(iv.item_type,7)='paired_' THEN iv.item_type
                     ELSE 'position:' || qsi.position::text END AS audio_group_key,
                iv.stem, iv.choices, iv.correct_answer, iv.explanation, iv.content_json,
                iv.content_json->'dialogue_turns' AS dialogue_turns,
                COALESCE(iv.content_json->>'question_prompt','') AS question_prompt,
                COALESCE((iv.content_json->>'repeat_count')::int,1) AS repeat_count,
                CASE WHEN jsonb_typeof(iv.content_json->'visual_options')='array'
                     THEN jsonb_array_length(iv.content_json->'visual_options') ELSE 0 END AS visual_option_count,
                (SELECT COUNT(*) FROM topik_app.item_visual_assets iva
                  WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version
                    AND iva.visual_role='choice' AND iva.is_current)::int AS visual_ready_count,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'optionNumber', visual.ordinality,
                    'description', COALESCE(visual.value->>'description',''),
                    'imagePrompt', COALESCE(visual.value->>'image_prompt',''),
                    'chartSpec', visual.value->'chart_spec',
                    'visualAssetId', asset.visual_asset_id,
                    'imageUrl', asset.storage_url,
                    'generationStatus', recent_visual.status,
                    'generationError', CASE WHEN recent_visual.status='failed' THEN recent_visual.error_message END
                  ) ORDER BY visual.ordinality)
                  FROM jsonb_array_elements(CASE
                    WHEN jsonb_typeof(iv.content_json->'visual_options')='array'
                    THEN iv.content_json->'visual_options' ELSE '[]'::jsonb END)
                       WITH ORDINALITY AS visual(value, ordinality)
                  LEFT JOIN LATERAL (
                    SELECT iva.visual_asset_id,iva.storage_url
                      FROM topik_app.item_visual_assets iva
                     WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version
                       AND iva.visual_role='choice' AND iva.option_number=visual.ordinality AND iva.is_current
                     LIMIT 1
                  ) asset ON TRUE
                  LEFT JOIN LATERAL (
                    SELECT vgj.status,vgj.error_message
                     FROM topik_app.visual_generation_jobs vgj
                     WHERE vgj.item_id=iv.item_id AND vgj.item_version=iv.item_version
                       AND vgj.visual_role='choice' AND vgj.option_number=visual.ordinality
                     ORDER BY vgj.created_at DESC LIMIT 1
                  ) recent_visual ON TRUE
                ),'[]'::jsonb) AS visual_options,
                COALESCE(set_asset.audio_asset_id,legacy_asset.audio_asset_id) AS audio_asset_id,
                COALESCE(set_asset.storage_url,legacy_asset.storage_url) AS storage_url,
                COALESCE(set_asset.tts_style,legacy_asset.tts_style) AS tts_style,
                COALESCE(set_asset.narration_version,legacy_asset.narration_version,'dialogue_v1') AS narration_version,
                set_asset.script_snapshot,
                (set_asset.narration_version='exam_track_v4') AS is_exam_track
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
           LEFT JOIN topik_app.question_set_item_audio_bindings set_binding
             ON set_binding.set_id=qsi.set_id AND set_binding.set_version=qsi.set_version
            AND set_binding.position=qsi.position AND set_binding.is_current
           LEFT JOIN topik_app.tts_audio_assets set_asset
             ON set_asset.audio_asset_id=set_binding.audio_asset_id AND set_asset.deleted_at IS NULL
           LEFT JOIN topik_app.item_audio_bindings legacy_binding
             ON legacy_binding.item_id=iv.item_id AND legacy_binding.item_version=iv.item_version
            AND legacy_binding.is_current AND set_asset.audio_asset_id IS NULL
           LEFT JOIN topik_app.tts_audio_assets legacy_asset
             ON legacy_asset.audio_asset_id=legacy_binding.audio_asset_id AND legacy_asset.deleted_at IS NULL
          WHERE ${filters.join(" AND ")}
       ), grouped AS (
         SELECT set_id, set_version, audio_group_key,
                jsonb_agg(dialogue_turns ORDER BY position)->0 AS dialogue_turns,
                array_agg(position ORDER BY position) AS positions,
                array_agg(item_id ORDER BY position) AS item_ids,
                array_agg(item_version ORDER BY position) AS item_versions,
                array_agg(item_type ORDER BY position) AS item_types,
                array_agg(question_prompt ORDER BY position) AS question_prompts,
                MAX(repeat_count)::int AS repeat_count,
                jsonb_agg(jsonb_build_object(
                  'itemId',item_id,'itemVersion',item_version,'position',position,
                  'itemType',item_type,'questionPrompt',question_prompt,
                  'stem',stem,'choices',choices,'correctAnswer',correct_answer,
                  'explanation',explanation,'contentJson',content_json,
                  'visualOptionCount',visual_option_count,'visualReadyCount',visual_ready_count,
                  'visualOptions',visual_options
                ) ORDER BY position) AS targets,
                COUNT(*)::int AS target_count,
                COUNT(audio_asset_id)::int AS bound_count,
                COUNT(*) FILTER (WHERE is_exam_track)::int AS exam_track_count,
                COUNT(DISTINCT audio_asset_id)::int AS distinct_audio_count,
                (array_agg(audio_asset_id ORDER BY position) FILTER (WHERE audio_asset_id IS NOT NULL))[1] AS audio_asset_id,
                (array_agg(storage_url ORDER BY position) FILTER (WHERE storage_url IS NOT NULL))[1] AS storage_url,
                (array_agg(tts_style ORDER BY position) FILTER (WHERE tts_style IS NOT NULL))[1] AS tts_style,
                (array_agg(narration_version ORDER BY position) FILTER (WHERE audio_asset_id IS NOT NULL))[1] AS narration_version,
                (array_agg(script_snapshot ORDER BY position) FILTER (WHERE script_snapshot IS NOT NULL))[1] AS script_snapshot
           FROM item_rows
          GROUP BY set_id,set_version,audio_group_key
       )
       SELECT g.set_id AS "setId", g.set_version AS "setVersion", g.positions,
              g.item_ids[1] AS "leaderItemId", g.item_versions[1] AS "leaderItemVersion",
              g.item_types[1] AS "itemType", g.dialogue_turns AS "dialogueTurns",
              g.question_prompts AS "questionPrompts", g.repeat_count AS "repeatCount",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.audio_asset_id END AS "audioAssetId",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.storage_url END AS "audioStorageUrl",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.tts_style END AS "ttsStyle",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.narration_version END AS "narrationVersion",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.script_snapshot END AS "appliedScript",
               CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 AND g.exam_track_count=g.target_count THEN 'ready'
                    WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN 'legacy'
                    WHEN g.bound_count=0 THEN 'missing' ELSE 'partial' END AS "audioStatus",
               g.targets,
               recent.job_id AS "generationJobId",
               recent.status AS "generationStatus",
               recent.tts_style AS "generationTtsStyle",
               recent.script_snapshot AS "generationScript",
               CASE WHEN recent.status='failed' THEN recent.error_message END AS "lastError"
          FROM grouped g
          LEFT JOIN LATERAL (
            SELECT j.job_id,j.status,j.error_message,j.tts_style,j.script_snapshot
              FROM topik_app.tts_generation_jobs j
            WHERE (j.set_id=g.set_id AND j.set_version=g.set_version AND j.group_start_position=g.positions[1])
               OR (j.set_id IS NULL AND EXISTS (
                 SELECT 1 FROM topik_app.tts_generation_job_targets tgt
                  WHERE tgt.job_id=j.job_id AND tgt.item_id=ANY(g.item_ids)
               ))
            ORDER BY j.created_at DESC LIMIT 1
         ) recent ON TRUE
        WHERE ($${values.length + 1}::text IS NULL)
           OR ($${values.length + 1}='ready' AND g.bound_count=g.target_count AND g.distinct_audio_count=1 AND g.exam_track_count=g.target_count)
           OR ($${values.length + 1}='missing' AND (g.bound_count<g.target_count OR g.exam_track_count<g.target_count))
           OR ($${values.length + 1}='failed' AND recent.status='failed')
        ORDER BY g.set_id,g.positions[1]`,
      [...values, status ?? null],
    );
    return result.rows;
  }

  async listListeningSets() {
    const result = await pool.query<{
      setId: string; setVersion: number; setSequence: number; createdAt: Date;
      reviewStatus: string; publishedAt: Date | null; itemCount: number; validItemCount: number;
      audioReady: number; visualRequired: number; visualReady: number;
      mockTestId: string | null; slug: string | null; titleKo: string | null; mockTestPublished: boolean | null;
    }>(
      `SELECT qs.set_id AS "setId",qsv.set_version AS "setVersion",
              qs.set_sequence AS "setSequence",qs.created_at AS "createdAt",
              qsv.review_status AS "reviewStatus",qsv.published_at AS "publishedAt",
              COUNT(qsi.item_id)::int AS "itemCount",
              COUNT(qsi.item_id) FILTER (WHERE
                iv.section='listening' AND iv.correct_answer BETWEEN 1 AND 4
                AND CASE
                  WHEN jsonb_typeof(iv.choices)='array' AND jsonb_array_length(iv.choices)=4 THEN TRUE
                  WHEN jsonb_typeof(iv.content_json->'visual_options')='array'
                    AND jsonb_array_length(iv.content_json->'visual_options')=4 THEN TRUE
                  ELSE FALSE END
                AND jsonb_typeof(iv.content_json->'dialogue_turns')='array'
                AND jsonb_array_length(iv.content_json->'dialogue_turns')>0
              )::int AS "validItemCount",
              COUNT(set_binding.audio_asset_id) FILTER (WHERE audio.narration_version='exam_track_v4')::int AS "audioReady",
              COALESCE(SUM(CASE WHEN jsonb_typeof(iv.content_json->'visual_options')='array'
                THEN jsonb_array_length(iv.content_json->'visual_options') ELSE 0 END),0)::int AS "visualRequired",
              COALESCE(SUM((SELECT COUNT(*) FROM topik_app.item_visual_assets iva
                WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version
                  AND iva.visual_role='choice' AND iva.is_current)),0)::int AS "visualReady",
              linked.mock_test_id AS "mockTestId",linked.slug,linked.title_ko AS "titleKo",
              linked.is_published AS "mockTestPublished"
         FROM topik_bank.question_sets qs
         JOIN topik_bank.question_set_versions qsv ON qsv.set_id=qs.set_id
         LEFT JOIN topik_bank.question_set_items qsi
           ON qsi.set_id=qsv.set_id AND qsi.set_version=qsv.set_version
         LEFT JOIN topik_bank.item_versions iv
           ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
         LEFT JOIN topik_app.question_set_item_audio_bindings set_binding
           ON set_binding.set_id=qsi.set_id AND set_binding.set_version=qsi.set_version
          AND set_binding.position=qsi.position AND set_binding.is_current
         LEFT JOIN topik_app.tts_audio_assets audio
           ON audio.audio_asset_id=set_binding.audio_asset_id AND audio.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT mt.mock_test_id,mt.slug,mt.title_ko,mt.is_published
             FROM topik_app.mock_test_sections mts
             JOIN topik_app.mock_tests mt ON mt.mock_test_id=mts.mock_test_id
            WHERE mts.set_id=qsv.set_id AND mts.set_version=qsv.set_version AND mts.section='listening'
            ORDER BY mt.is_published DESC,mt.display_order LIMIT 1
         ) linked ON TRUE
        WHERE qs.section='listening'
        GROUP BY qs.set_id,qsv.set_version,qs.set_sequence,qs.created_at,
                 qsv.review_status,qsv.published_at,linked.mock_test_id,linked.slug,
                 linked.title_ko,linked.is_published`,
    );
    const latestBySet = new Map<string, number>();
    for (const row of result.rows) latestBySet.set(row.setId, Math.max(latestBySet.get(row.setId) ?? 0, row.setVersion));
    return result.rows.filter((row) => Boolean(row.mockTestId) || row.setVersion === latestBySet.get(row.setId)).map((row) => {
      const roundMatch = row.slug?.match(/^topik-ii-listening-(\d+)$/);
      const blockingReasons: string[] = [];
      if (row.reviewStatus !== "reviewed") blockingReasons.push("SET_NOT_REVIEWED");
      if (!row.publishedAt) blockingReasons.push("SET_NOT_PUBLISHED");
      if (row.itemCount !== 50) blockingReasons.push("ITEM_COUNT_INVALID");
      if (row.validItemCount !== 50) blockingReasons.push("ITEMS_INVALID");
      return {
        ...row,
        round: roundMatch ? Number(roundMatch[1]) : null,
        readyToRegister: !row.mockTestId && blockingReasons.length === 0,
        readyToPublish: Boolean(row.mockTestId) && row.audioReady === 50 && row.visualReady >= row.visualRequired,
        blockingReasons,
      };
    }).sort((left, right) => {
      if (left.round !== null && right.round !== null) return left.round - right.round;
      if (left.round !== null) return -1;
      if (right.round !== null) return 1;
      return left.createdAt.getTime() - right.createdAt.getTime() || left.setId.localeCompare(right.setId);
    });
  }

  async registerListeningSet(setId: string, setVersion: number) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('topik_listening_register'))");
      const existing = await client.query<{ mock_test_id: string; slug: string; is_published: boolean }>(
        `SELECT mt.mock_test_id,mt.slug,mt.is_published
           FROM topik_app.mock_test_sections mts
           JOIN topik_app.mock_tests mt ON mt.mock_test_id=mts.mock_test_id
          WHERE mts.set_id=$1 AND mts.set_version=$2 AND mts.section='listening'
          ORDER BY mt.display_order LIMIT 1`,
        [setId, setVersion],
      );
      if (existing.rows[0]) {
        const linked = existing.rows[0];
        await client.query("COMMIT");
        return { mockTestId: linked.mock_test_id, slug: linked.slug, round: Number(linked.slug.match(/(\d+)$/)?.[1] ?? 0) || null, published: linked.is_published, created: false };
      }
      const readiness = await client.query<{
        section: string; review_status: string; published_at: Date | null; item_count: number; valid_item_count: number;
      }>(
        `SELECT qs.section,qsv.review_status,qsv.published_at,COUNT(qsi.item_id)::int item_count,
                COUNT(qsi.item_id) FILTER (WHERE
                  iv.section='listening' AND iv.correct_answer BETWEEN 1 AND 4
                  AND CASE
                    WHEN jsonb_typeof(iv.choices)='array' AND jsonb_array_length(iv.choices)=4 THEN TRUE
                    WHEN jsonb_typeof(iv.content_json->'visual_options')='array'
                      AND jsonb_array_length(iv.content_json->'visual_options')=4 THEN TRUE
                    ELSE FALSE END
                  AND jsonb_typeof(iv.content_json->'dialogue_turns')='array'
                  AND jsonb_array_length(iv.content_json->'dialogue_turns')>0
                )::int valid_item_count
           FROM topik_bank.question_sets qs
           JOIN topik_bank.question_set_versions qsv ON qsv.set_id=qs.set_id
           LEFT JOIN topik_bank.question_set_items qsi ON qsi.set_id=qsv.set_id AND qsi.set_version=qsv.set_version
           LEFT JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qs.set_id=$1 AND qsv.set_version=$2
          GROUP BY qs.section,qsv.review_status,qsv.published_at`,
        [setId, setVersion],
      );
      const ready = readiness.rows[0];
      if (!ready || ready.section !== "listening" || ready.review_status !== "reviewed" || !ready.published_at
        || ready.item_count !== 50 || ready.valid_item_count !== 50) {
        throw new AppError(409, "LISTENING_SET_NOT_READY", "A reviewed and published listening set with 50 valid items is required");
      }
      const sequence = await client.query<{ round: number; display_order: number }>(
        `SELECT COALESCE(MAX(substring(slug FROM '^topik-ii-listening-([0-9]+)$')::int),0)::int+1 round,
                COALESCE(MAX(display_order),0)::int+1 display_order FROM topik_app.mock_tests`,
      );
      const round = sequence.rows[0]?.round ?? 1; const displayOrder = sequence.rows[0]?.display_order ?? 1;
      const mockTestId = randomUUID(); const slug = `topik-ii-listening-${round}`;
      await client.query(
        `INSERT INTO topik_app.mock_tests(mock_test_id,slug,title_en,title_ko,description_en,description_ko,
          duration_seconds,question_count,max_score,display_order,is_published)
         VALUES ($1,$2,$3,$4,$5,$6,3600,50,100,$7,FALSE)`,
        [mockTestId,slug,`TOPIK II Listening Mock Test ${round}`,`TOPIK II 듣기 모의고사 ${round}회`,
          "50 TOPIK II-style listening questions.","TOPIK II 형식의 듣기 50문항입니다.",displayOrder],
      );
      await client.query(
        `INSERT INTO topik_app.mock_test_sections(mock_test_id,section_order,section,set_id,set_version)
         VALUES ($1,1,'listening',$2,$3)`, [mockTestId,setId,setVersion],
      );
      await client.query("COMMIT");
      return { mockTestId,slug,round,published:false,created:true };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async audioPath(audioAssetId: string) {
    const result = await pool.query<{ storage_path: string }>(
      "SELECT storage_path FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1",
      [audioAssetId],
    );
    if (!result.rows[0]) throw notFound("Audio asset not found");
    return result.rows[0].storage_path;
  }

  private async resolveAudioGroup(client: PoolClient, setId: string, setVersion: number, leaderItemId: string) {
    const result = await client.query<{
      item_id: string; item_version: number; position: number;
      question_prompt: string; dialogue_turns: unknown;
    }>(
      `WITH leader AS (
         SELECT qsi.position,iv.item_type
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND qsi.item_id=$3 AND iv.section='listening'
       )
       SELECT qsi.item_id,qsi.item_version,qsi.position,
              COALESCE(iv.content_json->>'question_prompt','') AS question_prompt,
              iv.content_json->'dialogue_turns' AS dialogue_turns
         FROM topik_bank.question_set_items qsi
         JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
         JOIN leader l ON (
           (LEFT(l.item_type,7)='paired_' AND iv.item_type=l.item_type)
           OR (LEFT(l.item_type,7)<>'paired_' AND qsi.position=l.position)
         )
        WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND iv.section='listening'
        ORDER BY qsi.position`,
      [setId, setVersion, leaderItemId],
    );
    if (!result.rowCount) throw notFound("Listening audio group not found");
    return result.rows;
  }

  private async createGroupJob(client: PoolClient, input: {
    adminUserId: string; setId: string; setVersion: number; leaderItemId: string;
    forceRegenerate: boolean; ttsStyle: TtsStyle;
  }) {
    const targets = await this.resolveAudioGroup(client, input.setId, input.setVersion, input.leaderItemId);
    const itemIds = targets.map((target) => target.item_id);
    const itemVersions = targets.map((target) => target.item_version);
    const positions = targets.map((target) => target.position);
    const script = buildNarrationScript(targets.map((target) => ({
      position: target.position,
      questionPrompt: target.question_prompt,
      dialogueTurns: target.dialogue_turns as DialogueTurn[],
    })));
    const leader = targets[0]!;
    const active = await client.query<{ job_id: string }>(
      `SELECT job_id FROM topik_app.tts_generation_jobs
        WHERE set_id=$1 AND set_version=$2 AND group_start_position=$3
          AND status IN ('queued','processing') LIMIT 1`,
      [input.setId, input.setVersion, leader.position],
    );
    if (active.rows[0]) return { jobId: active.rows[0].job_id, queued: false, targetCount: targets.length };
    if (!input.forceRegenerate) {
      const ready = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int count
           FROM topik_app.question_set_item_audio_bindings binding
           JOIN topik_app.tts_audio_assets asset ON asset.audio_asset_id=binding.audio_asset_id
          WHERE binding.set_id=$1 AND binding.set_version=$2 AND binding.position=ANY($3::smallint[])
            AND binding.is_current AND asset.narration_version=$4 AND asset.deleted_at IS NULL`,
        [input.setId, input.setVersion, positions, EXAM_TRACK_VERSION],
      );
      if (ready.rows[0]?.count === targets.length) return { jobId: null, queued: false, targetCount: targets.length };
    }
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO topik_app.tts_generation_jobs(
         job_id,item_id,item_version,requested_by,force_regenerate,tts_style,
         set_id,set_version,group_start_position,script_snapshot
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [jobId, leader.item_id, leader.item_version, input.adminUserId, input.forceRegenerate, input.ttsStyle,
        input.setId, input.setVersion, leader.position, script],
    );
    await client.query(
      `INSERT INTO topik_app.tts_generation_job_targets(
         job_id,item_id,item_version,set_id,set_version,position
       ) SELECT $1,target.item_id,target.item_version,$4,$5,target.position
         FROM unnest($2::uuid[],$3::integer[],$6::smallint[]) AS target(item_id,item_version,position)`,
      [jobId, itemIds, itemVersions, input.setId, input.setVersion, positions],
    );
    return { jobId, queued: true, targetCount: targets.length };
  }

  async enqueueGroup(adminUserId: string, setId: string, setVersion: number, leaderItemId: string, forceRegenerate: boolean, ttsStyle: TtsStyle) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.createGroupJob(client, { adminUserId, setId, setVersion, leaderItemId, forceRegenerate, ttsStyle });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async enqueueSet(adminUserId: string, setId: string, setVersion: number, forceRegenerate: boolean, ttsStyle: TtsStyle) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const leaders = await client.query<{ item_id: string }>(
        `SELECT DISTINCT ON (
             CASE WHEN LEFT(iv.item_type,7)='paired_' THEN iv.item_type
                  ELSE 'position:' || qsi.position::text END
           ) qsi.item_id
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND iv.section='listening'
          ORDER BY CASE WHEN LEFT(iv.item_type,7)='paired_' THEN iv.item_type
                        ELSE 'position:' || qsi.position::text END,
                   qsi.position`,
        [setId, setVersion],
      );
      if (!leaders.rowCount) throw notFound("Listening set not found");
      const jobIds: string[] = [];
      for (const leader of leaders.rows) {
        const result = await this.createGroupJob(client, {
          adminUserId, setId, setVersion, leaderItemId: leader.item_id, forceRegenerate, ttsStyle,
        });
        if (result.queued && result.jobId) jobIds.push(result.jobId);
      }
      await client.query("COMMIT");
      return { queued: jobIds.length, jobIds };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async deleteAudioGroup(
    setId: string,
    setVersion: number,
    leaderItemId: string,
    audioAssetId: string,
    removeObject: (bucket: string, path: string) => Promise<void>,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const targets = await this.resolveAudioGroup(client, setId, setVersion, leaderItemId);
      const itemIds = targets.map((target) => target.item_id);
      const itemVersions = targets.map((target) => target.item_version);
      const positions = targets.map((target) => target.position);
      const asset = await client.query<{ storage_bucket: string; storage_path: string }>(
        `SELECT storage_bucket,storage_path FROM topik_app.tts_audio_assets
          WHERE audio_asset_id=$1 FOR UPDATE`,
        [audioAssetId],
      );
      const row = asset.rows[0];
      const bound = await client.query<{ set_count: number; legacy_count: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM topik_app.question_set_item_audio_bindings
             WHERE audio_asset_id=$1 AND set_id=$2 AND set_version=$3
               AND position=ANY($4::smallint[]) AND is_current) AS set_count,
           (SELECT COUNT(*)::int FROM topik_app.item_audio_bindings
             WHERE audio_asset_id=$1 AND is_current AND (item_id,item_version) IN (
               SELECT * FROM unnest($5::uuid[],$6::integer[])
             )) AS legacy_count`,
        [audioAssetId, setId, setVersion, positions, itemIds, itemVersions],
      );
      const bindingKind = bound.rows[0]?.set_count === targets.length
        ? "set"
        : bound.rows[0]?.legacy_count === targets.length ? "legacy" : null;
      if (!row || !bindingKind) throw notFound("Current group audio asset not found");
      if (bindingKind === "set") {
        await client.query(
          `DELETE FROM topik_app.question_set_item_audio_bindings
            WHERE audio_asset_id=$1 AND set_id=$2 AND set_version=$3
              AND position=ANY($4::smallint[]) AND is_current`,
          [audioAssetId, setId, setVersion, positions],
        );
      } else {
        await client.query(
          `DELETE FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1 AND is_current
            AND (item_id,item_version) IN (SELECT * FROM unnest($2::uuid[],$3::integer[]))`,
          [audioAssetId, itemIds, itemVersions],
        );
      }
      const shared = await client.query(
        `SELECT 1 FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1 AND is_current
         UNION ALL
         SELECT 1 FROM topik_app.question_set_item_audio_bindings WHERE audio_asset_id=$1 AND is_current
         LIMIT 1`,
        [audioAssetId],
      );
      let storageDeleted = false;
      if (!shared.rowCount) {
        await removeObject(row.storage_bucket, row.storage_path);
        await client.query("UPDATE topik_app.tts_generation_jobs SET audio_asset_id=NULL WHERE audio_asset_id=$1", [audioAssetId]);
        await client.query("DELETE FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1", [audioAssetId]);
        await client.query("DELETE FROM topik_app.question_set_item_audio_bindings WHERE audio_asset_id=$1", [audioAssetId]);
        const playbackHistory = await client.query("SELECT 1 FROM topik_app.audio_playback_events WHERE audio_asset_id=$1 LIMIT 1", [audioAssetId]);
        if (playbackHistory.rowCount) {
          await client.query("UPDATE topik_app.tts_audio_assets SET deleted_at=CURRENT_TIMESTAMP,storage_url='' WHERE audio_asset_id=$1", [audioAssetId]);
        } else {
          await client.query("DELETE FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1", [audioAssetId]);
        }
        storageDeleted = true;
      }
      await client.query("COMMIT");
      return { deleted: true, deletedBindings: targets.length, storageDeleted, sharedAssetRetained: !storageDeleted };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }
}
