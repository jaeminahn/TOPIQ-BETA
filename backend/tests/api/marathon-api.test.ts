import Fastify from 'fastify';
import { describe,expect,it,vi } from 'vitest';
import { ZodError } from 'zod';
import { registerMarathonRoutes } from '../../src/routes/marathon-routes.js';
import { AppError } from '../../src/core/errors.js';

describe('marathon HTTP contracts',()=>{
  it('requires credentials, validates choices and keeps responses private',async()=>{
    const get=vi.fn().mockResolvedValue({phase:'question'});
    const answer=vi.fn();
    const app=Fastify();registerMarathonRoutes(app,{get,answer} as never);
    app.setErrorHandler((error,_request,reply)=>reply.code(error instanceof ZodError?400:error instanceof AppError?error.statusCode:500).send({error:'failed'}));
    const id='10000000-0000-4000-8000-000000000001';
    expect((await app.inject({url:`/v1/marathon/sessions/${id}`})).statusCode).toBe(401);
    const response=await app.inject({url:`/v1/marathon/sessions/${id}`,headers:{authorization:'Bearer browser-token'}});
    expect(response.headers['cache-control']).toBe('no-store');
    expect(get).toHaveBeenCalledWith('browser-token',id);
    expect((await app.inject({method:'PUT',url:`/v1/marathon/sessions/${id}/items/1/answer`,headers:{authorization:'Bearer browser-token'},payload:{requestId:id,selectedOption:5,durationMs:0,selectionCount:1}})).statusCode).toBe(400);
    expect(answer).not.toHaveBeenCalled();await app.close();
  });
});
