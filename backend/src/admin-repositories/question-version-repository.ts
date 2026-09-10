import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { AppError, notFound } from "../errors.js";
import type { DialogueTurn } from "../google-tts.js";
import { buildNarrationScript } from "../listening-narration.js";
import { normalizeReadingMaterial } from "../reading-visual.js";
import { AdminMediaRepository } from "./media-repository.js";
import { sha256, stableJson, type QuestionRevisionInput } from "./shared.js";

type VisualRole = "choice" | "material";

type QuestionSetMember = {
  position: number; item_id: string; item_version: number; section: string; item_type: string;
  type_slot: number; primary_skill: string; target_level: number; predicted_difficulty: number;
  irt_difficulty: number | null; irt_discrimination: number | null; generator_provider: string;
  generator_model: string; generator_version: string; prompt_version: string; review_status: string;
  stem: string; choices: unknown; correct_answer: number | null; explanation: string;
  content_json: Record<string, unknown>; source_provenance: Record<string, unknown>;
};

const stringValue = (value: unknown) => typeof value === "string" ? value : "";

function changedListeningAudioPositions(
  members: QuestionSetMember[],
  nextContentByPosition: ReadonlyMap<number, Record<string, unknown>>,
) {
  const groups = new Map<string, QuestionSetMember[]>();
  for (const member of members) {
    if (member.section !== "listening") continue;
    const key = member.item_type.startsWith("paired_") ? member.item_type : `position:${member.position}`;
    const group = groups.get(key) ?? [];
    group.push(member);
    groups.set(key, group);
  }

  const changed: number[] = [];
  for (const group of groups.values()) {
    const targets = group.sort((left, right) => left.position - right.position);
    try {
      const previousScript = buildNarrationScript(targets.map((target) => ({
        position: target.position,
        questionPrompt: stringValue(target.content_json.question_prompt),
        dialogueTurns: target.content_json.dialogue_turns as DialogueTurn[],
      })));
      const nextScript = buildNarrationScript(targets.map((target) => {
        const content = nextContentByPosition.get(target.position) ?? target.content_json;
        return {
          position: target.position,
          questionPrompt: stringValue(content.question_prompt),
          dialogueTurns: content.dialogue_turns as DialogueTurn[],
        };
      }));
      if (stableJson(previousScript) !== stableJson(nextScript)) {
        changed.push(...targets.map((target) => target.position));
      }
    } catch {
      // Invalid or incomplete narration must not retain a possibly stale exam track.
      changed.push(...targets.map((target) => target.position));
    }
  }
  return changed;
}

export class AdminQuestionVersionRepository extends AdminMediaRepository {
  async listQuestionVersions(setId: string, itemId: string) {
    const current = await pool.query<{ position: number; item_version: number }>(
      `SELECT position,item_version
         FROM topik_bank.question_set_items
        WHERE set_id=$1 AND item_id=$2`,
      [setId,itemId],
    );
    const member = current.rows[0];
    if (!member) throw notFound("Question set item not found");
    const versions = await pool.query(
      `SELECT item_id AS "itemId",item_version AS "itemVersion",
              item_type AS "itemType",target_level AS "targetLevel",
              predicted_difficulty AS "predictedDifficulty",review_status AS "reviewStatus",
              stem,choices,correct_answer AS "correctAnswer",explanation,
              content_json AS "contentJson",created_at AS "createdAt",
              item_version=$2 AS "isCurrent"
         FROM topik_bank.item_versions
        WHERE item_id=$1
        ORDER BY item_version DESC`,
      [itemId,member.item_version],
    );
    return {
      setId,
      itemId,
      position: member.position,
      currentVersion: member.item_version,
      versions: versions.rows,
    };
  }

  async reviseQuestionSet(setId: string, revisions: QuestionRevisionInput[]) {
    if (new Set(revisions.map((revision) => revision.position)).size !== revisions.length
      || new Set(revisions.map((revision) => revision.itemId)).size !== revisions.length) {
      throw new AppError(400, "QUESTION_REVISION_DUPLICATE", "Each question can be revised only once per request");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`question-set:${setId}`]);
      const set = await client.query<{
        review_status: string; default_target_level: number; default_predicted_difficulty: number;
        published_at: Date | null;
      }>(
        `SELECT review_status,default_target_level,default_predicted_difficulty,published_at
           FROM topik_bank.question_sets WHERE set_id=$1 FOR UPDATE`,
        [setId],
      );
      if (!set.rows[0]) throw notFound("Question set not found");

      const members = await client.query<QuestionSetMember>(
        `SELECT qsi.position,iv.* FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qsi.set_id=$1 ORDER BY qsi.position FOR UPDATE OF qsi,iv`,
        [setId],
      );
      if (!members.rowCount) throw notFound("Question set items not found");

      const byPosition = new Map(members.rows.map((row) => [row.position, row]));
      const nextVersions = new Map<number, { itemId: string; itemVersion: number }>();
      const nextContentByPosition = new Map<number, Record<string, unknown>>();
      for (const revision of revisions) {
        const current = byPosition.get(revision.position);
        if (!current || current.item_id !== revision.itemId || current.item_version !== revision.itemVersion) {
          throw new AppError(409, "QUESTION_VERSION_CONFLICT", "The question has changed. Reload it before saving again.");
        }
        if (revision.correctAnswer < 1 || revision.correctAnswer > 4) {
          throw new AppError(400, "QUESTION_INVALID", "A correct answer from 1 to 4 is required");
        }
        const visualOptions = revision.contentJson.visual_options;
        if (revision.choices.length !== 4 && !(Array.isArray(visualOptions) && visualOptions.length === 4)) {
          throw new AppError(400, "QUESTION_INVALID", "Four text or visual choices are required");
        }
        const contentJson: Record<string, unknown> = {
          ...revision.contentJson,
          stem: revision.stem,
          choices: revision.choices,
        };
        const nextMaterial = current.section === "reading"
          ? normalizeReadingMaterial(revision.position,contentJson,revision.stem)
          : null;
        if (nextMaterial) {
          contentJson.visual_material = {
            description:nextMaterial.description,
            image_prompt:nextMaterial.imagePrompt,
            source_text:nextMaterial.sourceText,
          };
        }
        nextContentByPosition.set(revision.position, contentJson);
        const contentHash = sha256({
          stem: revision.stem,
          choices: revision.choices,
          correctAnswer: revision.correctAnswer,
          explanation: revision.explanation,
          contentJson,
        });
        const currentHash = sha256({
          stem: current.stem,
          choices: current.choices,
          correctAnswer: current.correct_answer,
          explanation: current.explanation,
          contentJson: current.content_json,
        });
        if (contentHash === currentHash) throw new AppError(400, "QUESTION_UNCHANGED", "No question changes were found");
        const versionResult = await client.query<{ version: number }>(
          "SELECT COALESCE(MAX(item_version),0)::int+1 AS version FROM topik_bank.item_versions WHERE item_id=$1",
          [current.item_id],
        );
        const nextVersion = versionResult.rows[0]?.version ?? current.item_version + 1;
        await client.query(
          `INSERT INTO topik_bank.item_versions(
             item_id,item_version,section,item_type,type_slot,primary_skill,target_level,
             predicted_difficulty,irt_difficulty,irt_discrimination,stem_length,choice_count,
             generator_provider,generator_model,generator_version,prompt_version,review_status,
             stem,choices,correct_answer,explanation,content_json,source_provenance,content_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
          [current.item_id,nextVersion,current.section,current.item_type,current.type_slot,current.primary_skill,
            current.target_level,current.predicted_difficulty,current.irt_difficulty,current.irt_discrimination,
            revision.stem.length,revision.choices.length,current.generator_provider,current.generator_model,
            current.generator_version,current.prompt_version,current.review_status,revision.stem,
            JSON.stringify(revision.choices),revision.correctAnswer,revision.explanation,JSON.stringify(contentJson),
            JSON.stringify({ ...current.source_provenance, admin_revision_of: current.item_version }),contentHash],
        );

        const oldDialogue = stableJson(current.content_json.dialogue_turns ?? []);
        const newDialogue = stableJson(contentJson.dialogue_turns ?? []);
        if (oldDialogue === newDialogue) {
          await client.query(
            `INSERT INTO topik_app.item_audio_bindings(item_id,item_version,audio_asset_id,source_hash,is_current)
             SELECT item_id,$3,audio_asset_id,source_hash,is_current
               FROM topik_app.item_audio_bindings
              WHERE item_id=$1 AND item_version=$2 AND is_current
             ON CONFLICT DO NOTHING`,
            [current.item_id,current.item_version,nextVersion],
          );
        }
        const choicesUnchanged = stableJson(current.content_json.visual_options ?? []) === stableJson(contentJson.visual_options ?? []);
        const currentMaterial = current.section === "reading"
          ? normalizeReadingMaterial(current.position,current.content_json,current.stem)
          : null;
        const materialUnchanged = Boolean(currentMaterial && nextMaterial
          && currentMaterial.sourceText === nextMaterial.sourceText);
        if (choicesUnchanged || materialUnchanged) {
          const visuals = await client.query<{
            option_number: number; visual_role: VisualRole; storage_bucket: string; storage_path: string; storage_url: string;
            mime_type: string; byte_size: number; created_by: string | null;
          }>(
            `SELECT option_number,visual_role,storage_bucket,storage_path,storage_url,mime_type,byte_size,created_by
               FROM topik_app.item_visual_assets
              WHERE item_id=$1 AND item_version=$2 AND is_current
                AND ((visual_role='choice' AND $3::boolean) OR (visual_role='material' AND $4::boolean))`,
            [current.item_id,current.item_version,choicesUnchanged,materialUnchanged],
          );
          for (const visual of visuals.rows) {
            await client.query(
              `INSERT INTO topik_app.item_visual_assets(
                 visual_asset_id,item_id,item_version,option_number,visual_role,storage_bucket,storage_path,
                 storage_url,mime_type,byte_size,created_by,is_current
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE)`,
              [randomUUID(),current.item_id,nextVersion,visual.option_number,visual.visual_role,visual.storage_bucket,
                visual.storage_path,visual.storage_url,visual.mime_type,visual.byte_size,visual.created_by],
            );
          }
        }
        nextVersions.set(revision.position, { itemId: current.item_id, itemVersion: nextVersion });
      }

      const fingerprint = sha256(members.rows.map((member) => {
        const replacement = nextVersions.get(member.position);
        return `${member.position}:${replacement?.itemId ?? member.item_id}:${replacement?.itemVersion ?? member.item_version}`;
      }).join("|"));
      for (const [position, replacement] of nextVersions) {
        const updated = await client.query(
          `UPDATE topik_bank.question_set_items
              SET item_version=$3
            WHERE set_id=$1 AND position=$2 AND item_id=$4`,
          [setId,position,replacement.itemVersion,replacement.itemId],
        );
        if (updated.rowCount !== 1) {
          throw new AppError(409, "QUESTION_VERSION_CONFLICT", "The question has changed. Reload it before saving again.");
        }
      }

      const staleAudioPositions = changedListeningAudioPositions(members.rows, nextContentByPosition);
      if (staleAudioPositions.length) {
        await client.query(
          `UPDATE topik_app.question_set_item_audio_bindings
              SET is_current=FALSE
            WHERE set_id=$1 AND position=ANY($2::smallint[]) AND is_current`,
          [setId,staleAudioPositions],
        );
      }
      await client.query(
        "UPDATE topik_bank.question_sets SET set_fingerprint=$2 WHERE set_id=$1",
        [setId,fingerprint],
      );
      const linked = await client.query<{ mock_test_id: string }>(
        `SELECT DISTINCT mock_test_id
           FROM topik_app.mock_test_sections
          WHERE set_id=$1`,
        [setId],
      );
      const mockTestIds = [...new Set(linked.rows.map((row) => row.mock_test_id))];
      if (mockTestIds.length) {
        await client.query(
          `UPDATE topik_app.mock_tests SET is_published=FALSE,updated_at=CURRENT_TIMESTAMP
            WHERE mock_test_id=ANY($1::uuid[])`,
          [mockTestIds],
        );
      }
      await client.query("COMMIT");
      return {
        setId,
        mockTestIds,
        published: false,
        revisions: [...nextVersions.entries()].map(([position, version]) => ({ position, ...version })),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async publishMockTest(mockTestId: string, publish: boolean) {
    if (publish) {
      const readiness = await pool.query<{ section: string; expected: number; valid_items: number; audio_ready: number; visual_expected: number; visual_ready: number }>(
        `SELECT mts.section, COUNT(*)::int expected,
                COUNT(*) FILTER (WHERE iv.correct_answer BETWEEN 1 AND 4
                  AND (CASE WHEN jsonb_typeof(iv.choices)='array' THEN jsonb_array_length(iv.choices) ELSE 0 END=4
                    OR CASE WHEN jsonb_typeof(iv.content_json->'visual_options')='array' THEN jsonb_array_length(iv.content_json->'visual_options') ELSE 0 END=4))::int valid_items,
                COUNT(set_binding.audio_asset_id) FILTER (WHERE audio.narration_version='exam_track_v4')::int audio_ready,
                COALESCE(SUM(CASE
                  WHEN mts.section='listening' AND jsonb_typeof(iv.content_json->'visual_options')='array'
                    THEN jsonb_array_length(iv.content_json->'visual_options')
                  WHEN mts.section='reading' AND qsi.position=10 THEN 1
                  ELSE 0 END),0)::int visual_expected,
                COALESCE(SUM((SELECT COUNT(*) FROM topik_app.item_visual_assets iva
                  WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version AND iva.is_current
                    AND ((mts.section='listening' AND iva.visual_role='choice')
                      OR (mts.section='reading' AND qsi.position=10 AND iva.visual_role='material')))),0)::int visual_ready
           FROM topik_app.mock_test_sections mts
           JOIN topik_bank.question_set_items qsi ON qsi.set_id=mts.set_id
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
           LEFT JOIN topik_app.question_set_item_audio_bindings set_binding
             ON set_binding.set_id=qsi.set_id AND set_binding.position=qsi.position AND set_binding.is_current
           LEFT JOIN topik_app.tts_audio_assets audio
             ON audio.audio_asset_id=set_binding.audio_asset_id AND audio.deleted_at IS NULL
          WHERE mts.mock_test_id=$1
          GROUP BY mts.section`,
        [mockTestId],
      );
      const row = readiness.rows[0];
      if (!row || row.expected !== 50 || row.valid_items !== 50) {
        throw new AppError(409, "MOCK_TEST_INCOMPLETE", "All 50 valid questions are required before publishing");
      }
      if (row.section === "listening" && (row.audio_ready !== 50 || row.visual_ready < row.visual_expected)) {
        throw new AppError(409, "LISTENING_ASSETS_INCOMPLETE", "All 50 audio and visual assets are required before publishing");
      }
      if (row.section === "reading" && row.visual_ready < row.visual_expected) {
        throw new AppError(409, "READING_VISUALS_INCOMPLETE", "The reading question 10 graph must be ready before publishing");
      }
    }
    const updated = await pool.query(
      `UPDATE topik_app.mock_tests SET is_published=$2, updated_at=CURRENT_TIMESTAMP
        WHERE mock_test_id=$1`,
      [mockTestId, publish],
    );
    if (!updated.rowCount) throw notFound("Mock test not found");
    return { published: publish };
  }
}
