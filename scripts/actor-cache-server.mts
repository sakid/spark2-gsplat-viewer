import { ACTOR_CACHE_SERVER_HOST, ACTOR_CACHE_SERVER_PORT, startActorCacheServer } from './lib/actor-cache.mts';

const server = await startActorCacheServer({
  host: ACTOR_CACHE_SERVER_HOST,
  port: ACTOR_CACHE_SERVER_PORT
});

console.log(`Actor cache server listening on http://${ACTOR_CACHE_SERVER_HOST}:${ACTOR_CACHE_SERVER_PORT}`);

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
