import type { FastifyInstance } from "fastify";
import type { PreregistrationRepository } from "../preregistration/repository.js";
import { preregistrationSchema } from "../preregistration/validation.js";

export function registerPreregistrationRoutes(app: FastifyInstance, repository: PreregistrationRepository) {
  app.post("/v1/preregistrations", async (request, reply) => {
    const input = preregistrationSchema.parse(request.body);
    const result = await repository.registerLanding(input);
    return reply.header("Cache-Control", "no-store").code(201).send(result);
  });
}
