import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../core/db.js';
import { AppError, notFound, unauthorized } from '../core/errors.js';
import { clampActiveDuration, type PublicQuestion } from '../exam/domain.js';
import { SupabaseStorage } from '../media/storage.js';
import { insertPreregistration, type PreregistrationInput } from '../preregistration/repository.js';
import { policyVersion, selectCandidate, targetDifficulty } from './domain.js';
import { inventory } from './inventory.js';

export const browserTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
type Browser = { browser_id: string; answered_count: number; registered_at: Date | null; registration_id: string | null };
type Session = { session_id: string; browser_id: string; section: 'reading'|'listening'; status: string };
type Item = { item_order: number; question_json: PublicQuestion; selected_option: number | null; correct_answer: number;
  explanation: string; is_correct: boolean | null; submitted_at: Date | null; difficulty: number; audio_asset_id: string | null;
  submit_request_id: string | null; selection_count: number };

export async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function browserForToken(client: Pick<PoolClient,'query'>, token: string, lock = false): Promise<Browser> {
  const result = await client.query<Browser>(`SELECT * FROM topik_app.marathon_browsers WHERE token_hash=$1${lock ? ' FOR UPDATE' : ''}`, [browserTokenHash(token)]);
  if (!result.rows[0]) throw unauthorized();
  return result.rows[0];
}
async function sessionForBrowser(client: PoolClient, browser: Browser, id: string): Promise<Session> {
  const {rows} = await client.query<Session>('SELECT * FROM topik_app.marathon_sessions WHERE session_id=$1 AND browser_id=$2 FOR UPDATE',[id,browser.browser_id]);
  if (!rows[0]) throw notFound();
  if (rows[0].status!=='in_progress') throw new AppError(409,'MARATHON_CLOSED','This marathon has been restarted');
  await client.query('UPDATE topik_app.marathon_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE session_id=$1',[id]);
  return rows[0];
}
async function currentItem(client: PoolClient, sessionId: string) {
  return (await client.query<Item>('SELECT * FROM topik_app.marathon_items WHERE session_id=$1 ORDER BY item_order DESC LIMIT 1',[sessionId])).rows[0];
}
function needsRegistration(browser: Browser) { return !browser.registered_at && browser.answered_count>=3; }
function state(browser: Browser, session: Session, item?: Item) {
  const gate = needsRegistration(browser);
  // Even pre-issued questions from another tab must obey the shared free-answer budget.
  const question = item && (!gate || item.submitted_at) ? { ...item.question_json, selectedOption: item.selected_option } : null;
  if (question && !item?.submitted_at) delete question.transcript;
  return {
    sessionId: session.session_id,section: session.section,registered: Boolean(browser.registered_at),
    registrationRequired: gate,order: item?.item_order ?? 0,
    phase: item?.submitted_at ? 'explanation' : 'question',question,
    ...(item?.submitted_at ? { result: { correctAnswer: item.correct_answer,explanation: item.explanation,isCorrect: item.is_correct } } : {}),
  };
}

export class MarathonRepository {
  async createBrowser() {
    const token = randomBytes(32).toString('base64url');
    const browserId = randomUUID();
    await pool.query('INSERT INTO topik_app.marathon_browsers(browser_id,token_hash) VALUES($1,$2)',[browserId,browserTokenHash(token)]);
    return { browserId,token };
  }
  async listSessions(token: string) {
    const browser = await browserForToken(pool,token);
    const {rows} = await pool.query(`SELECT s.session_id AS "sessionId",s.section,s.started_at AS "startedAt",
      (SELECT COUNT(*)::int FROM topik_app.marathon_items mi WHERE mi.session_id=s.session_id AND mi.submitted_at IS NOT NULL) AS "answeredCount"
      FROM topik_app.marathon_sessions s WHERE browser_id=$1 AND status='in_progress'`,[browser.browser_id]);
    return { sessions: rows,registered: Boolean(browser.registered_at) };
  }
  async start(token: string, section: 'reading'|'listening', requestId: string, restart: boolean) {
    return transaction(async (client) => {
      const browser = await browserForToken(client,token,true);
      const previous = (await client.query<Session>('SELECT * FROM topik_app.marathon_sessions WHERE request_id=$1',[requestId])).rows[0];
      if (previous) {
        if (previous.browser_id!==browser.browser_id || previous.section!==section) throw new AppError(409,'REQUEST_CONFLICT','Request already used');
        return state(browser,await sessionForBrowser(client,browser,previous.session_id),await currentItem(client,previous.session_id));
      }
      const active = (await client.query<Session>("SELECT * FROM topik_app.marathon_sessions WHERE browser_id=$1 AND section=$2 AND status='in_progress'",[browser.browser_id,section])).rows[0];
      if (active && !restart) return state(browser,active,await currentItem(client,active.session_id));
      if (active) await client.query("UPDATE topik_app.marathon_sessions SET status='abandoned',abandoned_at=CURRENT_TIMESTAMP WHERE session_id=$1",[active.session_id]);
      const session: Session = {session_id: randomUUID(),browser_id: browser.browser_id,section,status:'in_progress'};
      await client.query('INSERT INTO topik_app.marathon_sessions(session_id,browser_id,section,request_id) VALUES($1,$2,$3,$4)',[session.session_id,browser.browser_id,section,requestId]);
      if (!needsRegistration(browser)) await this.assign(client,browser,session,1);
      return state(browser,session,await currentItem(client,session.session_id));
    });
  }
  private async assign(client: PoolClient, browser: Browser, session: Session, order: number) {
    const recent = (await client.query<{is_correct:boolean}>('SELECT is_correct FROM topik_app.marathon_items WHERE session_id=$1 AND submitted_at IS NOT NULL ORDER BY item_order DESC LIMIT 5',[session.session_id])).rows.map((row) => row.is_correct);
    const target = targetDifficulty(order,recent);
    const selected = selectCandidate((await inventory(client,browser.browser_id)).filter((item) => item.ready && item.section===session.section),target,order);
    // Lock media against concurrent cleanup until its durable reference is inserted.
    if (selected.audioAssetId) {
      const asset = await client.query('SELECT 1 FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1 AND deleted_at IS NULL FOR SHARE',[selected.audioAssetId]);
      if (!asset.rowCount) throw new AppError(409,'MARATHON_MEDIA_CHANGED','Please retry: audio changed');
    }
    if (selected.visualAssetIds.length) {
      const assets = await client.query('SELECT 1 FROM topik_app.item_visual_assets WHERE visual_asset_id=ANY($1::uuid[]) FOR SHARE',[selected.visualAssetIds]);
      if (assets.rowCount!==selected.visualAssetIds.length) throw new AppError(409,'MARATHON_MEDIA_CHANGED','Please retry: image changed');
    }
    await client.query(`INSERT INTO topik_app.marathon_items(session_id,item_order,mock_test_id,set_id,test_position,item_id,item_version,
      difficulty,requested_difficulty,recent_accuracy,policy_version,question_json,correct_answer,explanation,audio_asset_id,visual_asset_ids)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[
      session.session_id,order,selected.mockTestId,selected.setId,selected.position,selected.itemId,selected.itemVersion,
      selected.difficulty,target,recent.length ? recent.filter(Boolean).length/recent.length : null,policyVersion,
      {...selected.question,itemOrder:order},selected.correctAnswer,selected.explanation,selected.audioAssetId,selected.visualAssetIds,
    ]);
  }
  async get(token: string, sessionId: string) {
    return transaction(async (client) => {
      const browser = await browserForToken(client,token,true);
      const session = await sessionForBrowser(client,browser,sessionId);
      return state(browser,session,await currentItem(client,sessionId));
    });
  }
  async next(token: string, sessionId: string, afterOrder: number) {
    return transaction(async (client) => {
      const browser = await browserForToken(client,token,true);
      const session = await sessionForBrowser(client,browser,sessionId);
      const current = await currentItem(client,sessionId);
      const order = current?.item_order ?? 0;
      if (afterOrder>order || afterOrder<order-1) throw new AppError(409,'MARATHON_STALE','Refresh your marathon');
      if (order>afterOrder) return state(browser,session,current);
      if (needsRegistration(browser)) return state(browser,session,current);
      if (current && !current.submitted_at) throw new AppError(409,'MARATHON_ANSWER_REQUIRED','Submit an answer first');
      await this.assign(client,browser,session,order+1);
      return state(browser,session,await currentItem(client,sessionId));
    });
  }
  async answer(token: string, sessionId: string, order: number, input: {requestId:string;selectedOption:number;durationMs:number;selectionCount:number}) {
    return transaction(async (client) => {
      const browser = await browserForToken(client,token,true);
      const session = await sessionForBrowser(client,browser,sessionId);
      const item = await currentItem(client,sessionId);
      if (!item || item.item_order!==order) throw new AppError(409,'MARATHON_STALE','Refresh your marathon');
      if (item.submitted_at) {
        if (item.submit_request_id!==input.requestId || item.selected_option!==input.selectedOption) throw new AppError(409,'MARATHON_ALREADY_ANSWERED','This answer is final');
        return state(browser,session,item);
      }
      if (needsRegistration(browser)) throw new AppError(403,'MARATHON_REGISTRATION_REQUIRED','Preregister to continue');
      await client.query(`UPDATE topik_app.marathon_items SET selected_option=$3,is_correct=($3=correct_answer),submitted_at=CURRENT_TIMESTAMP,
        submit_request_id=$4,response_time_ms=response_time_ms+$5,selection_count=GREATEST(selection_count,$6,1),
        first_selected_at=COALESCE(first_selected_at,CURRENT_TIMESTAMP),final_selected_at=CURRENT_TIMESTAMP
        WHERE session_id=$1 AND item_order=$2`,[sessionId,order,input.selectedOption,input.requestId,clampActiveDuration(input.durationMs),input.selectionCount]);
      await client.query('UPDATE topik_app.marathon_browsers SET answered_count=answered_count+1 WHERE browser_id=$1',[browser.browser_id]);
      browser.answered_count++;
      return state(browser,session,await currentItem(client,sessionId));
    });
  }
  async event(token: string, sessionId: string, order: number, input: {requestId:string;eventType:string;durationMs:number;selectedOption?:number}) {
    return transaction(async (client) => {
      const browser = await browserForToken(client,token,true);
      await sessionForBrowser(client,browser,sessionId);
      const item = await currentItem(client,sessionId);
      if (!item || item.item_order!==order || item.submitted_at || needsRegistration(browser)) return {accepted:false};
      const inserted = await client.query(`INSERT INTO topik_app.marathon_events(request_id,session_id,item_order,event_type,selected_option,duration_ms)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[input.requestId,sessionId,order,input.eventType,input.selectedOption ?? null,clampActiveDuration(input.durationMs)]);
      if (inserted.rowCount) await client.query(`UPDATE topik_app.marathon_items SET response_time_ms=response_time_ms+$3,
        selection_count=selection_count+CASE WHEN $4::smallint IS NOT NULL AND selected_option IS DISTINCT FROM $4 THEN 1 ELSE 0 END,
        selected_option=COALESCE($4,selected_option),
        first_selected_at=CASE WHEN $4::smallint IS NOT NULL THEN COALESCE(first_selected_at,CURRENT_TIMESTAMP) ELSE first_selected_at END,
        final_selected_at=CASE WHEN $4::smallint IS NOT NULL THEN CURRENT_TIMESTAMP ELSE final_selected_at END
        WHERE session_id=$1 AND item_order=$2`,[sessionId,order,clampActiveDuration(input.durationMs),input.selectedOption ?? null]);
      return {accepted:true};
    });
  }
  async register(token: string, sessionId: string, input: PreregistrationInput) {
    return transaction(async (client) => {
      const browser = await browserForToken(client,token,true);
      await sessionForBrowser(client,browser,sessionId);
      if (browser.registered_at) return {registrationId:browser.registration_id};
      const result = await insertPreregistration(client,{...input,source:'marathon',marathonSessionId:sessionId});
      await client.query('UPDATE topik_app.marathon_browsers SET registered_at=CURRENT_TIMESTAMP,registration_id=$2 WHERE browser_id=$1',[browser.browser_id,result.registrationId]);
      return result;
    });
  }
  async playback(token: string, sessionId: string, audioAssetId: string, input: {clientPlayId:string;eventType:string}) {
    return transaction(async (client) => {
      const browser = await browserForToken(client,token,true);
      await sessionForBrowser(client,browser,sessionId);
      const item = await currentItem(client,sessionId);
      if (!item || item.audio_asset_id!==audioAssetId) throw notFound();
      if (!item.submitted_at && needsRegistration(browser)) throw new AppError(403,'MARATHON_REGISTRATION_REQUIRED','Preregister to continue');
      const requestId = createHash('sha256').update(`${input.clientPlayId}:${input.eventType}`).digest('hex');
      const uuid = `${requestId.slice(0,8)}-${requestId.slice(8,12)}-${requestId.slice(12,16)}-${requestId.slice(16,20)}-${requestId.slice(20,32)}`;
      await client.query(`INSERT INTO topik_app.marathon_events(request_id,session_id,item_order,event_type) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[uuid,sessionId,item.item_order,input.eventType]);
      const audio = (await client.query<{storage_path:string}>('SELECT storage_path FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1 AND deleted_at IS NULL',[audioAssetId])).rows[0];
      if (!audio) throw notFound('Audio not available');
      return {submitted:false,maxPlays:null,...(input.eventType==='prepared' ? {audioUrl:await new SupabaseStorage().signedAudioUrl(audio.storage_path)} : {})};
    });
  }
}
