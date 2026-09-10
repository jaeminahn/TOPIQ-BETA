import { createHash, randomUUID } from "node:crypto";
import { composeExamTrack, type AudioCompositionPart } from "./audio-composer.js";
import { pool } from "./db.js";
import { config } from "./config.js";
import { GoogleTtsClient, type DialogueTurn, type TtsStyle } from "./google-tts.js";
import { EXAM_TRACK_VERSION, isAdminNarrationScript, type AdminNarrationScript } from "./listening-narration.js";
import { SupabaseStorage } from "./storage.js";

type Job = {
  job_id: string; item_id: string; item_version: number; requested_by: string;
  force_regenerate: boolean; attempts: number; tts_style: TtsStyle;
  set_id: string | null; group_start_position: number | null;
  script_snapshot: unknown;
};

const validTurns = (turns: DialogueTurn[]) => turns.length > 0
  && turns.every((turn) => ["남자", "여자"].includes(turn.speaker) && Boolean(turn.text));

export const EXAM_TRACK_SYNTHESIS_VERSION = "GEMINI_LITERAL_ATOMIC_V3_NO_DURATION_RETRY";
export const EXAM_TRACK_COMPOSER_VERSION = "LINEAR16_FFMPEG_V4_BRIGHT_BELL";

export function examTrackSourceHash(script: AdminNarrationScript, style: TtsStyle) {
  return createHash("sha256").update(JSON.stringify({
    script, promptVersion: script.version.toUpperCase(), composerVersion: EXAM_TRACK_COMPOSER_VERSION,
    synthesisVersion: script.version === EXAM_TRACK_VERSION ? EXAM_TRACK_SYNTHESIS_VERSION : "GEMINI_LEGACY_V1",
    sampleRateHertz: 24_000, model: config.googleTts.model,
    female: config.googleTts.femaleVoice, male: config.googleTts.maleVoice,
    style: { speakingRate: style.speakingRate, stylePrompt: style.stylePrompt },
  })).digest("hex");
}

export async function synthesizeExamTrackParts(
  script: AdminNarrationScript,
  style: TtsStyle,
  synthesize: GoogleTtsClient["synthesize"],
  synthesizeLiteral?: GoogleTtsClient["synthesizeLiteral"],
) {
  const parts: AudioCompositionPart[] = [];
  let dialogueAudio: Buffer[] | null = null;
  const literal = script.version === EXAM_TRACK_VERSION;
  if (literal && !synthesizeLiteral) throw new Error("Literal Gemini TTS synthesizer is missing");

  const synthesizeTurns = async (turns: DialogueTurn[]) => {
    if (!literal) {
      return [await synthesize(turns, style, {
        audioEncoding: "LINEAR16", sampleRateHertz: 24_000,
      })];
    }
    const buffers: Buffer[] = [];
    for (const turn of turns) {
      for (const utterance of splitLiteralUtterances(turn.text)) {
        buffers.push(await synthesizeLiteral!({ ...turn, text: utterance }, style, {
          audioEncoding: "LINEAR16", sampleRateHertz: 24_000,
        }));
      }
    }
    return buffers;
  };

  for (const segment of script.segments) {
    if (segment.kind === "bell") {
      parts.push({ kind: "bell" });
      continue;
    }
    if (segment.kind === "silence") {
      parts.push({ kind: "silence", durationMs: segment.durationMs });
      continue;
    }
    if (segment.kind === "dialogue") {
      if (!validTurns(segment.turns)) throw new Error("Listening dialogue_turns are missing or invalid");
      dialogueAudio ??= await synthesizeTurns(segment.turns);
      parts.push(...dialogueAudio.map((data) => ({ kind: "audio" as const, data })));
      continue;
    }
    const speech = await synthesizeTurns([{ speaker: segment.speaker, text: segment.text }]);
    parts.push(...speech.map((data) => ({ kind: "audio" as const, data })));
  }
  return parts;
}

export function splitLiteralUtterances(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];
  return normalized.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)
    ?.map((part) => part.trim()).filter(Boolean) ?? [normalized];
}

export class TtsWorker {
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly tts = new GoogleTtsClient(),
    private readonly storageFactory = () => new SupabaseStorage(),
  ) {}

  start() {
    if (!config.googleTts.workerEnabled || this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), 3_000);
    this.timer.unref();
    void this.runOnce();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  kick() { void this.runOnce(); }

  private async claim(): Promise<Job | null> {
    const result = await pool.query<Job>(
      `WITH abandoned AS (
         UPDATE topik_app.tts_generation_jobs
            SET status='failed',
                error_message=COALESCE(NULLIF(error_message,''),'TTS worker stopped before the attempt completed'),
                completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL
          WHERE (status='queued' AND attempts>0)
             OR (status='processing' AND (lease_expires_at IS NULL OR lease_expires_at<CURRENT_TIMESTAMP))
         RETURNING job_id
       ), candidate AS (
         SELECT job_id FROM topik_app.tts_generation_jobs
          WHERE status='queued' AND attempts=0
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE topik_app.tts_generation_jobs j
          SET status='processing', attempts=attempts+1, started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
              lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes', error_message=NULL
         FROM candidate c WHERE j.job_id=c.job_id RETURNING j.*`,
    );
    return result.rows[0] ?? null;
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      let job: Job | null;
      while ((job = await this.claim())) await this.process(job);
    } catch (error) {
      console.error("TTS worker polling failed", error);
    } finally { this.running = false; }
  }

  private async process(job: Job) {
    try {
      if (job.set_id && isAdminNarrationScript(job.script_snapshot)) {
        await this.processExamTrack(job, job.script_snapshot);
      } else {
        await this.processLegacyDialogue(job);
      }
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await pool.query(
        `UPDATE topik_app.tts_generation_jobs SET status='failed',error_message=$2,
           completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL WHERE job_id=$1`,
        [job.job_id, message],
      );
    }
  }

  private async findAsset(sourceHash: string, forceRegenerate: boolean) {
    if (forceRegenerate) return null;
    const asset = await pool.query<{ audio_asset_id: string }>(
      `SELECT audio_asset_id FROM topik_app.tts_audio_assets
        WHERE source_hash=$1 AND model_name=$2 AND female_voice=$3 AND male_voice=$4
          AND deleted_at IS NULL LIMIT 1`,
      [sourceHash, config.googleTts.model, config.googleTts.femaleVoice, config.googleTts.maleVoice],
    );
    return asset.rows[0]?.audio_asset_id ?? null;
  }

  private async processExamTrack(job: Job, script: AdminNarrationScript) {
    const sourceHash = examTrackSourceHash(script, job.tts_style);
    let audioAssetId = await this.findAsset(sourceHash, job.force_regenerate);

    if (!audioAssetId) {
      const parts = await synthesizeExamTrackParts(
        script,
        job.tts_style,
        this.tts.synthesize.bind(this.tts),
        this.tts.synthesizeLiteral.bind(this.tts),
      );
      const composed = await composeExamTrack(parts);
      const path = `listening/exam-tracks/${sourceHash.slice(0, 2)}/${sourceHash}.mp3`;
      const uploaded = await this.storageFactory().uploadAudio(path, composed.audio, "audio/mpeg");
      audioAssetId = randomUUID();
      await pool.query(
        `INSERT INTO topik_app.tts_audio_assets(
           audio_asset_id,source_hash,model_name,female_voice,male_voice,storage_bucket,
           storage_path,storage_url,mime_type,byte_size,duration_ms,created_by,tts_style,
           narration_version,script_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'audio/mpeg',$9,$10,$11,$12,$13,$14)
         ON CONFLICT (source_hash,model_name,female_voice,male_voice) DO UPDATE SET
           storage_bucket=EXCLUDED.storage_bucket,storage_path=EXCLUDED.storage_path,
           storage_url=EXCLUDED.storage_url,mime_type=EXCLUDED.mime_type,
           byte_size=EXCLUDED.byte_size,duration_ms=EXCLUDED.duration_ms,
           tts_style=EXCLUDED.tts_style,narration_version=EXCLUDED.narration_version,
           script_snapshot=EXCLUDED.script_snapshot,deleted_at=NULL
         RETURNING audio_asset_id`,
        [audioAssetId, sourceHash, config.googleTts.model, config.googleTts.femaleVoice,
          config.googleTts.maleVoice, uploaded.bucket, uploaded.path, uploaded.url,
          composed.audio.length, composed.durationMs, job.requested_by, job.tts_style,
          script.version, script],
      ).then((result) => { audioAssetId = result.rows[0].audio_asset_id; });
    }

    const targets = await pool.query<{
      set_id: string; position: number; item_id: string; item_version: number; is_current: boolean;
    }>(
      `SELECT target.set_id,target.position,target.item_id,target.item_version,
              EXISTS (
                SELECT 1 FROM topik_bank.question_set_items member
                 WHERE member.set_id=target.set_id AND member.position=target.position
                   AND member.item_id=target.item_id AND member.item_version=target.item_version
              ) AS is_current
         FROM topik_app.tts_generation_job_targets target
        WHERE job_id=$1 AND set_id IS NOT NULL AND position IS NOT NULL
        ORDER BY position`,
      [job.job_id],
    );
    if (!targets.rowCount || targets.rows.some((target) => target.set_id !== job.set_id || !target.is_current)
      || JSON.stringify(targets.rows.map((target) => target.position)) !== JSON.stringify(script.positions)) {
      throw new Error("Listening exam-track targets do not match the script snapshot");
    }
    const positions = targets.rows.map((target) => target.position);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE topik_app.question_set_item_audio_bindings SET is_current=FALSE
          WHERE set_id=$1 AND is_current AND position=ANY($2::smallint[])`,
        [job.set_id, positions],
      );
      await client.query(
        `INSERT INTO topik_app.question_set_item_audio_bindings(
           set_id,position,audio_asset_id,source_hash
         ) SELECT $1,position,$3,$4 FROM unnest($2::smallint[]) AS position
         ON CONFLICT (set_id,position,audio_asset_id)
         DO UPDATE SET source_hash=EXCLUDED.source_hash,is_current=TRUE`,
        [job.set_id, positions, audioAssetId, sourceHash],
      );
      await client.query(
        `UPDATE topik_app.tts_generation_jobs SET status='succeeded',audio_asset_id=$2,
           completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL WHERE job_id=$1`,
        [job.job_id, audioAssetId],
      );
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  private async processLegacyDialogue(job: Job) {
    const item = await pool.query<{ content_json: Record<string, unknown> }>(
      "SELECT content_json FROM topik_bank.item_versions WHERE item_id=$1 AND item_version=$2 AND section='listening'",
      [job.item_id, job.item_version],
    );
    const turns = (item.rows[0]?.content_json.dialogue_turns ?? []) as DialogueTurn[];
    if (!validTurns(turns)) throw new Error("Listening dialogue_turns are missing or invalid");
    const sourceHash = createHash("sha256").update(JSON.stringify({
      turns, promptVersion: "TOPIK_NEUTRAL_V1", model: config.googleTts.model,
      female: config.googleTts.femaleVoice, male: config.googleTts.maleVoice, style: job.tts_style,
    })).digest("hex");
    let audioAssetId = await this.findAsset(sourceHash, job.force_regenerate);
    if (!audioAssetId) {
      const audio = await this.tts.synthesize(turns, job.tts_style);
      const path = `listening/${sourceHash.slice(0, 2)}/${sourceHash}.mp3`;
      const uploaded = await this.storageFactory().uploadAudio(path, audio);
      audioAssetId = randomUUID();
      await pool.query(
        `INSERT INTO topik_app.tts_audio_assets(
           audio_asset_id,source_hash,model_name,female_voice,male_voice,storage_bucket,
           storage_path,storage_url,byte_size,created_by,tts_style,narration_version
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'dialogue_v1')
         ON CONFLICT (source_hash,model_name,female_voice,male_voice) DO UPDATE SET
           storage_bucket=EXCLUDED.storage_bucket,storage_path=EXCLUDED.storage_path,
           storage_url=EXCLUDED.storage_url,byte_size=EXCLUDED.byte_size,
           tts_style=EXCLUDED.tts_style,narration_version='dialogue_v1',deleted_at=NULL
         RETURNING audio_asset_id`,
        [audioAssetId, sourceHash, config.googleTts.model, config.googleTts.femaleVoice,
          config.googleTts.maleVoice, uploaded.bucket, uploaded.path, uploaded.url,
          audio.length, job.requested_by, job.tts_style],
      ).then((result) => { audioAssetId = result.rows[0].audio_asset_id; });
    }

    const targetResult = await pool.query<{ item_id: string; item_version: number }>(
      `SELECT item_id,item_version FROM topik_app.tts_generation_job_targets WHERE job_id=$1
       UNION ALL SELECT $2::uuid,$3::integer WHERE NOT EXISTS (
         SELECT 1 FROM topik_app.tts_generation_job_targets WHERE job_id=$1
       )`,
      [job.job_id, job.item_id, job.item_version],
    );
    const targetIds = targetResult.rows.map((target) => target.item_id);
    const targetVersions = targetResult.rows.map((target) => target.item_version);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE topik_app.item_audio_bindings SET is_current=FALSE WHERE is_current
          AND (item_id,item_version) IN (SELECT * FROM unnest($1::uuid[],$2::integer[]))`,
        [targetIds, targetVersions],
      );
      await client.query(
        `INSERT INTO topik_app.item_audio_bindings(item_id,item_version,audio_asset_id,source_hash)
         SELECT target.item_id,target.item_version,$3,$4
           FROM unnest($1::uuid[],$2::integer[]) AS target(item_id,item_version)
         ON CONFLICT (item_id,item_version,audio_asset_id)
         DO UPDATE SET source_hash=EXCLUDED.source_hash,is_current=TRUE`,
        [targetIds, targetVersions, audioAssetId, sourceHash],
      );
      await client.query(
        `UPDATE topik_app.tts_generation_jobs SET status='succeeded',audio_asset_id=$2,
           completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL WHERE job_id=$1`,
        [job.job_id, audioAssetId],
      );
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
}

export const ttsWorker = new TtsWorker();
