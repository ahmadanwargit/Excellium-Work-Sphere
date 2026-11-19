// Run before any application imports so npm test cannot use real workspace
// credentials from the shell or a local .env file. SQL tests supply PGlite clients.
process.env.NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'json';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SECRET_KEY = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
