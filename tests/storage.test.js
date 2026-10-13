const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { writeJson, readJson } = require('../lib/storage');
test('atomic saves retain a valid backup and recover corrupt or invalid state', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-storage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  writeJson(file, { round: 1 });
  writeJson(file, { round: 2 });
  assert.deepEqual(readJson(file).value, { round: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')), { round: 1 });
  fs.writeFileSync(file, '{broken');
  assert.equal(readJson(file).recovered, true);
  writeJson(file, { round: 3 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')), { round: 1 });
  assert.ok(fs.readdirSync(dir).every((name) => !name.endsWith('.tmp')));
  fs.writeFileSync(file, JSON.stringify({ round: -1 }));
  assert.deepEqual(
    readJson(file, (value) => {
      if (value.round < 1) throw new Error('Invalid');
      return value;
    }).value,
    { round: 1 },
  );
});
