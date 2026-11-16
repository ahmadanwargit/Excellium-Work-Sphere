import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { createId } from '../utils/ids.js';
import { HttpError, notFound } from '../utils/http-error.js';

const MIME_BY_KIND = {
  invoice: new Set(['application/pdf']),
  equipment: new Set(['image/jpeg', 'image/png', 'image/webp'])
};

const EXTENSION_BY_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function bytesStartWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * Detects only the formats the portal accepts instead of trusting the MIME type
 * sent by a browser. This is intentionally small and dependency-free.
 */
export function detectFileMimeType(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytesStartWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytesStartWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function assertFileIsAllowed(file, kind, maxBytes) {
  if (!file) return null;
  if (file.size > maxBytes) throw new HttpError(413, `Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller`);
  const detectedMimeType = detectFileMimeType(file.buffer);
  if (!detectedMimeType || !MIME_BY_KIND[kind]?.has(detectedMimeType)) {
    const accepted = kind === 'invoice' ? 'a PDF document' : 'a PNG, JPEG, or WebP image';
    throw new HttpError(415, `Upload ${accepted}`);
  }
  return detectedMimeType;
}

export class StorageService {
  constructor({ client, bucket, maxBytes, signedUrlTtlSeconds, enabled }) {
    this.client = client;
    this.bucket = bucket;
    this.maxBytes = maxBytes;
    this.signedUrlTtlSeconds = signedUrlTtlSeconds;
    this.enabled = enabled;
  }

  static fromEnvironment() {
    const enabled = Boolean(env.supabaseUrl && env.supabaseSecretKey);
    return new StorageService({
      client: enabled ? createClient(env.supabaseUrl, env.supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null,
      bucket: env.supabaseBucket,
      maxBytes: env.uploadMaxBytes,
      signedUrlTtlSeconds: env.signedUrlTtlSeconds,
      enabled
    });
  }

  ensureConfigured() {
    if (!this.enabled) {
      throw new HttpError(503, 'File storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server.');
    }
  }

  async upload({ file, kind, ownerId }) {
    this.ensureConfigured();
    const mimeType = assertFileIsAllowed(file, kind, this.maxBytes);
    const extension = EXTENSION_BY_MIME[mimeType];
    const objectPath = `${kind}/${ownerId}/${createId('file')}.${extension}`;
    const { error } = await this.client.storage.from(this.bucket).upload(objectPath, file.buffer, {
      contentType: mimeType,
      cacheControl: 'private, max-age=0',
      upsert: false
    });

    if (error) throw new HttpError(502, `Supabase storage upload failed: ${error.message}`);
    return {
      bucket: this.bucket,
      path: objectPath,
      originalName: file.originalname,
      mimeType,
      size: file.size,
      uploadedAt: new Date().toISOString()
    };
  }

  async createSignedUrl(file) {
    if (!file?.path) throw notFound('No uploaded file is attached to this record');
    this.ensureConfigured();
    const { data, error } = await this.client.storage.from(file.bucket || this.bucket).createSignedUrl(file.path, this.signedUrlTtlSeconds);
    if (error || !data?.signedUrl) throw new HttpError(502, `Supabase signed URL creation failed: ${error?.message ?? 'unknown error'}`);
    return { url: data.signedUrl, expiresIn: this.signedUrlTtlSeconds };
  }

  async remove(file) {
    if (!this.enabled || !file?.path) return;
    const { error } = await this.client.storage.from(file.bucket || this.bucket).remove([file.path]);
    if (error) console.error(`Unable to clean up Supabase object ${file.path}: ${error.message}`);
  }
}
