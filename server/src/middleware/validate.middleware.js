import { HttpError } from '../utils/http-error.js';

export function validate(schema) {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return next(new HttpError(400, 'Request validation failed', parsed.error.flatten()));
    }
    request.validated = parsed.data;
    return next();
  };
}
