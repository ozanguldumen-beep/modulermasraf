const { spawnSync } = require('child_process');

function run(cmd, args, required = true) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    const msg = `${cmd} ${args.join(' ')} failed with exit code ${res.status}`;
    if (required) {
      console.error(msg);
      process.exit(res.status || 1);
    }
    console.warn(msg);
  }
}

run('npx', ['prisma', 'generate'], true);

if (process.env.DATABASE_URL) {
  run('npx', ['prisma', 'db', 'push', '--accept-data-loss'], true);
  run('node', ['prisma/seed.js'], false);
} else {
  console.warn('DATABASE_URL bulunamadı. PostgreSQL bağlı değilse uygulama veri ekranlarında hata verir.');
}

require('../src/server');
