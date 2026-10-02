import { pool } from '../../core/db.js';
import { notFound } from '../../core/errors.js';
import { inventory } from '../../marathon/inventory.js';
import { transaction } from '../../marathon/repository.js';
import type { Difficulty } from '../../marathon/domain.js';

export class AdminMarathonRepository {
  async questions(filters: {section?:string;setId?:string;difficulty?:number;page:number}) {
    const all = await inventory(pool);
    const items = all.filter((item) => (!filters.section || item.section===filters.section) && (!filters.setId || item.setId===filters.setId) && (!filters.difficulty || item.difficulty===filters.difficulty));
    const sets = [...new Map(all.map((item) => [item.setId,{setId:item.setId,titleKo:item.titleKo,section:item.section}])).values()];
    return {items:items.slice((filters.page-1)*50,filters.page*50),total:items.length,sets,page:filters.page,pageSize:50};
  }
  async difficulty(adminId: string, setId: string, itemId: string, difficulty: Difficulty | null) {
    return transaction(async (client) => {
      const exists = await client.query('SELECT 1 FROM topik_bank.question_set_items WHERE set_id=$1 AND item_id=$2',[setId,itemId]);
      if (!exists.rowCount) throw notFound();
      await client.query(`INSERT INTO topik_app.marathon_difficulties(set_id,item_id,difficulty,updated_by) VALUES($1,$2,$3,$4)
        ON CONFLICT(set_id,item_id) DO UPDATE SET difficulty=EXCLUDED.difficulty,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`,[setId,itemId,difficulty,adminId]);
      await client.query('INSERT INTO topik_app.marathon_difficulty_audits(set_id,item_id,difficulty,updated_by) VALUES($1,$2,$3,$4)',[setId,itemId,difficulty,adminId]);
      return {updated:true};
    });
  }
  async sessions(filters: {section?:string;page:number}) {
    const where = '($1::text IS NULL OR s.section=$1)';
    const {rows} = await pool.query(`SELECT s.session_id AS "sessionId",s.browser_id AS "browserId",s.section,s.status,
      s.started_at AS "startedAt",s.last_seen_at AS "lastSeenAt",b.registered_at IS NOT NULL AS registered,
      stats.answered_count AS "answeredCount",stats.correct_count AS "correctCount",stats.assigned_count AS "assignedCount"
      FROM topik_app.marathon_sessions s JOIN topik_app.marathon_browsers b USING(browser_id)
      CROSS JOIN LATERAL (SELECT COUNT(*)::int AS assigned_count,COUNT(submitted_at)::int AS answered_count,
        COUNT(*) FILTER(WHERE is_correct)::int AS correct_count FROM topik_app.marathon_items WHERE session_id=s.session_id) stats
      WHERE ${where} ORDER BY s.last_seen_at DESC,s.session_id LIMIT 50 OFFSET $2`,[filters.section ?? null,(filters.page-1)*50]);
    const total = (await pool.query(`SELECT COUNT(*)::int AS total FROM topik_app.marathon_sessions s WHERE ${where}`,[filters.section ?? null])).rows[0].total;
    return {sessions:rows,total,page:filters.page,pageSize:50};
  }
  async responses(sessionId: string, page: number) {
    const {rows} = await pool.query(`SELECT mi.item_order AS "itemOrder",mi.set_id AS "setId",mi.test_position AS "testPosition",
      mi.item_id AS "itemId",mi.item_version AS "itemVersion",mi.difficulty,mi.requested_difficulty AS "requestedDifficulty",
      mi.recent_accuracy AS "recentAccuracy",mi.policy_version AS "policyVersion",mi.question_json AS question,
      mi.selected_option AS "selectedOption",mi.correct_answer AS "correctAnswer",mi.explanation,mi.is_correct AS "isCorrect",
      mi.response_time_ms::float8 AS "responseTimeMs",mi.selection_count AS "selectionCount",mi.submitted_at AS "submittedAt",
      mt.title_ko AS "titleKo"
      FROM topik_app.marathon_items mi JOIN topik_app.mock_tests mt USING(mock_test_id)
      WHERE mi.session_id=$1 ORDER BY mi.item_order DESC LIMIT 50 OFFSET $2`,[sessionId,(page-1)*50]);
    const total = (await pool.query('SELECT COUNT(*)::int AS total FROM topik_app.marathon_items WHERE session_id=$1',[sessionId])).rows[0].total;
    return {items:rows,total,page,pageSize:50};
  }
}
