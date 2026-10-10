import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", async () => {
  const { Pool } = await import("pg");
  return { pool: new Pool({ connectionString: process.env.IRT_TEST_DATABASE_URL ?? "postgresql://localhost:1/unavailable" }) };
});
import { pool } from "../../src/core/db.js";
import { TopikRepository } from "../../src/exam/repository.js";
import { AdminRepository } from "../../src/admin/repository.js";
import { buildAdminExportQuery, parseAdminExportFilters } from "../../src/admin/export.js";
import { TtsService } from "../../src/listening/tts-service.js";
import { VisualService } from "../../src/media/visual-service.js";
import { MediaCleanupWorker, mediaCleanupWorker } from "../../src/media/cleanup-worker.js";
import { withGeneration } from "../../src/media/generation.js";

const examId = randomUUID(), setId = randomUUID(), itemId = randomUUID(), listeningItem = randomUUID();
const listeningSetId = randomUUID();
const userId = randomUUID(), sessionId = randomUUID(), token = "irt-test-token";
const removed = ["theta_before", "theta_after", "policy_version", "estimation_run_id", "estimator_version",
  "irt_difficulty", "irt_discrimination", "predicted_difficulty", "default_predicted_difficulty"];
let ownsSchema = false;
let migration = "";
let before: unknown;
let beforeAnalytics: unknown;
const repo = new TopikRepository();
const admin = new AdminRepository();

async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ["topik_bank.item_versions", "topik_bank.question_sets", "topik_app.sessions",
    "topik_app.session_items", "topik_app.answer_states", "topik_app.response_events", "topik_app.response_observations", "topik_app.attempt_feedback"]) {
    result[table] = (await pool.query(`SELECT to_jsonb(t) - $1::text[] AS data FROM ${table} t ORDER BY to_jsonb(t)::text`, [removed])).rows;
  }
  return result;
}
async function analytics() {
  const result: Record<string, unknown> = {};
  for (const dataset of ["questions", "responses", "sessions"] as const) {
    const query = buildAdminExportQuery(dataset,parseAdminExportFilters({status:"submitted"}));
    result[dataset] = (await pool.query(query.text,query.values)).rows.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
}
async function applyMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(migration);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

describe.skipIf(!process.env.IRT_TEST_DATABASE_URL)("IRT removal in disposable PostgreSQL", () => {
  beforeAll(async () => {
    const check = (await pool.query("SELECT current_database() AS name,to_regnamespace('topik_app') AS app,to_regnamespace('topik_bank') AS bank")).rows[0];
    if (check.name !== "unigate_irt_test" || check.app || check.bank) throw Error("Use a fresh disposable database named unigate_irt_test");
    await pool.query(await readFile(resolve(process.cwd(), "../supabase/migrations/20260910040947_remote_schema.sql"), "utf8"));
    ownsSchema = true;
    for (const name of ["017_email_controls_and_media_cleanup", "018_preregistrations", "019_post_exam_survey"]) {
      await pool.query(await readFile(resolve(process.cwd(), `migrations/${name}.sql`), "utf8"));
    }
    migration = await readFile(resolve(process.cwd(), "migrations/020_remove_irt_metadata.sql"), "utf8");
    await pool.query(`CREATE ROLE irt_test_owner; CREATE ROLE irt_test_reader; CREATE ROLE irt_test_default;
      GRANT USAGE ON SCHEMA topik_bank TO irt_test_owner,irt_test_reader;
      GRANT SELECT ON topik_bank.items,topik_bank.item_versions TO irt_test_owner;
      ALTER VIEW topik_bank.current_items OWNER TO irt_test_owner;
      GRANT SELECT ON topik_bank.current_items TO irt_test_reader WITH GRANT OPTION;
      GRANT SELECT (item_id) ON topik_bank.current_set_contents TO irt_test_reader;
      GRANT SELECT ON topik_bank.current_set_contents TO PUBLIC;
      ALTER VIEW topik_bank.current_items SET (security_barrier=true);
      COMMENT ON VIEW topik_bank.current_items IS 'preserved view';
      ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO irt_test_default;`);
    await pool.query("INSERT INTO topik_bank.items(item_id,source_key) VALUES ($1,'irt-reading'),($2,'irt-listening')", [itemId,listeningItem]);
    for (const [id,section] of [[itemId,"reading"],[listeningItem,"listening"]]) {
      await pool.query(`INSERT INTO topik_bank.item_versions(item_id,item_version,section,item_type,primary_skill,target_level,
        predicted_difficulty,irt_difficulty,irt_discrimination,stem_length,choice_count,generator_provider,generator_model,
        generator_version,prompt_version,stem,choices,correct_answer,content_json,source_provenance,content_hash,type_slot)
        VALUES ($1,1,$2,'grammar_blank','grammar',3,0.5,0.6,1.2,4,4,'test','test','v1',repeat('a',64),'test',
          '["a","b","c","d"]',2,'{"stem":"test","choices":["a","b","c","d"]}','{}',repeat('b',64),1)`, [id,section]);
    }
    await pool.query(`INSERT INTO topik_bank.question_sets(set_id,section,generator_provider,generator_model,generator_version,
      set_sequence,default_target_level,default_predicted_difficulty,set_fingerprint)
      VALUES ($1,'reading','test','test','v1',1,3,0.5,repeat('c',64)),
        ($2,'listening','test','test','v1',1,3,0.5,repeat('d',64))`, [setId,listeningSetId]);
    await pool.query("INSERT INTO topik_bank.question_set_items VALUES ($1,1,$2,1),($3,1,$4,1)", [setId,itemId,listeningSetId,listeningItem]);
    await pool.query(`INSERT INTO topik_app.mock_tests(mock_test_id,slug,title_en,title_ko,description_en,description_ko,
      duration_seconds,question_count,max_score,display_order,is_published) VALUES ($1,'irt-test','Test','시험','','',3600,2,4,1,true)`, [examId]);
    await pool.query("INSERT INTO topik_app.mock_test_sections VALUES ($1,1,'reading',$2),($1,2,'listening',$3)", [examId,setId,listeningSetId]);
    await pool.query("INSERT INTO topik_app.users(user_id) VALUES ($1)", [userId]);
    await pool.query(`INSERT INTO topik_app.sessions(session_id,user_id,mock_test_id,mode,access_token_hash,max_score)
      VALUES ($1,$2,$3,'practice',$4,4)`, [sessionId,userId,examId,createHash("sha256").update(token).digest("hex")]);
    await pool.query(`INSERT INTO topik_app.session_items(session_id,item_order,section,test_position,set_id,item_id,item_version,score_weight,theta_before,theta_after)
      VALUES ($1,1,'reading',1,$2,$3,1,2,0.1,0.2),($1,2,'listening',1,$5,$4,1,2,0.2,0.3)`, [sessionId,setId,itemId,listeningItem,listeningSetId]);
    await repo.saveAnswer({sessionId,token,itemOrder:1,clientEventId:randomUUID(),selectedOption:1});
    await pool.query(`INSERT INTO topik_app.attempt_feedback(session_id,rating,locale,nationality_code,birth_year,topik_reasons,
      korean_study_duration,topik_experience,target_topik_level,survey_version,survey_completed_at,
      survey_privacy_consent,survey_privacy_consent_version,survey_privacy_consented_at)
      VALUES ($1,5,'ko','VN',2000,ARRAY['employment'],'1_to_2_years','none',4,'post_exam_survey_v1',now(),true,'post_exam_survey_v1',now())`, [sessionId]);
    // A completed historical session ensures submitted responses survive too.
    const historical = await repo.createSession(examId,"practice");
    await pool.query("UPDATE topik_app.sessions SET status='submitted',submitted_at=now(),score=2 WHERE session_id=$1", [historical.sessionId]);
    await pool.query(`INSERT INTO topik_app.response_observations(observation_id,user_id,session_id,item_id,item_version,item_order,
      selected_option,is_correct,policy_version,theta_before,theta_after)
      VALUES ($1,$2,$3,$4,1,1,2,true,'STATIC_MOCK_V1',0.1,0.2)`, [randomUUID(),historical.userId,historical.sessionId,itemId]);
    before = await snapshot();
    beforeAnalytics = await analytics();
  }, 30_000);
  afterAll(async () => {
    if (ownsSchema) {
      await pool.query(`DROP SCHEMA topik_app CASCADE; DROP SCHEMA topik_bank CASCADE;
        ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM irt_test_default;
        DROP ROLE IF EXISTS irt_test_owner,irt_test_reader,irt_test_default;`);
    }
    await pool.end();
  });

  it("rolls back on unknown dependencies, then preserves data and view permissions", async () => {
    await pool.query("CREATE VIEW topik_bank.external_dependency AS SELECT * FROM topik_bank.current_items");
    await expect(applyMigration()).rejects.toMatchObject({code:"2BP01"});
    expect(await snapshot()).toEqual(before);
    await pool.query("DROP VIEW topik_bank.external_dependency");
    await applyMigration();
    expect(await snapshot()).toEqual(before);
    expect(await analytics()).toEqual(beforeAnalytics);
    const columns = await pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema IN ('topik_app','topik_bank') AND column_name=ANY($1::text[])`, [removed]);
    expect(columns.rows).toEqual([]);
    expect((await pool.query("SELECT to_regclass('topik_app.theta_estimation_runs') AS name")).rows[0].name).toBeNull();
    const views = await pool.query(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.reloptions,
      has_table_privilege('irt_test_default',c.oid,'SELECT') AS default_access
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='topik_bank' AND c.relname IN ('current_items','current_set_contents') ORDER BY c.relname`);
    expect(views.rows[1]).toMatchObject({owner:"postgres",default_access:true}); // Existing PUBLIC SELECT remains.
    expect(views.rows[0]).toMatchObject({owner:"irt_test_owner",reloptions:["security_barrier=true"],default_access:false});
    expect((await pool.query("SELECT has_table_privilege('irt_test_reader','topik_bank.current_items','SELECT WITH GRANT OPTION') AS allowed")).rows[0].allowed).toBe(true);
    expect((await pool.query("SELECT attacl::text FROM pg_attribute WHERE attrelid='topik_bank.current_set_contents'::regclass AND attname='item_id'")).rows[0].attacl).toContain("irt_test_reader=r/");
    expect((await pool.query("SELECT * FROM topik_bank.current_items")).rowCount).toBe(2);
    expect((await pool.query("SELECT * FROM topik_bank.current_set_contents")).rowCount).toBe(2);
  });

  it("resumes old sessions, changes answers, deduplicates retries and scores without IRT", async () => {
    expect((await repo.getSession(sessionId,token)).questions[0]?.selectedOption).toBe(1);
    const answer = {sessionId,token,itemOrder:1,clientEventId:randomUUID(),selectedOption:2};
    expect(await repo.saveAnswer(answer)).toEqual({accepted:true,submitted:false});
    expect(await repo.saveAnswer(answer)).toEqual({accepted:false,submitted:false});
    await repo.saveAnswer({...answer,clientEventId:randomUUID(),selectedOption:3});
    // A late retry of an earlier request must not restore its older answer.
    expect(await repo.saveAnswer(answer)).toEqual({accepted:false,submitted:false});
    expect((await repo.getSession(sessionId,token)).questions[0]?.selectedOption).toBe(3);
    await repo.saveAnswer({...answer,clientEventId:randomUUID()});
    const events = await pool.query("SELECT event_type,selected_option FROM topik_app.response_events WHERE session_id=$1",[sessionId]);
    expect(events.rows.length).toBeGreaterThan(1);
    expect(events.rows.every((row)=>row.event_type === "answer_selected" && row.selected_option === null)).toBe(true);
    expect((await pool.query("SELECT selection_count FROM topik_app.answer_states WHERE session_id=$1 AND item_order=1",[sessionId])).rows[0].selection_count).toBe(1);
    await repo.submitSession(sessionId,token);
    expect((await pool.query("SELECT score FROM topik_app.sessions WHERE session_id=$1",[sessionId])).rows[0].score).toBe(2);
    const details = await admin.getResponseSession(sessionId);
    expect(details.survey).toMatchObject({nationalityCode:"VN",birthYear:2000});
    expect(details.responses[0]).toMatchObject({isCorrect:true});
    expect(details.responses[0]).not.toHaveProperty("policyVersion");
    expect(details.responses[0]).not.toHaveProperty("answerChanged");
    for (const dataset of ["questions","responses","sessions"] as const) {
      const query = buildAdminExportQuery(dataset,parseAdminExportFilters({status:"submitted"}));
      const rows = (await pool.query(query.text,query.values)).rows;
      expect(rows.length).toBeGreaterThan(0);
      if (dataset === "questions") {
        expect(rows.find((row) => row.item_id === itemId)).toMatchObject({answered_accuracy_pct:"100.00",overall_accuracy_pct:"100.00"});
        expect(rows.find((row) => row.item_id === listeningItem)).toMatchObject({answered_accuracy_pct:null,overall_accuracy_pct:"0.00"});
      }
      for (const row of rows) for (const field of removed) expect(row).not.toHaveProperty(field);
    }
    const fresh = await repo.createSession(examId,"timed");
    await pool.query("UPDATE topik_app.sessions SET expires_at=now()-interval '1 second' WHERE session_id=$1", [fresh.sessionId]);
    expect(await repo.saveAnswer({...answer,...fresh,clientEventId:randomUUID()})).toEqual({accepted:false,submitted:true});
    expect((await pool.query("SELECT bool_and(timed_out) AS expired FROM topik_app.response_observations WHERE session_id=$1", [fresh.sessionId])).rows[0].expired).toBe(true);
  });

  it("revises questions and keeps old session versions while omitting difficulty fields", async () => {
    await admin.reviseQuestionSet(setId,[{position:1,itemId,itemVersion:1,stem:"revised",choices:["a","b","c","d"],
      correctAnswer:3,explanation:"explanation",contentJson:{stem:"revised",choices:["a","b","c","d"]}}]);
    const history = await admin.listQuestionVersions(setId,itemId);
    expect(history.versions).toHaveLength(2);
    expect(history.versions[0]).toMatchObject({itemVersion:2,correctAnswer:3});
    expect(history.versions[0]).not.toHaveProperty("predictedDifficulty");
    const items = await admin.listReadingItems(setId);
    expect(items[0]).not.toHaveProperty("predictedDifficulty");
    expect((await pool.query("SELECT item_version FROM topik_app.session_items WHERE session_id=$1 AND item_order=1",[sessionId])).rows[0].item_version).toBe(1);
  });

  it("removes generation queues atomically and preserves media, playback, and direct generation", async () => {
    vi.spyOn(mediaCleanupWorker,"kick").mockImplementation(()=>undefined);
    const adminId = randomUUID();
    await pool.query("INSERT INTO topik_app.admin_users(admin_user_id,auth_user_id,email_normalized) VALUES ($1,$2,'media@example.test')",[adminId,randomUUID()]);
    await pool.query("UPDATE topik_bank.item_versions SET content_json=$2 WHERE item_id=$1",[listeningItem,{
      question_prompt:"알맞은 그림을 고르십시오.",dialogue_turns:[{speaker:"남자",text:"안녕하세요."}],
      visual_options:[{description:"test",image_prompt:"a tree"}],
    }]);
    const objects = new Map<string,Buffer>();
    const storage = {
      uploadAudio:vi.fn(async(path:string,data:Buffer)=>{ objects.set(path,data); return {bucket:"audio",path,url:`https://example.test/${path}`}; }),
      uploadMedia:vi.fn(async(path:string,data:Buffer)=>{ objects.set(path,data); return {bucket:"images",path,url:`https://example.test/${path}`}; }),
      removeObject:vi.fn(async(_bucket:string,path:string)=>{objects.delete(path);}),
    };
    const synthesizeLiteral = vi.fn(async()=>Buffer.from("speech"));
    const tts = new TtsService({synthesize:vi.fn(),synthesizeLiteral} as never,()=>storage as never,admin,
      async()=>({audio:Buffer.from("mp3"),durationMs:2000}));
    const images = new VisualService({generate:vi.fn(async()=>({data:Buffer.from("image"),mimeType:"image/png",extension:"png"}))} as never,()=>storage as never,admin);
    const style = {speakingRate:1,stylePrompt:""};
    const input = {adminUserId:adminId,itemId:listeningItem,itemVersion:1,optionNumber:1,visualRole:"choice" as const,forceRegenerate:false};
    const audio = await tts.generateGroup(adminId,listeningSetId,listeningItem,false,style);
    const visual = await images.generate(input);
    await pool.query("INSERT INTO topik_app.audio_playback_events(playback_event_id,client_play_id,session_id,audio_asset_id,event_type,play_number) VALUES ($1,$2,$3,$4,'started',1)",[randomUUID(),randomUUID(),sessionId,audio.audioAssetId]);
    const jobId = randomUUID();
    await pool.query("INSERT INTO topik_app.tts_generation_jobs(job_id,item_id,item_version,requested_by,audio_asset_id,status) VALUES ($1,$2,1,$3,$4,'succeeded')",[jobId,listeningItem,adminId,audio.audioAssetId]);
    await pool.query("INSERT INTO topik_app.tts_generation_job_targets(job_id,item_id,item_version) VALUES ($1,$2,1)",[jobId,listeningItem]);
    await pool.query("INSERT INTO topik_app.visual_generation_jobs(job_id,item_id,item_version,option_number,requested_by,model_name,visual_asset_id,status) VALUES ($1,$2,1,1,$3,'fake',$4,'succeeded')",[randomUUID(),listeningItem,adminId,visual.visualAssetId]);
    const tables = ["tts_audio_assets","item_visual_assets","question_set_item_audio_bindings","item_audio_bindings","audio_playback_events"];
    const mediaSnapshot = async()=>Promise.all(tables.map(async table=>(await pool.query(`SELECT * FROM topik_app.${table}`)).rows));
    const mediaBefore = await mediaSnapshot();
    const examBefore = await snapshot();
    migration = await readFile(resolve(process.cwd(),"migrations/021_remove_generation_jobs.sql"),"utf8");
    await pool.query("CREATE VIEW topik_app.external_job_dependency AS SELECT job_id FROM topik_app.tts_generation_jobs");
    await expect(applyMigration()).rejects.toMatchObject({code:"2BP01"});
    expect((await pool.query("SELECT count(*)::int AS n FROM topik_app.tts_generation_job_targets")).rows[0].n).toBe(1);
    await pool.query("DROP VIEW topik_app.external_job_dependency");
    await applyMigration();
    expect(await mediaSnapshot()).toEqual(mediaBefore);
    expect(await snapshot()).toEqual(examBefore);
    expect(objects.size).toBe(2);
    for (const table of ["tts_generation_jobs","tts_generation_job_targets","visual_generation_jobs"]) {
      expect((await pool.query("SELECT to_regclass($1) AS name",[`topik_app.${table}`])).rows[0].name).toBeNull();
    }
    expect(await tts.generateGroup(adminId,listeningSetId,listeningItem,false,style)).toMatchObject({audioAssetId:audio.audioAssetId,reused:true});
    expect(await images.generate(input)).toMatchObject({visualAssetId:visual.visualAssetId,reused:true});
    const nextAudio = await tts.generateGroup(adminId,listeningSetId,listeningItem,true,style);
    expect(nextAudio.audioAssetId).not.toBe(audio.audioAssetId);
    expect((await tts.generateGroup(adminId,listeningSetId,listeningItem,false,style)).audioAssetId).toBe(nextAudio.audioAssetId);
    const nextVisual = await images.generate({...input,forceRegenerate:true});
    expect(nextVisual.visualAssetId).not.toBe(visual.visualAssetId);
    expect((await admin.listListeningItems(listeningSetId,"ready"))[0]).toMatchObject({audioAssetId:nextAudio.audioAssetId});
    expect((await admin.listListeningItems(listeningSetId,"missing"))).toHaveLength(0);
    expect(await admin.listReadingItems(setId)).toHaveLength(1);
    expect(await admin.dashboard()).not.toHaveProperty("jobsQueued");
    // Independent physical connections must contend for the same per-kind lease.
    await withGeneration("tts",async()=>{
      await expect(withGeneration("tts",async()=>true)).rejects.toMatchObject({code:"GENERATION_BUSY"});
      expect(await withGeneration("visual",async()=>true)).toBe(true);
    });
    await new MediaCleanupWorker(()=>storage as never).runOnce();
    expect((await pool.query("SELECT count(*)::int AS n FROM topik_app.audio_playback_events WHERE audio_asset_id=$1",[audio.audioAssetId])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT deleted_at FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1",[audio.audioAssetId])).rows[0].deleted_at).not.toBeNull();
    await admin.deleteAudioGroup(listeningSetId,listeningItem,nextAudio.audioAssetId,storage.removeObject);
    await admin.deleteVisualAsset(listeningItem,1,1,nextVisual.visualAssetId,"choice",storage.removeObject);
    expect(await admin.listListeningItems(listeningSetId,"ready")).toHaveLength(0);
    expect(objects.size).toBe(0);
    const staleImages = new VisualService({generate:async()=>{
      await admin.reviseQuestionSet(listeningSetId,[{position:1,itemId:listeningItem,itemVersion:1,
        stem:"new question",choices:["a","b","c","d"],correctAnswer:2,explanation:"updated",
        contentJson:{question_prompt:"새 질문",dialogue_turns:[{speaker:"남자",text:"새 대본입니다."}],visual_options:[{description:"test",image_prompt:"new tree"}]},
      }]);
      return {data:Buffer.from("stale image"),mimeType:"image/png",extension:"png"};
    }} as never,()=>storage as never,admin);
    await expect(staleImages.generate(input)).rejects.toMatchObject({code:"NOT_FOUND"});
    expect(objects.size).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM topik_app.item_visual_assets WHERE item_id=$1 AND is_current",[listeningItem])).rows[0].n).toBe(0);
  },30_000);
});
