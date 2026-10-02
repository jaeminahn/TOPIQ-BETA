import type { Question } from '../types';
import type { PreregistrationConsent } from '../preregistration';
import { auth, request, requestWithRetry } from './request';

export type MarathonSection = 'reading'|'listening';
export interface MarathonState {
  sessionId:string;section:MarathonSection;registered:boolean;registrationRequired:boolean;
  order:number;phase:'question'|'explanation';question:Question|null;
  result?:{correctAnswer:number;explanation:string;isCorrect:boolean};
}
export interface MarathonSessionSummary {sessionId:string;section:MarathonSection;startedAt:string;answeredCount:number}
const tokenKey = 'unigate.marathon.browser-token';
let creating: Promise<string> | null = null;
export function browserToken() { return localStorage.getItem(tokenKey); }
export async function ensureBrowser(): Promise<string> {
  const existing = browserToken();
  if (existing) return existing;
  const create = async () => {
    const stored=browserToken();
    if(stored)return stored;
    const {token}=await request<{token:string}>('/v1/marathon/browsers',{method:'POST'});
    localStorage.setItem(tokenKey,token);return token;
  };
  // Share first-time identity across simultaneously opened same-origin tabs.
  if (!creating) creating = (navigator.locks ? navigator.locks.request('unigate-marathon-identity',create) : create())
    .finally(() => {creating=null;});
  return creating;
}
const path = (id:string) => `/v1/marathon/sessions/${id}`;
export const marathonApi = {
  sessions(token:string) {return request<{sessions:MarathonSessionSummary[];registered:boolean}>('/v1/marathon/sessions',{headers:auth(token)});},
  start(token:string,section:MarathonSection,restart=false) {
    const requestId = crypto.randomUUID();
    return requestWithRetry(() => request<MarathonState>('/v1/marathon/sessions',{method:'POST',headers:auth(token),body:JSON.stringify({section,restart,requestId})}));
  },
  get(id:string,token:string) {return request<MarathonState>(path(id),{headers:auth(token)});},
  next(id:string,token:string,afterOrder:number) {return requestWithRetry(() => request<MarathonState>(`${path(id)}/next`,{method:'POST',headers:auth(token),body:JSON.stringify({afterOrder})}));},
  answer(id:string,token:string,order:number,input:{requestId:string;selectedOption:number;durationMs:number;selectionCount:number}) {
    return requestWithRetry(() => request<MarathonState>(`${path(id)}/items/${order}/answer`,{method:'PUT',headers:auth(token),body:JSON.stringify(input)}));
  },
  event(id:string,token:string,order:number,eventType:'presented'|'hidden'|'heartbeat'|'selection',durationMs:number,selectedOption?:number) {
    const requestId=crypto.randomUUID();
    return requestWithRetry(() => request<{accepted:boolean}>(`${path(id)}/items/${order}/events`,{method:'POST',headers:auth(token),keepalive:true,body:JSON.stringify({requestId,eventType,durationMs,selectedOption})}));
  },
  preregister(id:string,token:string,input:PreregistrationConsent & {email:string;locale:'ko'|'en'}) {
    return request<{registrationId:string}>(`${path(id)}/preregistration`,{method:'POST',headers:auth(token),body:JSON.stringify(input)});
  },
  audioPlayback(id:string,token:string,audioAssetId:string,clientPlayId:string,eventType:'prepared'|'started'|'completed'|'interrupted') {
    return request<{submitted:boolean;playNumber?:number;maxPlays?:number|null;audioUrl?:string}>(`${path(id)}/audio/${audioAssetId}/playback`,{method:'POST',headers:auth(token),body:JSON.stringify({clientPlayId,eventType})});
  },
};
