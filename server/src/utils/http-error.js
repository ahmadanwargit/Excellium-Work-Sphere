export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const notFound = (message = 'Resource not found') => new HttpError(404, message);
export const forbidden = (message = 'You do not have permission to perform this action') => new HttpError(403, message);
export const unauthorized = (message = 'Sign in is required') => new HttpError(401, message);
export const conflict = (message) => new HttpError(409, message);
