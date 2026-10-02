import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';

vi.mock('../../src/core/db.js',async()=>{
  const {Pool}=await import('pg');
  return {pool:new Pool({connectionString:process.env.MARATHON_TEST_DATABASE_URL ?? 'postgresql://localhost:1/unavailable',max:8})};
});
vi.mock('../../src/media/storage.js',()=>({SupabaseStorage:class{async signedAudioUrl(){return 'https://example.test/signed-audio';}}}));
import { pool } from '../../src/core/db.js';
import { MarathonRepository } from '../../src/marathon/repository.js';
import { inventory } from '../../src/marathon/inventory.js';
import { AdminMarathonRepository } from '../../src/admin/repositories/marathon-repository.js';
import { AdminPreregistrationRepository } from '../../src/admin/preregistrations/repository.js';
import { PreregistrationRepository } from '../../src/preregistration/repository.js';
import { AdminExportRepository,buildAdminExportQuery,parseAdminExportFilters } from '../../src/admin/export.js';
import { TopikRepository } from '../../src/exam/repository.js';
import { MediaCleanupWorker } from '../../src/media/cleanup-worker.js';
import { queueMediaCleanup } from '../../src/media/cleanup-queue.js';

const repo=new MarathonRepository();
const admin=new AdminMarathonRepository();
const exports=new AdminExportRepository();
const registration=()=>({email:'marathon@example.test',locale:'ko' as const,requestId:randomUUID(),consentVersion:'preregistration_v1' as const});
const answerInput=()=>({requestId:randomUUID(),selectedOption:1,durationMs:900,selectionCount:1});
type State=Awaited<ReturnType<typeof repo.get>>;
async function solve(token:string,state:State){return repo.answer(token,state.sessionId,state.order,answerInput());}
async function setup(){const browser=await repo.createBrowser();const session=await repo.start(browser.token,'reading',randomUUID(),false);return {...browser,session};}

describe.skipIf(!process.env.MARATHON_TEST_DATABASE_URL)('marathon in disposable PostgreSQL',()=>{
  beforeAll(async()=>{
    const {rows}=await pool.query("SELECT current_database() AS name,to_regclass('topik_app.marathon_items') AS ready");
    if(rows[0].name!=='unigate_marathon_test'||!rows[0].ready) throw new Error('Use only the migrated disposable unigate_marathon_test database');
  });
  beforeEach(async()=>{
    await pool.query('TRUNCATE topik_app.marathon_browsers,topik_app.marathon_difficulties,topik_app.marathon_difficulty_audits CASCADE');
  });
  afterAll(async()=>{await pool.end();});

  it('enforces the gate across restart and sections, registers exactly once, and resumes medium questions',async()=>{
    const {token,session}=await setup();
    let state=session;
    expect(state.question).not.toHaveProperty('correctAnswer');
    expect(state.question).not.toHaveProperty('transcript');
    for(let n=1;n<=3;n++){
      expect(state.order).toBe(n);
      const row=(await pool.query('SELECT difficulty FROM topik_app.marathon_items WHERE session_id=$1 AND item_order=$2',[state.sessionId,n])).rows[0];
      expect(row.difficulty).toBe(1);
      state=await solve(token,state);
      expect(state.phase).toBe('explanation');expect(state.result?.correctAnswer).toBeGreaterThan(0);
      if(n<3)state=await repo.next(token,state.sessionId,n);
    }
    const blocked=await repo.next(token,state.sessionId,3);
    expect(blocked.registrationRequired).toBe(true);expect(blocked.order).toBe(3);expect(blocked.result).toBeDefined();
    const other=await repo.start(token,'listening',randomUUID(),false);
    expect(other.question).toBeNull();expect(other.registrationRequired).toBe(true);
    const input=registration();
    const registered=await Promise.all(Array.from({length:6},()=>repo.register(token,state.sessionId,input)));
    expect(new Set(registered.map((row)=>row.registrationId)).size).toBe(1);
    expect(registered[0]?.registrationId).toMatch(/^003-\d{8}$/);
    state=await repo.next(token,state.sessionId,3);
    expect(state.order).toBe(4);expect(state.registrationRequired).toBe(false);
    expect((await pool.query('SELECT difficulty FROM topik_app.marathon_items WHERE session_id=$1 AND item_order=4',[state.sessionId])).rows[0].difficulty).toBe(2);
    const restarted=await repo.start(token,'reading',randomUUID(),true);
    expect(restarted.order).toBe(1);expect(restarted.registered).toBe(true);
    const list=await new AdminPreregistrationRepository().list({source:'marathon',deduplicate:false,search:''},{page:1,pageSize:50});
    expect(list.total).toBe(1);expect(list.registrations[0]?.sourceCode).toBe('003');
    const landing=await new PreregistrationRepository().registerLanding({...registration(),email:'landing@example.test'});
    expect(landing.registrationId).toMatch(/^001-/);
  });

  it('does not reset the free-answer count when starting a new marathon',async()=>{
    const {token,session}=await setup();
    let state=await solve(token,session);
    state=await repo.start(token,'reading',randomUUID(),true);
    state=await solve(token,state);
    state=await repo.start(token,'reading',randomUUID(),true);
    state=await solve(token,state);
    expect((await repo.start(token,'reading',randomUUID(),true)).registrationRequired).toBe(true);
    expect((await repo.listSessions(token)).registered).toBe(false);
  });

  it('serializes concurrent start, answer, next, and event retries and freezes submitted timing',async()=>{
    const {token,session}=await setup();
    await expect(repo.next(token,session.sessionId,1)).rejects.toMatchObject({code:'MARATHON_ANSWER_REQUIRED'});
    const event={requestId:randomUUID(),eventType:'heartbeat',durationMs:1500};
    await Promise.all([repo.event(token,session.sessionId,1,event),repo.event(token,session.sessionId,1,event)]);
    const input={...answerInput(),selectionCount:3};
    const answers=await Promise.all(Array.from({length:6},()=>repo.answer(token,session.sessionId,1,input)));
    expect(answers.every((s)=>s.phase==='explanation')).toBe(true);
    expect((await repo.event(token,session.sessionId,1,{...event,requestId:randomUUID()})).accepted).toBe(false);
    const stored=(await pool.query('SELECT response_time_ms,selection_count FROM topik_app.marathon_items WHERE session_id=$1',[session.sessionId])).rows[0];
    expect(Number(stored.response_time_ms)).toBe(2400);expect(stored.selection_count).toBe(3);
    await expect(repo.answer(token,session.sessionId,1,answerInput())).rejects.toMatchObject({code:'MARATHON_ALREADY_ANSWERED'});
    const next=await Promise.all(Array.from({length:6},()=>repo.next(token,session.sessionId,1)));
    expect(next.every((s)=>s.order===2)).toBe(true);
    expect((await repo.get(token,session.sessionId)).question?.itemId).toBe(next[0]?.question?.itemId);
    expect(next[0]?.question?.itemId).not.toBe(session.question?.itemId);
    const secondBrowser=await repo.createBrowser();
    await expect(repo.get(secondBrowser.token,session.sessionId)).rejects.toMatchObject({statusCode:404});
    const startId=randomUUID();
    const starts=await Promise.all(Array.from({length:5},()=>repo.start(token,'reading',startId,true)));
    expect(new Set(starts.map((s)=>s.sessionId)).size).toBe(1);
  });

  it('retains the assigned snapshot when an admin changes difficulty and restores automatic classification',async()=>{
    const {token,session}=await setup();
    const row=(await pool.query('SELECT * FROM topik_app.marathon_items WHERE session_id=$1',[session.sessionId])).rows[0];
    await admin.difficulty(randomUUID(),row.set_id,row.item_id,3);
    let current=(await admin.questions({setId:row.set_id,page:1})).items.find((i)=>i.itemId===row.item_id)!;
    expect(current.difficulty).toBe(3);expect(current.overrideDifficulty).toBe(3);
    expect((await pool.query('SELECT difficulty FROM topik_app.marathon_items WHERE session_id=$1',[session.sessionId])).rows[0].difficulty).toBe(1);
    expect((await repo.get(token,session.sessionId)).question).toEqual(session.question);
    await admin.difficulty(randomUUID(),row.set_id,row.item_id,null);
    current=(await admin.questions({setId:row.set_id,page:1})).items.find((i)=>i.itemId===row.item_id)!;
    expect(current.overrideDifficulty).toBeNull();expect(current.difficulty).toBe(current.defaultDifficulty);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM topik_app.marathon_difficulty_audits')).rows[0].n).toBe(2);
  });

  it('hides listening transcripts until submission and preserves replaced audio during an active marathon',async()=>{
    const assetId=randomUUID();
    const sourceHash=assetId.replaceAll('-','').padEnd(64,'0');
    await pool.query(`INSERT INTO topik_app.tts_audio_assets(audio_asset_id,source_hash,model_name,female_voice,male_voice,storage_bucket,storage_path,storage_url,byte_size)
      VALUES($1,$2,'marathon-test','test-f','test-m','test','marathon-test.mp3','https://example.test/audio',10)`,[assetId,sourceHash]);
    await pool.query(`UPDATE topik_app.mock_tests mt SET is_published=TRUE FROM topik_app.mock_test_sections mts WHERE mt.mock_test_id=mts.mock_test_id AND mts.section='listening'`);
    await pool.query(`INSERT INTO topik_app.question_set_item_audio_bindings(set_id,position,audio_asset_id,source_hash,is_current)
      SELECT qsi.set_id,qsi.position,$1,$2,TRUE FROM topik_bank.question_set_items qsi JOIN topik_app.mock_test_sections mts USING(set_id)
      WHERE mts.section='listening'`,[assetId,sourceHash]);
    try {
      const {token}=await repo.createBrowser();
      let session=await repo.start(token,'listening',randomUUID(),false);
      expect(session.question?.audioAssetId).toBe(assetId);
      expect(session.question).not.toHaveProperty('transcript');
      const audio=await repo.playback(token,session.sessionId,assetId,{clientPlayId:randomUUID(),eventType:'prepared'});
      expect(audio.audioUrl).toBe('https://example.test/signed-audio');
      session=await solve(token,session);
      expect(session.question?.transcript?.length).toBeGreaterThan(0);
      await pool.query('DELETE FROM topik_app.question_set_item_audio_bindings WHERE audio_asset_id=$1',[assetId]);
      await queueMediaCleanup(pool,'audio',[{assetId,bucket:'test',path:'marathon-test.mp3'}]);
      const removeObject=vi.fn();
      await new MediaCleanupWorker(()=>({removeObject}) as never).runOnce();
      expect(removeObject).not.toHaveBeenCalled();
      expect((await repo.playback(token,session.sessionId,assetId,{clientPlayId:randomUUID(),eventType:'prepared'})).audioUrl).toBeTruthy();
      expect((await inventory(pool)).filter((item)=>item.section==='listening'&&item.ready)).toHaveLength(0);
    } finally {
      await pool.query(`UPDATE topik_app.mock_tests mt SET is_published=FALSE FROM topik_app.mock_test_sections mts WHERE mt.mock_test_id=mts.mock_test_id AND mts.section='listening'`);
      await pool.query('DELETE FROM topik_app.media_cleanup_jobs WHERE asset_id=$1',[assetId]);
      await pool.query('DELETE FROM topik_app.question_set_item_audio_bindings WHERE audio_asset_id=$1',[assetId]);
      await pool.query('DELETE FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1',[assetId]);
    }
  });

  it('keeps question snapshots and manual difficulty across a new item version',async()=>{
    const {token,session}=await setup();
    const row=(await pool.query('SELECT * FROM topik_app.marathon_items WHERE session_id=$1',[session.sessionId])).rows[0];
    const nextVersion=(await pool.query('SELECT MAX(item_version)+1 AS version FROM topik_bank.item_versions WHERE item_id=$1',[row.item_id])).rows[0].version;
    await admin.difficulty(randomUUID(),row.set_id,row.item_id,3);
    await pool.query(`INSERT INTO topik_bank.item_versions SELECT (jsonb_populate_record(NULL::topik_bank.item_versions,to_jsonb(iv)||jsonb_build_object('item_version',$3::int,'content_hash',$4::text,'explanation','New version explanation'))).*
      FROM topik_bank.item_versions iv WHERE item_id=$1 AND item_version=$2`,[row.item_id,row.item_version,nextVersion,randomUUID().replaceAll('-','').padEnd(64,'0')]);
    try {
      await pool.query('UPDATE topik_bank.question_set_items SET item_version=$3 WHERE set_id=$1 AND item_id=$2',[row.set_id,row.item_id,nextVersion]);
      const item=(await admin.questions({setId:row.set_id,page:1})).items.find((i)=>i.itemId===row.item_id)!;
      expect(item.itemVersion).toBe(nextVersion);expect(item.difficulty).toBe(3);
      expect((await repo.get(token,session.sessionId)).question?.itemVersion).toBe(row.item_version);
    } finally {
      await pool.query('UPDATE topik_bank.question_set_items SET item_version=$3 WHERE set_id=$1 AND item_id=$2',[row.set_id,row.item_id,row.item_version]);
      await pool.query('DELETE FROM topik_bank.item_versions WHERE item_id=$1 AND item_version=$2',[row.item_id,nextVersion]);
    }
  });

  it('exports submitted answers from active marathons, combines sources, and matches previews for every dataset',async()=>{
    const {token,session}=await setup();
    await solve(token,session);
    await repo.next(token,session.sessionId,1);
    const raw=(await pool.query('SELECT mock_test_id FROM topik_app.marathon_items WHERE session_id=$1',[session.sessionId])).rows[0];
    const set=await new TopikRepository().createSession(raw.mock_test_id,'practice',token);
    await new TopikRepository().saveAnswer({sessionId:set.sessionId,token:set.token,itemOrder:1,clientEventId:randomUUID(),selectedOption:1,durationMs:500});
    await new TopikRepository().submitSession(set.sessionId,set.token);
    const legacyRegistration=await new TopikRepository().registerResultPreregistration({...registration(),sessionId:set.sessionId,token:set.token});
    expect(legacyRegistration.registrationId).toMatch(/^002-/);
    for(const dataset of ['questions','responses','sessions'] as const){
      for(const source of ['set','marathon','all'] as const){
        const filters=parseAdminExportFilters({source});
        const query=buildAdminExportQuery(dataset,filters);
        const {rows}=await pool.query(query.text,query.values);
        expect(rows.length).toBeGreaterThan(0);
        expect((await exports.preview(dataset,filters)).rowCount).toBe(rows.length);
        const chunks:Buffer[]=[];
        for await(const chunk of exports.csvStream(dataset,filters))chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString('utf8')).toContain('"source"');
        if(source==='all')expect(new Set(rows.map((r)=>r.source))).toEqual(new Set(['set','marathon']));
      }
    }
    const filters=parseAdminExportFilters({source:'marathon',status:'in_progress',outcome:'answered'});
    expect((await exports.preview('responses',filters)).rowCount).toBe(1);
    const sessionQuery=buildAdminExportQuery('sessions',parseAdminExportFilters({source:'marathon'}));
    const sessionRows=await pool.query(sessionQuery.text,sessionQuery.values);
    expect(sessionRows.rows[0]).toMatchObject({total_items:2,answered_count:1,unanswered_count:1});
    const sessions=await admin.sessions({page:1});expect(sessions.sessions[0]?.answeredCount).toBe(1);
    const detail=await admin.responses(session.sessionId,1);expect(detail.items[0]?.policyVersion).toBe('MARATHON_V1');
    const before=(await inventory(pool)).find((i)=>i.mockTestId===raw.mock_test_id && i.position===1)!;
    expect(before.answeredCount).toBeGreaterThanOrEqual(1);
    expect((await inventory(pool,set.userId)).length).toBeGreaterThan(0);
  });
});
