// node backup.js                               dump rush to backups/rush-<time>.json.gz
// node backup.js restore <file> <db> [--prod]  load a dump into a db; rush only with --prod
// node backup.js nightly                       Cloud Run job: dump rush to the bucket, then rebuild rush-dev from it
// outside prod, keys stay as they were and phones become fake 405-555-01xx numbers
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MongoClient, BSON: { EJSON } } = require('mongodb');

const env = path.join(__dirname, '.env');
if (fs.existsSync(env)) process.loadEnvFile(env);

const PROD = 'rush', DEV = 'rush-dev', BUCKET = 'rush-backups-61436';
const stamp = () => new Date().toISOString().slice(0, 16).replace(':', ''); // rush-2026-10-10T0700, unique per run since the job can't overwrite

async function dump(db) {
  const data = {};
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (!name.startsWith('system.')) data[name] = await db.collection(name).find().toArray();
  }
  return data;
}

// 555-0100..0199 is reserved for fiction, so a tap in dev can't ring anyone; same job, same number every night
const fake = (j) => `405-555-01${String(parseInt(String(j._id).slice(-6), 16) % 100).padStart(2, '0')}`;

async function load(db, data) {
  const prod = db.databaseName === PROD;
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (prod || name !== 'keys') await db.collection(name).drop();
  }
  const done = [];
  for (const [name, docs] of Object.entries(data)) {
    if (!prod && name === 'keys') continue;
    if (!prod && name === 'jobs') for (const j of docs) if (j.phone) j.phone = fake(j);
    if (docs.length) await db.collection(name).insertMany(docs);
    done.push(`${name} ${docs.length}`);
  }
  if (prod && data.keys) await db.collection('keys').createIndex({ key: 1 }, { unique: true });
  return done.join(', ');
}

// zero deps: Cloud Run's metadata server hands out a token for the job's service account
async function upload(name, body) {
  const t = await (await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } })).json();
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${name}`, { method: 'POST', headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/gzip' }, body });
  if (!r.ok) throw new Error(`upload ${r.status} ${await r.text()}`);
}

async function main(client) {
  const [cmd, file, to, flag] = process.argv.slice(2);
  if (cmd === 'restore') {
    if (!file || !to) throw new Error('usage: node backup.js restore <file> <db> [--prod]');
    if (to === PROD && flag !== '--prod') throw new Error('that is the real database; add --prod if you mean it');
    const data = EJSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
    return console.log(`${to}: ${await load(client.db(to), data)}`);
  }
  const data = await dump(client.db(PROD));
  const gz = zlib.gzipSync(EJSON.stringify(data, { relaxed: false }));
  const name = `rush-${stamp()}.json.gz`;
  if (cmd === 'nightly') {
    await upload(name, gz);
    console.log(`gs://${BUCKET}/${name} ${gz.length} bytes`);
    // rebuild dev from the file just uploaded, so every night also proves the backup restores
    return console.log(`${DEV}: ${await load(client.db(DEV), EJSON.parse(zlib.gunzipSync(gz).toString()))}`);
  }
  if (cmd) throw new Error(`unknown command ${cmd}`);
  fs.mkdirSync(path.join(__dirname, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'backups', name), gz);
  console.log(`backups/${name} ${gz.length} bytes`);
}

if (!process.env.MONGODB_URI) {
  console.error('set MONGODB_URI');
  process.exit(1);
}
const client = new MongoClient(process.env.MONGODB_URI);
main(client).catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => client.close());
