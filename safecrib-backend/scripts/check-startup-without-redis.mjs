import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const portServer = createServer();
portServer.listen(0, '127.0.0.1');
await once(portServer, 'listening');
const address = portServer.address();
if (!address || typeof address === 'string') {
  throw new Error('Could not allocate a local test port');
}
const port = address.port;
await new Promise((resolve, reject) => {
  portServer.close((error) => error ? reject(error) : resolve());
});

const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    REDIS_URL: 'redis://127.0.0.1:1',
    PGBOSS_DATABASE_URL: 'postgresql://test:test@127.0.0.1:6543/postgres',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/postgres',
    DIRECT_URL: 'postgresql://test:test@127.0.0.1:1/postgres',
    JWT_ACCESS_SECRET: 'startup-check-only-secret',
    JWT_REFRESH_SECRET: 'startup-check-only-refresh-secret',
    CLOUDINARY_CLOUD_NAME: 'startup-check',
    CLOUDINARY_API_KEY: 'startup-check-key',
    CLOUDINARY_API_SECRET: 'startup-check-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

let healthy = false;
const deadline = Date.now() + 25_000;
while (Date.now() < deadline && child.exitCode === null) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (response.status === 200) {
      healthy = true;
      console.log('PASS: server bound without Redis and /healthz returned 200');
      break;
    }
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

child.kill('SIGTERM');
let stopTimer;
await Promise.race([
  once(child, 'exit'),
  new Promise((resolve) => {
    stopTimer = setTimeout(resolve, 35_000);
  }),
]);
clearTimeout(stopTimer);
if (child.exitCode === null) child.kill('SIGKILL');
if (!healthy) {
  console.error('FAIL: backend did not become healthy without Redis');
  process.exitCode = 1;
}
