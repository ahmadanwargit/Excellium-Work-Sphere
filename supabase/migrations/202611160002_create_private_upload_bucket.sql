-- Creates the private bucket used by the Express-only upload service.
-- React never receives storage credentials or direct bucket policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'excellium-uploads',
  'excellium-uploads',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Do not add anon/authenticated policies. Uploads, deletes, and signed URLs are
-- mediated by Express with a server-only Supabase secret key.
