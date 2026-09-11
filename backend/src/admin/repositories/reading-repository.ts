import { randomUUID } from "node:crypto";
import { pool } from "../../core/db.js";
import { AppError, notFound } from "../../core/errors.js";
import { normalizeReadingMaterial } from "../../media/reading-visual.js";
import { AdminListeningRepository } from "./listening-repository.js";

export class AdminReadingRepository extends AdminListeningRepository {
  async listReadingSets() {
    const result = await pool.query<{
      setId: string; setSequence: number; createdAt: Date;
      reviewStatus: string; publishedAt: Date | null; itemCount: number; validItemCount: number;
      visualRequired: number; visualReady: number;
      mockTestId: string | null; slug: string | null; titleKo: string | null; mockTestPublished: boolean | null;
    }>(
      `SELECT qs.set_id AS "setId",qs.set_sequence AS "setSequence", qs.created_at AS "createdAt",
              qs.review_status AS "reviewStatus", qs.published_at AS "publishedAt",
              COUNT(qsi.item_id)::int AS "itemCount",
              COUNT(qsi.item_id) FILTER (WHERE
                iv.section='reading'
                AND iv.correct_answer BETWEEN 1 AND 4
                AND CASE WHEN jsonb_typeof(iv.choices)='array' THEN jsonb_array_length(iv.choices) ELSE 0 END=4
              )::int AS "validItemCount",
              COUNT(qsi.item_id) FILTER (WHERE qsi.position=10)::int AS "visualRequired",
              COUNT(material_asset.visual_asset_id) FILTER (WHERE qsi.position=10)::int AS "visualReady",
              linked.mock_test_id AS "mockTestId", linked.slug,
              linked.title_ko AS "titleKo", linked.is_published AS "mockTestPublished"
         FROM topik_bank.question_sets qs
         LEFT JOIN topik_bank.question_set_items qsi
           ON qsi.set_id=qs.set_id
         LEFT JOIN topik_bank.item_versions iv
           ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
         LEFT JOIN topik_app.item_visual_assets material_asset
           ON material_asset.item_id=iv.item_id AND material_asset.item_version=iv.item_version
          AND material_asset.visual_role='material' AND material_asset.option_number=1
          AND material_asset.is_current
         LEFT JOIN LATERAL (
           SELECT mt.mock_test_id,mt.slug,mt.title_ko,mt.is_published
             FROM topik_app.mock_test_sections mts
             JOIN topik_app.mock_tests mt ON mt.mock_test_id=mts.mock_test_id
            WHERE mts.set_id=qs.set_id AND mts.section='reading'
            ORDER BY mt.is_published DESC,mt.display_order
            LIMIT 1
         ) linked ON TRUE
        WHERE qs.section='reading'
        GROUP BY qs.set_id,qs.set_sequence,qs.created_at,
                 qs.review_status,qs.published_at,linked.mock_test_id,linked.slug,
                 linked.title_ko,linked.is_published`,
    );
    return result.rows.map((row) => {
      const roundMatch = row.slug?.match(/^topik-ii-reading-(\d+)$/);
      const blockingReasons: string[] = [];
      if (row.reviewStatus !== "reviewed") blockingReasons.push("SET_NOT_REVIEWED");
      if (!row.publishedAt) blockingReasons.push("SET_NOT_PUBLISHED");
      if (row.itemCount !== 50) blockingReasons.push("ITEM_COUNT_INVALID");
      if (row.validItemCount !== 50) blockingReasons.push("ITEMS_INVALID");
      if (row.visualReady < row.visualRequired) blockingReasons.push("VISUALS_INCOMPLETE");
      return {
        ...row,
        round: roundMatch ? Number(roundMatch[1]) : null,
        readyToPublish: !row.mockTestId && blockingReasons.length === 0,
        blockingReasons,
      };
    }).sort((left, right) => {
      if (left.round !== null && right.round !== null) return left.round - right.round;
      if (left.round !== null) return -1;
      if (right.round !== null) return 1;
      return left.createdAt.getTime() - right.createdAt.getTime();
    });
  }

  async publishReadingSet(setId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('topik_reading_publish'))");

      const existing = await client.query<{
        mock_test_id: string; slug: string; is_published: boolean;
      }>(
        `SELECT mt.mock_test_id,mt.slug,mt.is_published
           FROM topik_app.mock_test_sections mts
           JOIN topik_app.mock_tests mt ON mt.mock_test_id=mts.mock_test_id
          WHERE mts.set_id=$1 AND mts.section='reading'
          ORDER BY mt.is_published DESC,mt.display_order
          LIMIT 1`,
        [setId],
      );
      if (existing.rows[0]?.is_published) {
        const linked = existing.rows[0];
        await client.query("COMMIT");
        const round = Number(linked.slug.match(/^topik-ii-reading-(\d+)$/)?.[1] ?? 0) || null;
        return { mockTestId: linked.mock_test_id, slug: linked.slug, round, published: true, created: false };
      }

      const visuals = await client.query<{ required: number; ready: number }>(
        `SELECT COUNT(*) FILTER (WHERE qsi.position=10)::int AS required,
                COUNT(material.visual_asset_id) FILTER (WHERE qsi.position=10)::int AS ready
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv
             ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version AND iv.section='reading'
           LEFT JOIN topik_app.item_visual_assets material
             ON material.item_id=iv.item_id AND material.item_version=iv.item_version
            AND material.visual_role='material' AND material.option_number=1 AND material.is_current
          WHERE qsi.set_id=$1`,
        [setId],
      );
      if ((visuals.rows[0]?.required ?? 0) === 0 || visuals.rows[0]!.ready < visuals.rows[0]!.required) {
        throw new AppError(409, "READING_VISUALS_INCOMPLETE", "The reading question 10 graph must be ready before publishing");
      }

      if (existing.rows[0]) {
        const linked = existing.rows[0];
        await client.query(
          "UPDATE topik_app.mock_tests SET is_published=TRUE,updated_at=CURRENT_TIMESTAMP WHERE mock_test_id=$1",
          [linked.mock_test_id],
        );
        await client.query("COMMIT");
        const round = Number(linked.slug.match(/^topik-ii-reading-(\d+)$/)?.[1] ?? 0) || null;
        return { mockTestId: linked.mock_test_id, slug: linked.slug, round, published: true, created: false };
      }

      const readiness = await client.query<{
        section: string; review_status: string; published_at: Date | null;
        item_count: number; valid_item_count: number;
      }>(
        `SELECT qs.section,qs.review_status,qs.published_at,
                COUNT(qsi.item_id)::int AS item_count,
                COUNT(qsi.item_id) FILTER (WHERE
                  iv.section='reading'
                  AND iv.correct_answer BETWEEN 1 AND 4
                  AND CASE WHEN jsonb_typeof(iv.choices)='array' THEN jsonb_array_length(iv.choices) ELSE 0 END=4
                )::int AS valid_item_count
           FROM topik_bank.question_sets qs
           LEFT JOIN topik_bank.question_set_items qsi
             ON qsi.set_id=qs.set_id
           LEFT JOIN topik_bank.item_versions iv
             ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qs.set_id=$1
          GROUP BY qs.section,qs.review_status,qs.published_at`,
        [setId],
      );
      const ready = readiness.rows[0];
      if (!ready) throw notFound("Reading set not found");
      if (ready.section !== "reading" || ready.review_status !== "reviewed" || !ready.published_at
        || ready.item_count !== 50 || ready.valid_item_count !== 50) {
        throw new AppError(409, "READING_SET_NOT_READY", "A reviewed and published reading set with 50 valid items is required");
      }

      const sequence = await client.query<{ round: number; display_order: number }>(
        `SELECT COALESCE(MAX(substring(slug FROM '^topik-ii-reading-([0-9]+)$')::int),0)::int + 1 AS round,
                COALESCE(MAX(display_order),0)::int + 1 AS display_order
           FROM topik_app.mock_tests`,
      );
      const round = sequence.rows[0]?.round ?? 1;
      const displayOrder = sequence.rows[0]?.display_order ?? 1;
      const mockTestId = randomUUID();
      const slug = `topik-ii-reading-${round}`;
      await client.query(
        `INSERT INTO topik_app.mock_tests(
           mock_test_id,slug,title_en,title_ko,description_en,description_ko,
           duration_seconds,question_count,max_score,display_order,is_published
         ) VALUES ($1,$2,$3,$4,$5,$6,4200,50,100,$7,TRUE)`,
        [mockTestId, slug, `TOPIK II Reading Mock Test ${round}`, `TOPIK II 읽기 모의고사 ${round}회`,
          "50 TOPIK II-style reading questions.", "TOPIK II 형식의 읽기 50문항입니다.", displayOrder],
      );
      await client.query(
        `INSERT INTO topik_app.mock_test_sections(
           mock_test_id,section_order,section,set_id
         ) VALUES ($1,1,'reading',$2)`,
        [mockTestId, setId],
      );
      await client.query("COMMIT");
      return { mockTestId, slug, round, published: true, created: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listReadingItems(setId?: string, search?: string) {
    const values: unknown[] = [];
    const filters = ["iv.section = 'reading'"];
    if (setId) { values.push(setId); filters.push(`qsi.set_id = $${values.length}`); }
    if (search) {
      values.push(`%${search}%`);
      filters.push(`(iv.stem ILIKE $${values.length} OR iv.item_type ILIKE $${values.length})`);
    }
    const result = await pool.query(
      `SELECT qsi.set_id AS "setId",qsi.position,
              mt.title_ko AS "mockTestTitle", iv.item_id AS "itemId",
              iv.item_version AS "itemVersion", iv.item_type AS "itemType",
              iv.target_level AS "targetLevel", iv.predicted_difficulty AS "predictedDifficulty",
              iv.review_status AS "reviewStatus", iv.stem, iv.choices,
              iv.correct_answer AS "correctAnswer", iv.explanation,
              iv.content_json AS "contentJson",
              material_asset.visual_asset_id AS "materialVisualAssetId",
              material_asset.storage_url AS "materialImageUrl",
              recent_material.status AS "materialGenerationStatus",
              CASE WHEN recent_material.status='failed' THEN recent_material.error_message END AS "materialGenerationError",
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'optionNumber',visual.ordinality,
                  'description',COALESCE(visual.value->>'description',''),
                  'imagePrompt',COALESCE(visual.value->>'image_prompt',''),
                  'chartSpec',visual.value->'chart_spec'
                ) ORDER BY visual.ordinality)
                  FROM jsonb_array_elements(CASE
                    WHEN jsonb_typeof(iv.content_json->'visual_options')='array'
                    THEN iv.content_json->'visual_options' ELSE '[]'::jsonb END)
                       WITH ORDINALITY AS visual(value,ordinality)
              ),'[]'::jsonb) AS "visualOptions"
         FROM topik_bank.question_set_items qsi
         JOIN topik_bank.item_versions iv
           ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
         LEFT JOIN topik_app.mock_test_sections mts
           ON mts.set_id=qsi.set_id AND mts.section='reading'
         LEFT JOIN topik_app.mock_tests mt ON mt.mock_test_id=mts.mock_test_id
         LEFT JOIN LATERAL (
           SELECT iva.visual_asset_id,iva.storage_url
             FROM topik_app.item_visual_assets iva
            WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version
              AND iva.visual_role='material' AND iva.option_number=1 AND iva.is_current
            LIMIT 1
         ) material_asset ON TRUE
         LEFT JOIN LATERAL (
           SELECT vgj.status,vgj.error_message
             FROM topik_app.visual_generation_jobs vgj
            WHERE vgj.item_id=iv.item_id AND vgj.item_version=iv.item_version
              AND vgj.visual_role='material' AND vgj.option_number=1
            ORDER BY vgj.created_at DESC LIMIT 1
         ) recent_material ON TRUE
        WHERE ${filters.join(" AND ")}
        ORDER BY qsi.set_id, qsi.position`,
      values,
    );
    return result.rows.map((row) => {
      const record = row as Record<string, unknown>;
      const material = normalizeReadingMaterial(
        Number(record.position),
        record.contentJson as Record<string, unknown>,
        String(record.stem ?? ""),
      );
      const {
        materialVisualAssetId, materialImageUrl, materialGenerationStatus, materialGenerationError,
        ...item
      } = record;
      return {
        ...item,
        materialVisual: material ? {
          ...material,
          visualAssetId: materialVisualAssetId ?? null,
          imageUrl: materialImageUrl ?? null,
          generationStatus: materialGenerationStatus ?? null,
          generationError: materialGenerationError ?? null,
        } : null,
      };
    });
  }
}
