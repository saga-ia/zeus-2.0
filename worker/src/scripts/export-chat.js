// Usage: node src/scripts/export-chat.js <chat_jid> [--out path.jsonl]
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../db');

const chatId = process.argv[2];
if (!chatId) {
  console.error('Usage: npm run export:chat -- <chat_jid> [--out path]');
  process.exit(1);
}
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx > 0 ? process.argv[outIdx + 1] : path.join('logs', `${chatId.replace(/[^a-z0-9]/gi, '_')}.jsonl`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const stream = fs.createWriteStream(outPath);
const rows = db
  .prepare(
    `SELECT message_id, chat_id, direction, type, body, from_me, author_name, timestamp, created_at
     FROM messages WHERE chat_id = ? ORDER BY timestamp ASC`
  )
  .all(chatId);
for (const row of rows) stream.write(JSON.stringify(row) + '\n');
stream.end();
console.log(`Exported ${rows.length} messages to ${outPath}`);
