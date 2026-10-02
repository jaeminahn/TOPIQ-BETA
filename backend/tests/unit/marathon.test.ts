import { describe,expect,it } from 'vitest';
import { defaultDifficulty,selectCandidate,targetDifficulty,type Difficulty } from '../../src/marathon/domain.js';

describe('marathon selection policy',()=>{
  it('uses position ratios and mandatory warmup before adaptive questions',()=>{
    expect([1,15,16,35,36,50].map((n)=>defaultDifficulty(n,50))).toEqual([1,1,2,2,3,3]);
    expect([1,2,3,4,5].map((n)=>targetDifficulty(n,[],()=>0))).toEqual([1,1,1,2,2]);
    expect(defaultDifficulty(7,10)).toBe(2);
  });
  it.each([
    [[true,true,true,true,false],3,2],
    [[true,true,true,false,false],2,1],
    [[true,true,false,false,false],2,1],
    [[true,false,false,false,false],1,2],
    [[false,false,false,false,false],1,2],
  ] as const)('uses the recent-five boundary for %j',(recent,primary,secondary)=>{
    expect(targetDifficulty(6,[...recent],()=>0.69)).toBe(primary);
    expect(targetDifficulty(6,[...recent],()=>0.7)).toBe(secondary);
  });
  it('avoids personally seen items before considering global response counts',()=>{
    const fresh={difficulty:2 as Difficulty,personalCount:0,answeredCount:100};
    expect(selectCandidate([fresh,{difficulty:2,personalCount:1,answeredCount:0}],2,8,()=>0)).toBe(fresh);
  });
  it('randomizes among the lowest-response fifth with a minimum pool of five',()=>{
    const items=Array.from({length:50},(_,n)=>({difficulty:1 as Difficulty,personalCount:0,answeredCount:n}));
    expect(selectCandidate(items,1,8,()=>0.999).answeredCount).toBe(9);
    expect(selectCandidate(items.slice(0,10),1,8,()=>0.999).answeredCount).toBe(4);
  });
  it('falls back toward easier ties and repeats after exhaustion but never warms up with medium',()=>{
    const items=([1,3] as const).map((difficulty)=>({difficulty,personalCount:4,answeredCount:3}));
    expect(selectCandidate(items,2,6,()=>0).difficulty).toBe(1);
    expect(()=>selectCandidate([items[1]!],1,1)).toThrow('No ready questions');
    expect(()=>selectCandidate([],2,6)).toThrow('No ready questions');
  });
});
