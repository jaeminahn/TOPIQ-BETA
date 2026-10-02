import { useEffect, useState } from 'react';
import { MessageSquareText, SlidersHorizontal } from 'lucide-react';
import { auth, request } from '../../../api/request';
import type { Question } from '../../../types';
import { QuestionCard } from '../../QuestionCard';
import { AccessibleDialog } from '../../AccessibleDialog';

type Difficulty=1|2|3;
interface InventoryItem {
  setId:string;itemId:string;itemVersion:number;titleKo:string;section:string;position:number;
  defaultDifficulty:Difficulty;overrideDifficulty:Difficulty|null;difficulty:Difficulty;
  answeredCount:number;correctCount:number;ready:boolean;question:Question;correctAnswer:number;explanation:string;
  updatedBy:string|null;updatedAt:string|null;
}
interface Session {sessionId:string;section:string;status:string;startedAt:string;registered:boolean;answeredCount:number;correctCount:number;assignedCount:number}
interface Response {itemOrder:number;titleKo:string;testPosition:number;itemVersion:number;difficulty:Difficulty;requestedDifficulty:Difficulty;recentAccuracy:number|null;policyVersion:string;question:Question;selectedOption:number|null;correctAnswer:number;explanation:string;isCorrect:boolean|null;responseTimeMs:number;selectionCount:number;submittedAt:string|null}
type Preview={question:Question;correctAnswer:number;explanation:string};
const names={1:'쉬움',2:'중급',3:'어려움'};
const control='focus-ring min-h-11 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm';
function query(values:Record<string,string|number|undefined>) {return new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined && v!=='').map(([k,v])=>[k,String(v)])).toString();}

export function AdminMarathonPanel({token}:{token:string}) {
  const [tab,setTab]=useState<'questions'|'responses'>('questions');
  const [section,setSection]=useState('');
  const [setId,setSetId]=useState('');
  const [difficulty,setDifficulty]=useState('');
  const [page,setPage]=useState(1);
  const [refresh,setRefresh]=useState(0);
  const [items,setItems]=useState<InventoryItem[]>([]);
  const [sets,setSets]=useState<Array<{setId:string;titleKo:string;section:string}>>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [total,setTotal]=useState(0);
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState('');
  const [error,setError]=useState('');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [sessionId,setSessionId]=useState('');
  const [responsePage,setResponsePage]=useState(1);
  const [responses,setResponses]=useState<Response[]>([]);
  const [responseTotal,setResponseTotal]=useState(0);
  const [responseBusy,setResponseBusy]=useState(false);
  useEffect(() => {
    let active=true;setBusy(true);setError('');setSessionId('');
    const url=tab==='questions' ? `questions?${query({section,setId,difficulty,page})}`:`sessions?${query({section,page})}`;
    void request<{items?:InventoryItem[];sets?:typeof sets;sessions?:Session[];total:number}>(`/v1/admin/marathon/${url}`,{headers:auth(token)}).then((result)=>{
      if (!active) return;
      setItems(result.items??[]);setSets(result.sets??[]);setSessions(result.sessions??[]);setTotal(result.total);
    }).catch(()=>{if(active)setError('마라톤 데이터를 불러오지 못했습니다.');}).finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[token,tab,section,setId,difficulty,page,refresh]);
  useEffect(()=>{
    if (!sessionId) return;
    let active=true;setResponseBusy(true);setResponses([]);
    void request<{items:Response[];total:number}>(`/v1/admin/marathon/sessions/${sessionId}/responses?page=${responsePage}`,{headers:auth(token)}).then((result)=>{if(active){setResponses(result.items);setResponseTotal(result.total);}}).catch(()=>{if(active)setError('응답 상세를 불러오지 못했습니다.');}).finally(()=>{if(active)setResponseBusy(false);});
    return ()=>{active=false;};
  },[sessionId,responsePage,token]);
  const save=async(item:InventoryItem,value:string)=>{
    setSaving(`${item.setId}:${item.itemId}`);setError('');
    try {await request(`/v1/admin/marathon/sets/${item.setId}/items/${item.itemId}/difficulty`,{method:'PUT',headers:auth(token),body:JSON.stringify({difficulty:value?Number(value):null})});setRefresh((n)=>n+1);}
    catch {setError('난이도를 저장하지 못했습니다.');}finally{setSaving('');}
  };
  return <section className="space-y-5">
    <div className="rounded-2xl border border-gray-200 bg-white p-6"><h2 className="text-xl font-semibold">마라톤 관리</h2><p className="mt-3 text-sm leading-7 text-gray-600">공개 세트에서 준비된 문제를 출제합니다. 기본 난이도는 세트 앞 30% 쉬움, 다음 40% 중급, 마지막 30% 어려움입니다. 처음 3문제는 쉬움, 다음 2문제는 중급입니다. 이후 최근 5문제 정답률이 80% 이상이면 어려움 70%·중급 30%, 40~60%이면 중급 70%·쉬움 30%, 20% 이하이면 쉬움 70%·중급 30%로 출제합니다. 같은 브라우저에서 덜 본 문제를 먼저 고르고, 전체 세트·마라톤 응답 수가 적은 하위 20%(최소 5개)에서 무작위 선택합니다.</p><p className="mt-2 text-sm text-gray-500">수동 난이도는 새 출제부터 적용되며, 문항 버전이 바뀌어도 유지됩니다. 이전 응답은 출제 당시 난이도를 보존합니다. 후보가 없으면 가까운 난이도(동률이면 쉬운 쪽)로 대체하되 첫 3문항은 항상 쉬움입니다.</p></div>
    <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-gray-200 bg-white p-1.5 sm:inline-grid" role="group" aria-label="마라톤 관리 화면">
      {(['questions','responses'] as const).map((value) => {
        const selected = tab === value;
        const Icon = value === 'questions' ? SlidersHorizontal : MessageSquareText;
        return <button
          key={value}
          type="button"
          aria-pressed={selected}
          className={`focus-ring flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors sm:px-5 ${selected ? 'border-primary-200 bg-primary-50 text-primary-dark shadow-sm' : 'border-transparent bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
          onClick={() => {setTab(value);setPage(1);setSetId('');setDifficulty('');}}
        ><Icon aria-hidden="true" className="size-4 shrink-0" /><span className="break-keep">{value === 'questions' ? '문항·난이도' : '마라톤 사용자 응답'}</span></button>;
      })}
    </div>
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">영역<select className={control} value={section} onChange={(e)=>{setSection(e.target.value);setSetId('');setPage(1);}}><option value="">전체 영역</option><option value="reading">읽기</option><option value="listening">듣기</option></select></label>
      {tab==='questions' && <><label className="grid gap-1 text-sm">세트<select className={control} value={setId} onChange={(e)=>{setSetId(e.target.value);setPage(1);}}><option value="">전체 세트</option>{sets.filter((s)=>!section||s.section===section).map((s)=><option key={s.setId} value={s.setId}>{s.titleKo}</option>)}</select></label><label className="grid gap-1 text-sm">적용 난이도<select className={control} value={difficulty} onChange={(e)=>{setDifficulty(e.target.value);setPage(1);}}><option value="">전체 난이도</option>{([1,2,3] as const).map((n)=><option key={n} value={n}>{names[n]}</option>)}</select></label></>}
      <button className={control} disabled={busy} onClick={()=>setRefresh((n)=>n+1)}>새로고침</button></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {busy?<p role="status">불러오는 중…</p>:<div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr>{(tab==='questions'?['세트 / 원본 번호','기본 / 적용','수동 난이도','응답 / 정답률','준비 상태','미리보기']:['영역 / 시작','상태','풀이 / 출제','정답률','사전등록','상세']).map((label)=><th key={label} className="whitespace-nowrap p-4">{label}</th>)}</tr></thead><tbody>
      {tab==='questions'?items.map((item)=><tr key={`${item.setId}:${item.itemId}`} className="border-t border-gray-100"><td className="p-4">{item.titleKo}<span className="block text-gray-500">{item.position}번 · v{item.itemVersion}</span></td><td className="p-4">{names[item.defaultDifficulty]} / <b>{names[item.difficulty]}</b></td><td className="p-4"><select aria-label={`${item.titleKo} ${item.position}번 난이도`} disabled={Boolean(saving)} className={control} value={item.overrideDifficulty??''} onChange={(e)=>void save(item,e.target.value)}><option value="">자동 분류</option>{([1,2,3] as const).map((n)=><option key={n} value={n}>{names[n]}</option>)}</select>{item.updatedAt&&<span title={item.updatedBy??''} className="mt-1 block text-xs text-gray-500">{new Date(item.updatedAt).toLocaleString('ko-KR')}</span>}</td><td className="p-4">{item.answeredCount}회 / {item.answeredCount?`${Math.round(item.correctCount*100/item.answeredCount)}%`:'—'}</td><td className="p-4">{item.ready?'출제 가능':'자료 미완성'}</td><td className="p-4"><button className={control} onClick={()=>setPreview(item)}>문제 보기</button></td></tr>):sessions.map((s)=><tr key={s.sessionId} className="border-t border-gray-100"><td className="p-4">{s.section==='reading'?'읽기':'듣기'}<span className="block text-gray-500">{new Date(s.startedAt).toLocaleString('ko-KR')}</span></td><td className="p-4">{s.status==='in_progress'?'진행 중':'새로 시작으로 종료'}</td><td className="p-4">{s.answeredCount} / {s.assignedCount}</td><td className="p-4">{s.answeredCount?`${Math.round(s.correctCount*100/s.answeredCount)}%`:'—'}</td><td className="p-4">{s.registered?'등록 완료':'미등록'}</td><td className="p-4"><button className={control} onClick={()=>{setSessionId(s.sessionId);setResponsePage(1);}}>응답 보기</button></td></tr>)}
      {!total&&<tr><td colSpan={6} className="p-6 text-center text-gray-500">해당 데이터가 없습니다.</td></tr>}
    </tbody></table></div>}
    <div className="flex items-center gap-3"><button className={control} disabled={busy||page===1} onClick={()=>setPage((n)=>n-1)}>이전</button><span>{page} / {Math.max(1,Math.ceil(total/50))} · {total}개</span><button className={control} disabled={busy||page*50>=total} onClick={()=>setPage((n)=>n+1)}>다음</button></div>
    {sessionId&&<section className="rounded-2xl border border-gray-200 bg-white p-5"><h3 className="font-semibold">문항별 응답</h3>{responseBusy?<p role="status">불러오는 중…</p>:<div className="mt-4 space-y-3">{responses.map((r)=><div key={r.itemOrder} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4"><div><p className="font-semibold">{r.itemOrder}번째 · {r.titleKo} {r.testPosition}번 · v{r.itemVersion}</p><p className="mt-1 text-sm text-gray-600">{r.submittedAt?(r.isCorrect?'정답':'오답'):'미제출'} · 선택 {r.selectedOption??'—'} / 정답 {r.correctAnswer} · {(r.responseTimeMs/1000).toFixed(1)}초 · 선택 {r.selectionCount}회</p><p className="mt-1 text-xs text-gray-500">목표 {names[r.requestedDifficulty]} → 출제 {names[r.difficulty]} · 최근 정답률 {r.recentAccuracy===null?'—':`${Math.round(r.recentAccuracy*100)}%`} · {r.policyVersion}</p></div><button className={control} onClick={()=>setPreview({...r,question:{...r.question,selectedOption:r.selectedOption}})}>문제 보기</button></div>)}</div>}<div className="mt-4 flex gap-3"><button className={control} disabled={responseBusy||responsePage===1} onClick={()=>setResponsePage((n)=>n-1)}>이전 응답</button><span className="py-3">{responsePage} / {Math.max(1,Math.ceil(responseTotal/50))}</span><button className={control} disabled={responseBusy||responsePage*50>=responseTotal} onClick={()=>setResponsePage((n)=>n+1)}>다음 응답</button></div></section>}
    {preview&&<AccessibleDialog title="마라톤 문제 미리보기" closeLabel="닫기" onClose={()=>setPreview(null)}><div className="mt-4 max-h-[70vh] overflow-y-auto"><QuestionCard question={preview.question} disabled transcriptMode="visible" showResult={{correctAnswer:preview.correctAnswer}}/><p className="mt-4 whitespace-pre-wrap text-sm leading-6">정답 {preview.correctAnswer} · {preview.explanation||'해설 없음'}</p></div></AccessibleDialog>}
  </section>;
}
