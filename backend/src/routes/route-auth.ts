import { bearerToken } from "../domain.js";
import { AppError } from "../errors.js";

export function requireSessionToken(authorization: string | undefined) {
  const token = bearerToken(authorization);
  if (!token) throw new AppError(401, "SESSION_TOKEN_REQUIRED", "Session token required");
  return token;
}

export function requireResultToken(authorization: string | undefined) {
  const token = bearerToken(authorization);
  if (!token) throw new AppError(401, "RESULT_TOKEN_REQUIRED", "Result token required");
  return token;
}
