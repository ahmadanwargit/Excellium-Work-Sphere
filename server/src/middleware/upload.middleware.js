import multer from 'multer';
import { env } from '../config/env.js';

// Files never touch the server filesystem. Express keeps each bounded upload in
// memory just long enough to validate it and stream it to the private bucket.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: env.uploadMaxBytes,
    fields: 16,
    fieldSize: 32 * 1024
  }
});
