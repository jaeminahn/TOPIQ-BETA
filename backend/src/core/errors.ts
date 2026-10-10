export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message = "Resource not found") =>
  new AppError(404, "NOT_FOUND", message);

export const unauthorized = () =>
  new AppError(401, "INVALID_SESSION_TOKEN", "Invalid session token");

export const sessionClosed = () =>
  new AppError(409, "SESSION_CLOSED", "This session has already been submitted");

export const invalidResultToken = () =>
  new AppError(401, "INVALID_RESULT_TOKEN", "Invalid result link");

export const resultLinkExpired = () =>
  new AppError(410, "RESULT_LINK_EXPIRED", "This result link has expired");

// A lost COMMIT acknowledgement must never trigger deletion of a possibly bound file.
export class MediaCommitUncertainError extends AppError {
  constructor() { super(502, "MEDIA_COMMIT_UNCERTAIN", "Storage outcome is uncertain. Reload the item before retrying."); }
}
