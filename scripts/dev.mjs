// Mode développement : lance le serveur Vite puis ouvre l'application Electron dessus.
// Les modifications de l'interface s'affichent instantanément.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Interface : ${url}`);

const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('close', async code => {
  await server.close();
  process.exit(code ?? 0);
});
