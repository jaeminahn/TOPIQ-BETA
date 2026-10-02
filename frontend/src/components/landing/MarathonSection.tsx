import { ArrowRight, BookOpen, Headphones, Infinity as InfinityIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureBrowser, marathonApi, type MarathonSection as Section, type MarathonSessionSummary } from '../../api/marathonApi';
import { ApiError } from '../../api/request';
import { useI18n } from '../../i18n';
import { AccessibleDialog } from '../AccessibleDialog';

export function MarathonSection() {
  const {t} = useI18n();
  const navigate = useNavigate();
  const [section,setSection] = useState<Section>('reading');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [resume,setResume] = useState<MarathonSessionSummary|null>(null);
  const inFlight = useRef(false);
  const start = async (restart = false) => {
    if (inFlight.current) return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const token = await ensureBrowser();
      if (!restart) {
        const {sessions} = await marathonApi.sessions(token);
        const existing = sessions.find((item) => item.section===section);
        if (existing) {setResume(existing);return;}
      }
      const result = await marathonApi.start(token,section,restart);
      navigate(`/marathon/${result.sessionId}`);
    } catch (cause) {setError(t(cause instanceof ApiError && cause.code==='MARATHON_NO_QUESTIONS' ? 'marathonUnavailable' : 'marathonError'));}
    finally {inFlight.current=false;setBusy(false);}
  };
  return <section id="marathon" className="scroll-mt-24 px-5 py-16 sm:px-8">
    <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-primary-100 bg-primary-50 p-7 sm:p-10">
      <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl"><InfinityIcon aria-hidden="true" className="mb-4 size-9 text-primary" /><h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">{t('marathonTitle')}</h2><p className="mt-3 leading-7 text-gray-600">{t('marathonBody')}</p><p className="mt-4 text-sm text-primary">{t('marathonHint')}</p></div>
        <div className="w-full shrink-0 md:w-72"><div className="grid grid-cols-2 gap-2" role="group" aria-label={t('sectionSelectLabel')}>
          {(['reading','listening'] as const).map((value) => {const Icon=value==='reading'?BookOpen:Headphones;return <button key={value} type="button" disabled={busy} aria-pressed={section===value} onClick={() => setSection(value)} className={`focus-ring flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold ${section===value?'border-primary bg-white text-primary':'border-transparent text-gray-600'}`}><Icon className="size-4" />{t(value)}</button>;})}
        </div><button type="button" disabled={busy} onClick={() => void start()} className="focus-ring mt-3 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-50">{busy?t('marathonLoading'):t('marathonStart')}<ArrowRight className="size-4" /></button></div>
      </div>{error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
    </div>
    {resume && <AccessibleDialog title={t('marathonResume')} closeLabel={t('close')} busy={busy} onClose={() => setResume(null)}><p className="mt-4 text-sm text-gray-600">{t('marathonResumeBody')}</p><div className="mt-5 grid gap-3"><button data-autofocus className="focus-ring min-h-11 rounded-xl bg-primary px-4 py-3 font-semibold text-white" onClick={() => navigate(`/marathon/${resume.sessionId}`)}>{t('marathonContinue')}</button><button disabled={busy} className="focus-ring min-h-11 rounded-xl border border-gray-300 px-4 py-3 font-semibold" onClick={() => void start(true)}>{t('marathonRestart')}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div></AccessibleDialog>}
  </section>;
}
