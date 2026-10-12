// node server.js   start the server
const http = require('http');
const db = require('./db');

const REV = process.env.K_REVISION || 'local';

async function main() {
  await db.connect();
  const port = process.env.PORT || 3000;
  http.createServer(async (req, res) => {
    try {
      const t0 = Date.now();
      await db.ping();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end(`rush v2\ndb ${db.name} · ${Date.now() - t0}ms · rev ${REV}\n`);
    } catch (e) {
      console.error(e);
      res.writeHead(500).end();
    }
  }).listen(port, () => console.log(`serving on port ${port}`));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
