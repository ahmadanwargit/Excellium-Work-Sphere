// Vercel's Node function entrypoint. Keep the Express server's ESM boundary
// intact without changing the root workspace's module type or opening a port.
let handlerPromise;

module.exports = async function handler(request, response) {
  handlerPromise ??= import('../server/src/serverless.js').then(({ createServerlessHandler }) => createServerlessHandler());
  const handleRequest = await handlerPromise;
  return handleRequest(request, response);
};
