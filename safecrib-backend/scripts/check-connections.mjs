import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) {
  console.error('REDIS_URL is required to inspect Redis connection counts');
  process.exit(1);
}

const client = new Redis(redisUrl, {
  lazyConnect: true,
  connectionName: 'safecrib-connection-check',
  connectTimeout: 10_000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
client.on('error', (error) => {
  console.error(`Redis connection check failed: ${error.code ?? error.message}`);
});

try {
  await client.connect();
  const response = await client.call('CLIENT', 'LIST');
  if (typeof response !== 'string') {
    throw new Error('Redis CLIENT LIST returned an unexpected response');
  }
  const backendConnections = response
    .split('\n')
    .filter((entry) => /(?:^| )name=safecrib-backend(?: |$)/.test(entry)).length;
  console.log(JSON.stringify({
    redisConnectionsForApp: backendConnections,
    expectedConnectionsPerInstance: 3,
    rollingDeployTargetMaximum: 20,
  }, null, 2));
  if (backendConnections > 20) process.exitCode = 1;
} catch (error) {
  console.error(`Unable to inspect Redis CLIENT LIST: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (client.status === 'ready') await client.quit();
  else client.disconnect();
}
