import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {I18nProvider} from '../../i18n';
import {marathonApi} from '../../api/marathonApi';
import {MarathonSection} from './MarathonSection';
vi.mock('../../api/marathonApi',()=>({ensureBrowser:vi.fn().mockResolvedValue('token'),marathonApi:{sessions:vi.fn(),start:vi.fn()}}));
function renderSection(){render(<I18nProvider locale="ko"><MemoryRouter><Routes><Route path="/" element={<MarathonSection/>}/><Route path="/marathon/:sessionId" element={<p>마라톤 화면</p>}/></Routes></MemoryRouter></I18nProvider>);}
describe('marathon entry',()=>{
  beforeEach(()=>{vi.mocked(marathonApi.sessions).mockResolvedValue({sessions:[],registered:false});vi.mocked(marathonApi.start).mockReset();vi.mocked(marathonApi.start).mockResolvedValue({sessionId:'new'} as never);});
  it('starts the selected listening section',async()=>{renderSection();await userEvent.click(screen.getByRole('button',{name:'듣기'}));await userEvent.click(screen.getByRole('button',{name:'마라톤 시작'}));expect(await screen.findByText('마라톤 화면')).toBeInTheDocument();expect(marathonApi.start).toHaveBeenCalledWith('token','listening',false);});
  it('offers continue and restart for a saved section without creating an extra session',async()=>{vi.mocked(marathonApi.sessions).mockResolvedValue({registered:true,sessions:[{sessionId:'saved',section:'reading',startedAt:'2026-10-02',answeredCount:8}]});renderSection();await userEvent.click(screen.getByRole('button',{name:'마라톤 시작'}));await screen.findByRole('dialog');expect(marathonApi.start).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('button',{name:'새로 시작'}));expect(await screen.findByText('마라톤 화면')).toBeInTheDocument();expect(marathonApi.start).toHaveBeenCalledWith('token','reading',true);});
});
