import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,expect,it,vi} from 'vitest';
import {request} from '../../../api/request';
import {AdminMarathonPanel} from './AdminMarathonPanel';
vi.mock('../../../api/request',()=>({auth:()=>({Authorization:'Bearer admin'}),request:vi.fn()}));
describe('admin marathon',()=>{
  it('edits difficulty and keeps response navigation separate',async()=>{
    vi.mocked(request).mockImplementation(async(path,init)=>{
      if(init?.method==='PUT')return {updated:true};
      if(path.includes('/questions'))return {total:1,sets:[{setId:'set',titleKo:'읽기 1회',section:'reading'}],items:[{setId:'set',itemId:'item',itemVersion:1,titleKo:'읽기 1회',position:2,defaultDifficulty:1,difficulty:1,overrideDifficulty:null,answeredCount:10,correctCount:7,ready:true}]};
      return {sessions:[],total:0};
    });
    render(<AdminMarathonPanel token="admin"/>);
    await userEvent.selectOptions(await screen.findByRole('combobox',{name:'읽기 1회 2번 난이도'}),'3');
    await waitFor(()=>expect(request).toHaveBeenCalledWith('/v1/admin/marathon/sets/set/items/item/difficulty',expect.objectContaining({method:'PUT',body:JSON.stringify({difficulty:3})})));
    await userEvent.click(screen.getByRole('button',{name:'마라톤 사용자 응답'}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith('/v1/admin/marathon/sessions?page=1',expect.anything()));
    expect(screen.getByText('해당 데이터가 없습니다.')).toBeInTheDocument();
  });
});
