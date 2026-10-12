// one mongo connection for the whole app; MONGODB_DB is `dev` or `prod`
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const env = path.join(__dirname, '.env');
if (!process.env.MONGODB_URI && fs.existsSync(env)) process.loadEnvFile(env);
if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
  console.error('set MONGODB_URI and MONGODB_DB');
  process.exit(1);
}

const name = process.env.MONGODB_DB;
const client = new MongoClient(process.env.MONGODB_URI, { minPoolSize: 2 }); // warm connections so parallel queries skip the handshake
const db = client.db(name);

module.exports = {
  name,
  db,
  connect: () => client.connect(),
  close: () => client.close(),
  ping: () => db.command({ ping: 1 }),
};
