import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../admin/auth.js';
import { AdminMarathonRepository } from '../../admin/repositories/marathon-repository.js';
import { requireSessionToken } from '../route-auth.js';

const filters = z.object({section:z.enum(['reading','listening']).optional(),page:z.coerce.number().int().min(1).max(1_000_000).default(1)});
export function registerAdminMarathonRoutes(app: FastifyInstance, repository = new AdminMarathonRepository()) {
  app.get('/v1/admin/marathon/questions',async (request,reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    reply.header('Cache-Control','no-store');
    return repository.questions(filters.extend({setId:z.string().uuid().optional(),difficulty:z.coerce.number().int().min(1).max(3).optional()}).parse(request.query));
  });
  app.put('/v1/admin/marathon/sets/:setId/items/:itemId/difficulty',async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const {setId,itemId} = z.object({setId:z.string().uuid(),itemId:z.string().uuid()}).parse(request.params);
    const {difficulty} = z.object({difficulty:z.union([z.literal(1),z.literal(2),z.literal(3)]).nullable()}).parse(request.body);
    return repository.difficulty(admin.adminUserId,setId,itemId,difficulty);
  });
  app.get('/v1/admin/marathon/sessions',async (request,reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    reply.header('Cache-Control','no-store');
    return repository.sessions(filters.parse(request.query));
  });
  app.get('/v1/admin/marathon/sessions/:sessionId/responses',async (request,reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    reply.header('Cache-Control','no-store');
    return repository.responses(z.object({sessionId:z.string().uuid()}).parse(request.params).sessionId,filters.parse(request.query).page);
  });
}
