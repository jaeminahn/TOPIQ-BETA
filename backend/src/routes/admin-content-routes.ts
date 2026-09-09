import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../admin-auth.js";
import type { AdminRepository } from "../admin-repository.js";
import { requireSessionToken } from "./route-auth.js";

const mockTestParams = z.object({ mockTestId: z.string().uuid() });
const questionSetRevisionParams = z.object({ setId: z.string().uuid(), setVersion: z.coerce.number().int().positive() });

export function registerAdminContentRoutes(app: FastifyInstance, repository: AdminRepository) {
  app.put("/v1/admin/mock-tests/:mockTestId/publish", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { mockTestId } = mockTestParams.parse(request.params);
    const body = z.object({ published: z.boolean() }).parse(request.body);
    return repository.publishMockTest(mockTestId, body.published);
  });

  app.post("/v1/admin/question-sets/:setId/versions/:setVersion/revisions", async (request, reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { setId, setVersion } = questionSetRevisionParams.parse(request.params);
    const body = z.object({
      revisions: z.array(z.object({
        position: z.number().int().min(1).max(50),
        itemId: z.string().uuid(),
        itemVersion: z.number().int().positive(),
        stem: z.string().max(20_000),
        choices: z.array(z.string().max(5_000)).max(4),
        correctAnswer: z.number().int().min(1).max(4),
        explanation: z.string().max(20_000),
        contentJson: z.record(z.string(), z.unknown()),
      })).min(1).max(50),
    }).parse(request.body);
    return reply.code(201).send(await repository.reviseQuestionSet(setId, setVersion, body.revisions));
  });
}
