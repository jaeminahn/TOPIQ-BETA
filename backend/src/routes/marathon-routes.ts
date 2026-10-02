import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MarathonRepository } from '../marathon/repository.js';
import { preregistrationSchema } from '../preregistration/validation.js';
import { requireSessionToken } from './route-auth.js';

const sessionParams = z.object({sessionId:z.string().uuid()});
const itemParams = sessionParams.extend({order:z.coerce.number().int().positive().max(2_147_483_647)});
const requestId = z.string().uuid();
const durationMs = z.number().finite().min(0);

export function registerMarathonRoutes(app: FastifyInstance, repository: MarathonRepository) {
  app.post('/v1/marathon/browsers',async (_request,reply) => reply.header('Cache-Control','no-store').code(201).send(await repository.createBrowser()));
  app.get('/v1/marathon/sessions',async (request,reply) => {
    reply.header('Cache-Control','no-store');
    return repository.listSessions(requireSessionToken(request.headers.authorization));
  });
  app.post('/v1/marathon/sessions',async (request,reply) => {
    const input = z.object({section:z.enum(['reading','listening']),requestId,restart:z.boolean().default(false)}).parse(request.body);
    reply.header('Cache-Control','no-store');
    return repository.start(requireSessionToken(request.headers.authorization),input.section,input.requestId,input.restart);
  });
  app.get('/v1/marathon/sessions/:sessionId',async (request,reply) => {
    reply.header('Cache-Control','no-store');
    return repository.get(requireSessionToken(request.headers.authorization),sessionParams.parse(request.params).sessionId);
  });
  app.post('/v1/marathon/sessions/:sessionId/next',async (request,reply) => {
    const {afterOrder} = z.object({afterOrder:z.number().int().min(0).max(2_147_483_646)}).parse(request.body);
    reply.header('Cache-Control','no-store');
    return repository.next(requireSessionToken(request.headers.authorization),sessionParams.parse(request.params).sessionId,afterOrder);
  });
  app.put('/v1/marathon/sessions/:sessionId/items/:order/answer',async (request,reply) => {
    const {sessionId,order} = itemParams.parse(request.params);
    const input = z.object({requestId,selectedOption:z.number().int().min(1).max(4),durationMs,selectionCount:z.number().int().min(1).max(1_000_000)}).parse(request.body);
    reply.header('Cache-Control','no-store');
    return repository.answer(requireSessionToken(request.headers.authorization),sessionId,order,input);
  });
  app.post('/v1/marathon/sessions/:sessionId/items/:order/events',async (request) => {
    const {sessionId,order} = itemParams.parse(request.params);
    const input = z.object({requestId,eventType:z.enum(['presented','hidden','heartbeat','selection']),durationMs,selectedOption:z.number().int().min(1).max(4).optional()})
      .refine((value) => (value.eventType==='selection') === (value.selectedOption!==undefined)).parse(request.body);
    return repository.event(requireSessionToken(request.headers.authorization),sessionId,order,input);
  });
  app.post('/v1/marathon/sessions/:sessionId/preregistration',async (request,reply) => {
    reply.header('Cache-Control','no-store');
    return repository.register(requireSessionToken(request.headers.authorization),sessionParams.parse(request.params).sessionId,preregistrationSchema.parse(request.body));
  });
  app.post('/v1/marathon/sessions/:sessionId/audio/:audioAssetId/playback',async (request,reply) => {
    const {sessionId,audioAssetId} = sessionParams.extend({audioAssetId:z.string().uuid()}).parse(request.params);
    const input = z.object({clientPlayId:requestId,eventType:z.enum(['prepared','started','completed','interrupted'])}).parse(request.body);
    reply.header('Cache-Control','no-store');
    return repository.playback(requireSessionToken(request.headers.authorization),sessionId,audioAssetId,input);
  });
}
