import { createHash, randomUUID } from "node:crypto";
import { composeExamTrack, type AudioCompositionPart } from "./audio-composer.js";
import { config } from "../core/config.js";
import { GoogleTtsClient, type DialogueTurn, type TtsStyle } from "./google-tts.js";
import { EXAM_TRACK_VERSION, buildNarrationScript, type AdminNarrationScript } from "./narration.js";
import { cleanupReplacedMedia } from "../media/cleanup.js";
import { AdminRepository } from "../admin/repository.js";
import { AppError, MediaCommitUncertainError } from "../core/errors.js";
import { withGeneration } from "../media/generation.js";
import { SupabaseStorage } from "../media/storage.js";

const validTurns = (turns: DialogueTurn[]) => turns.length > 0
  && turns.every((turn) => ["남자", "여자"].includes(turn.speaker) && Boolean(turn.text));

export const EXAM_TRACK_SYNTHESIS_VERSION = "GEMINI_LITERAL_ATOMIC_V3_NO_DURATION_RETRY";
export const EXAM_TRACK_COMPOSER_VERSION = "LINEAR16_FFMPEG_V4_BRIGHT_BELL";

export function examTrackSourceHash(script: AdminNarrationScript, style: TtsStyle) {
  return createHash("sha256").update(JSON.stringify({
    script, promptVersion: script.version.toUpperCase(), composerVersion: EXAM_TRACK_COMPOSER_VERSION,
    synthesisVersion: EXAM_TRACK_SYNTHESIS_VERSION,
    sampleRateHertz: 24_000, model: config.googleTts.model,
    female: config.googleTts.femaleVoice, male: config.googleTts.maleVoice,
    style: { speakingRate: style.speakingRate, stylePrompt: style.stylePrompt },
  })).digest("hex");
}

export async function synthesizeExamTrackParts(
  script: AdminNarrationScript,
  style: TtsStyle,
  synthesizeLiteral: GoogleTtsClient["synthesizeLiteral"],
  signal?: AbortSignal,
) {
  const parts: AudioCompositionPart[] = [];
  let dialogueAudio: Buffer[] | null = null;
  if (script.version !== EXAM_TRACK_VERSION) throw new Error("Only the current exam-track format can be generated");

  const synthesizeTurns = async (turns: DialogueTurn[]) => {
    const buffers: Buffer[] = [];
    for (const turn of turns) {
      for (const utterance of splitLiteralUtterances(turn.text)) {
        buffers.push(await synthesizeLiteral({ ...turn, text: utterance }, style, {
          audioEncoding: "LINEAR16", sampleRateHertz: 24_000, signal,
        }));
      }
    }
    return buffers;
  };

  for (const segment of script.segments) {
    signal?.throwIfAborted();
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


export class TtsService {
  constructor(
    private readonly tts = new GoogleTtsClient(),
    private readonly storageFactory = (signal?: AbortSignal) => new SupabaseStorage(signal),
    private readonly repository = new AdminRepository(),
    private readonly compose = composeExamTrack,
  ) {}

  async generateGroup(adminUserId: string, setId: string, leaderItemId: string, forceRegenerate: boolean, style: TtsStyle) {
    return withGeneration("tts", async (signal, client) => {
      const targets = await this.repository.resolveAudioGroup(client, setId, leaderItemId);
      const positions = targets.map((target) => target.position);
      const script = buildNarrationScript(targets.map((target) => ({
        position: target.position, questionPrompt: target.question_prompt,
        dialogueTurns: target.dialogue_turns as DialogueTurn[],
      })));
      const sourceHash = examTrackSourceHash(script, style);
      // Compare the immutable script/style, including earlier assets with the original hash.
      const cached = forceRegenerate ? null : (await client.query<{ audio_asset_id: string }>(
        `SELECT audio_asset_id FROM topik_app.tts_audio_assets
          WHERE model_name=$1 AND female_voice=$2 AND male_voice=$3 AND deleted_at IS NULL
            AND narration_version=$4 AND (source_hash=$5 OR script_snapshot->>'generationSourceHash'=$5) AND tts_style=$6::jsonb
          ORDER BY created_at DESC LIMIT 1`,
        [config.googleTts.model,config.googleTts.femaleVoice,config.googleTts.maleVoice,script.version,sourceHash,JSON.stringify(style)],
      )).rows[0];
      const audioAssetId = cached?.audio_asset_id ?? randomUUID();
      let uploaded: { bucket: string; path: string; url: string } | undefined;
      let composed: { audio: Buffer; durationMs: number } | undefined;
      let committed = false;
      let transaction = false;
      let commitStarted = false;
      try {
        if (!cached) {
          try {
            const parts = await synthesizeExamTrackParts(script,style,this.tts.synthesizeLiteral.bind(this.tts),signal);
            composed = await this.compose(parts, signal);
          } catch (error) {
            if (signal.aborted) throw signal.reason;
            if (error instanceof AppError) throw error;
            throw new AppError(502,"TTS_PROVIDER_FAILED",error instanceof Error ? error.message : "TTS generation failed");
          }
          signal.throwIfAborted();
          // A new recording never overwrites the object used by existing playback URLs.
          const path = `listening/exam-tracks/${sourceHash.slice(0,2)}/${sourceHash}-${audioAssetId}.mp3`;
          uploaded = { bucket: config.supabase.audioBucket, path, url: "" };
          uploaded = await this.storageFactory(signal).uploadAudio(path,composed.audio,"audio/mpeg");
        }
        signal.throwIfAborted();
        await client.query("BEGIN"); transaction = true;
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`question-set:${setId}`]);
        const current = await this.repository.resolveAudioGroup(client,setId,leaderItemId);
        if (JSON.stringify(current) !== JSON.stringify(targets)) {
          throw new AppError(409,"QUESTION_VERSION_CONFLICT","The question changed during generation. Reload before retrying.");
        }
        if (cached) {
          const available = await client.query("SELECT 1 FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1 AND deleted_at IS NULL FOR UPDATE", [audioAssetId]);
          if (!available.rowCount) throw new AppError(409,"ASSET_CHANGED","The cached audio was removed. Retry generation.");
        } else {
          const recordingHash = createHash("sha256").update(`${sourceHash}:${audioAssetId}`).digest("hex");
          await client.query(
            `INSERT INTO topik_app.tts_audio_assets(audio_asset_id,source_hash,model_name,female_voice,male_voice,
              storage_bucket,storage_path,storage_url,mime_type,byte_size,duration_ms,created_by,tts_style,narration_version,script_snapshot)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'audio/mpeg',$9,$10,$11,$12,$13,$14)`,
            [audioAssetId,recordingHash,config.googleTts.model,config.googleTts.femaleVoice,config.googleTts.maleVoice,
              uploaded!.bucket,uploaded!.path,uploaded!.url,composed!.audio.length,composed!.durationMs,adminUserId,style,script.version,{...script,generationSourceHash:sourceHash}],
          );
        }
        const replaced = await client.query<{audio_asset_id: string}>(
          `UPDATE topik_app.question_set_item_audio_bindings SET is_current=FALSE
            WHERE set_id=$1 AND is_current AND position=ANY($2::smallint[]) RETURNING audio_asset_id`, [setId,positions],
        );
        await client.query(
          `INSERT INTO topik_app.question_set_item_audio_bindings(set_id,position,audio_asset_id,source_hash)
           SELECT $1,position,$3,$4 FROM unnest($2::smallint[]) AS position
           ON CONFLICT (set_id,position,audio_asset_id) DO UPDATE SET source_hash=EXCLUDED.source_hash,is_current=TRUE`,
          [setId,positions,audioAssetId,sourceHash],
        );
        signal.throwIfAborted();
        commitStarted = true;
        await client.query("COMMIT"); transaction = false; committed = true;
        await cleanupReplacedMedia(client, "audio",
          replaced.rows.map((row) => row.audio_asset_id).filter((id) => id !== audioAssetId),
          (bucket, path) => this.storageFactory(AbortSignal.timeout(10_000)).removeObject(bucket, path));
        return { audioAssetId, positions, reused: Boolean(cached) };
      } catch (error) {
        if (transaction) await client.query("ROLLBACK").catch(() => undefined);
        if (commitStarted) throw new MediaCommitUncertainError();
        throw error;
      } finally {
        if (uploaded && !committed && !commitStarted) {
          await this.storageFactory(AbortSignal.timeout(10_000)).removeObject(uploaded.bucket,uploaded.path)
            .catch((error) => console.error("Unbound audio cleanup failed",error));
        }
      }
    });
  }
}
export const ttsService = new TtsService();
