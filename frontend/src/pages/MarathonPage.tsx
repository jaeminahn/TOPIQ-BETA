import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { browserToken, marathonApi, type MarathonState } from '../api/marathonApi';
import { ApiError } from '../api/request';
import { Header } from '../components/Header';
import { QuestionCard } from '../components/QuestionCard';
import { ListeningAudioPlayer } from '../components/ListeningAudioPlayer';
import { PreregistrationDialog } from '../components/landing/PreregistrationDialog';
import { useActiveTime } from '../hooks/useActiveTime';
import { useI18n } from '../i18n';

export function MarathonPage() {
  const {sessionId=''} = useParams();
  const {t,locale} = useI18n();
  const token = browserToken() ?? '';
  const [data,setData] = useState<MarathonState|null>(null);
  const [selected,setSelected] = useState<number|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [gate,setGate] = useState(false);
  const inFlight=useRef(false);
  const changes=useRef(0);
  const attempt=useRef<{requestId:string;selectedOption:number;durationMs:number;selectionCount:number}|null>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const apply = useCallback((next:MarathonState) => {setData(next);setSelected(next.question?.selectedOption ?? null);},[]);
  const load = useCallback(async () => {
    if (!token) {setError(t('marathonExpired'));return;}
    try {apply(await marathonApi.get(sessionId,token));setError('');}
    catch (cause) {setError(t(cause instanceof ApiError && cause.status<500 ? 'marathonExpired':'marathonError'));}
  },[sessionId,token,apply,t]);
  useEffect(() => {void load();},[load]);
  useEffect(() => {changes.current=0;attempt.current=null;heading.current?.focus();},[data?.order,data?.phase]);
  const time=useActiveTime(sessionId,token,data?.order ?? 0,Boolean(data?.question && data.phase==='question' && !busy && !gate),marathonApi.event);
  const run = async (operation:()=>Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current=true;setBusy(true);setError('');
    try {await operation();}
    catch (cause) {
      setError(t(cause instanceof ApiError && cause.code==='MARATHON_NO_QUESTIONS' ? 'marathonUnavailable':'marathonError'));
      if (cause instanceof ApiError && cause.code==='MARATHON_REGISTRATION_REQUIRED') setGate(true);
    } finally {inFlight.current=false;setBusy(false);}
  };
  const answer = () => run(async () => {
    if (!data || selected===null) return;
    if (!attempt.current || attempt.current.selectedOption!==selected) attempt.current={requestId:crypto.randomUUID(),selectedOption:selected,durationMs:time.takeDuration(),selectionCount:Math.max(1,changes.current)};
    try {apply(await marathonApi.answer(sessionId,token,data.order,attempt.current));}
    catch (cause) {
      // A lost successful response must not leave an editable, already-final answer on screen.
      try {apply(await marathonApi.get(sessionId,token));} catch { /* The original error remains actionable. */ }
      throw cause;
    }
  });
  const next = () => run(async () => {
    if (!data) return;
    if (data.registrationRequired) {setGate(true);return;}
    const result=await marathonApi.next(sessionId,token,data.order);apply(result);
    if (result.registrationRequired) setGate(true);
  });
  const closeGate = () => {setGate(false);void load();};
  const completeGate = () => {setGate(false);void run(async () => {const current=await marathonApi.get(sessionId,token);apply(current);if (!current.question || current.phase==='explanation') apply(await marathonApi.next(sessionId,token,current.order));});};
  return <main className="min-h-screen bg-gray-50"><Header /><div className="mx-auto max-w-4xl px-4 py-8 sm:px-7">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-primary">{t('marathonTitle')} {data && `· ${t(data.section)}`}</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-2xl font-semibold text-gray-900">{data?.question ? (locale==='ko'?`${data.order}${t('marathonNumber')}`:`${t('marathonNumber')} ${data.order}`):t('marathonTitle')}</h1></div><Link to="/" className="focus-ring rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold">{t('home')}</Link></div>
    {!data && !error && <p role="status">{t('marathonLoading')}</p>}
    {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{error}<button onClick={() => void load()} className="focus-ring ml-3 underline">{t('marathonRetry')}</button></div>}
    {data?.question && <>
      {data.question.audioAssetId && <ListeningAudioPlayer key={`${data.order}-${data.phase}`} sessionId={sessionId} token={token} audioAssetId={data.question.audioAssetId} repeatCount={1} mode="practice" playback={marathonApi.audioPlayback} />}
      <QuestionCard question={{...data.question,selectedOption:selected}} displayNumber={data.order} disabled={busy || data.phase==='explanation'} transcriptMode={data.phase==='explanation'?'visible':'hidden'} showResult={data.result} onAnswer={(option) => {if (option!==selected) changes.current++;setSelected(option);void marathonApi.event(sessionId,token,data.order,'selection',time.takeDuration(),option).catch(() => undefined);}} />
      {data.result && <section className="mt-5 rounded-2xl border border-primary-100 bg-white p-6" aria-label={t('marathonExplanation')}><h2 className={`text-xl font-semibold ${data.result.isCorrect?'text-green-700':'text-orange-700'}`}>{t(data.result.isCorrect?'marathonCorrect':'marathonIncorrect')}</h2><p className="mt-2 font-semibold">{t('correctAnswer')} {data.result.correctAnswer}</p><p className="question-copy mt-4 whitespace-pre-wrap leading-7 text-gray-700">{data.result.explanation || t('marathonMissingExplanation')}</p></section>}
    </>}
    {data && <div className="mt-6"><button type="button" disabled={busy || (data.phase==='question' && Boolean(data.question) && selected===null)} onClick={() => void (data.phase==='question' && data.question ? answer():next())} className="focus-ring min-h-12 w-full rounded-xl bg-primary px-6 py-3 font-semibold text-white disabled:opacity-50">{busy?t('marathonLoading'):t(data.phase==='question' && data.question?'marathonSubmit':'marathonNext')}</button>{data.registrationRequired && <p className="mt-3 text-center text-sm text-gray-600">{t('marathonGate')}</p>}</div>}
  </div>{gate && <PreregistrationDialog description={t('marathonGate')} onClose={closeGate} onComplete={completeGate} onSubmit={(input) => marathonApi.preregister(sessionId,token,input)} />}</main>;
}
