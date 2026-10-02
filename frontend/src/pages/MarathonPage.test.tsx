import {render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {I18nProvider} from '../i18n';
import {marathonApi,type MarathonState} from '../api/marathonApi';
import {MarathonPage} from './MarathonPage';

vi.mock('../api/marathonApi',()=>({browserToken:()=> 'browser-token',marathonApi:{get:vi.fn(),answer:vi.fn(),next:vi.fn(),event:vi.fn(),preregister:vi.fn(),audioPlayback:vi.fn()}}));
const question:MarathonState={sessionId:'session',section:'reading',registered:false,registrationRequired:false,order:1,phase:'question',question:{itemOrder:1,itemId:'item',itemVersion:1,itemType:'grammar_blank',section:'reading',testPosition:1,stem:'빈칸에 들어갈 말을 고르세요.',passage:'',auxiliaryText:'',questionPrompt:'알맞은 답을 고르세요.',highlightText:'',choices:['가','나','다','라'],selectedOption:null}};
const explanation:MarathonState={...question,order:3,phase:'explanation',registrationRequired:true,question:{...question.question!,itemOrder:3,selectedOption:1},result:{correctAnswer:2,isCorrect:false,explanation:'두 번째 선택지가 정답입니다.'}};
function renderPage(locale:'ko'|'en'='ko'){return render(<I18nProvider locale={locale}><MemoryRouter initialEntries={['/marathon/session']}><Routes><Route path="/marathon/:sessionId" element={<MarathonPage/>}/></Routes></MemoryRouter></I18nProvider>);}
describe('MarathonPage',()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.mocked(marathonApi.get).mockResolvedValue(question);vi.mocked(marathonApi.event).mockResolvedValue({accepted:true});vi.mocked(marathonApi.preregister).mockResolvedValue({registrationId:'003-00000001'});});
  it('requires an answer, records selection changes, and shows an immutable explanation',async()=>{
    vi.mocked(marathonApi.answer).mockResolvedValue({...explanation,order:1,registrationRequired:false});
    renderPage();
    expect(await screen.findByRole('button',{name:'답 제출'})).toBeDisabled();
    const radios=screen.getAllByRole('radio');
    await userEvent.click(radios[0]!);await userEvent.click(radios[1]!);
    await userEvent.click(screen.getByRole('button',{name:'답 제출'}));
    expect(await screen.findByText('두 번째 선택지가 정답입니다.')).toBeInTheDocument();
    expect(marathonApi.answer).toHaveBeenCalledWith('session','browser-token',1,expect.objectContaining({selectedOption:2,selectionCount:2}));
    expect(screen.getAllByRole('radio').every((radio)=>radio.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button',{name:'다음 문제'})).toBeEnabled();
  });
  it('restores the third explanation and keeps the next question locked after closing registration',async()=>{
    vi.mocked(marathonApi.get).mockResolvedValue(explanation);renderPage();
    await screen.findByText('두 번째 선택지가 정답입니다.');
    await userEvent.click(screen.getByRole('button',{name:'다음 문제'}));
    const dialog=await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button',{name:'닫기'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'다음 문제'}));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(marathonApi.next).not.toHaveBeenCalled();
  });
  it('requires a valid email and advances only after server registration succeeds',async()=>{
    vi.mocked(marathonApi.get).mockResolvedValue(explanation);renderPage();
    await userEvent.click(await screen.findByRole('button',{name:'다음 문제'}));
    await userEvent.type(screen.getByRole('textbox',{name:'이메일'}),'invalid');
    await userEvent.click(screen.getByRole('button',{name:'사전등록 신청'}));
    expect(marathonApi.preregister).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByRole('textbox',{name:'이메일'}));
    await userEvent.type(screen.getByRole('textbox',{name:'이메일'}),'user@example.test');
    await userEvent.click(screen.getByRole('button',{name:'사전등록 신청'}));
    await screen.findByRole('dialog',{name:'사전등록 신청이 완료되었습니다.'});
    expect(marathonApi.preregister).toHaveBeenCalledWith('session','browser-token',expect.objectContaining({email:'user@example.test',consentVersion:'preregistration_v1'}));
    vi.mocked(marathonApi.get).mockResolvedValue({...explanation,registered:true,registrationRequired:false});
    vi.mocked(marathonApi.next).mockResolvedValue({...question,order:4,registered:true});
    await userEvent.click(screen.getByRole('button',{name:'확인'}));
    await waitFor(()=>expect(marathonApi.next).toHaveBeenCalledWith('session','browser-token',3));
    expect(await screen.findByRole('button',{name:'답 제출'})).toBeInTheDocument();
  });
  it('renders the English flow and recovers a submitted answer after a lost response',async()=>{
    renderPage('en');await screen.findByRole('button',{name:'Submit answer'});
    await userEvent.click(screen.getAllByRole('radio')[0]!);
    vi.mocked(marathonApi.answer).mockRejectedValue(new Error('network'));
    vi.mocked(marathonApi.get).mockResolvedValue({...explanation,order:1,registrationRequired:false});
    await userEvent.click(screen.getByRole('button',{name:'Submit answer'}));
    expect(await screen.findByRole('button',{name:'Next question'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Submit answer'})).not.toBeInTheDocument();
  });
});
