import { HttpError } from '../utils/http-error.js';

export function notFoundHandler(_request, response) {
  response.status(404).json({ error: 'API route not found' });
}

export function errorHandler(error, _request, response, _next) {
  const status = error instanceof HttpError ? error.status : 500;
  if (!(error instanceof HttpError)) console.error(error);

  response.status(status).json({
    error: error instanceof HttpError ? error.message : 'An unexpected server error occurred',
    ...(error instanceof HttpError && error.details ? { details: error.details } : {})
  });
}
