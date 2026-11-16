import multer from 'multer';
import { HttpError } from '../utils/http-error.js';

export function notFoundHandler(_request, response) {
  response.status(404).json({ error: 'API route not found' });
}

export function errorHandler(error, _request, response, _next) {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return response.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file is too large' : `Upload rejected: ${error.message}` });
  }

  const status = error instanceof HttpError ? error.status : 500;
  if (!(error instanceof HttpError)) console.error(error);

  return response.status(status).json({
    error: error instanceof HttpError ? error.message : 'An unexpected server error occurred',
    ...(error instanceof HttpError && error.details ? { details: error.details } : {})
  });
}
