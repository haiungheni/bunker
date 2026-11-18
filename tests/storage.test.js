const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { writeJson, readJson, importLegacyData } = require('../lib/storage');
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
  const validate = (value) => {
    if (!Number.isInteger(value.round) || value.round < 1) throw new Error('Invalid');
    return value;
  };
  fs.writeFileSync(file, JSON.stringify({ round: -1 }));
  assert.deepEqual(readJson(file, validate).value, { round: 1 });
  writeJson(file, { round: 4 }, validate);
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')), { round: 1 });
});

test('legacy game and archive files are copied once without overwriting local data', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-import-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const legacy = path.join(dir, 'data');
  const local = path.join(dir, 'local-data');
  fs.mkdirSync(path.join(legacy, 'history'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'gamestate.json'), '{"round":2}');
  fs.writeFileSync(path.join(legacy, 'history', 'game_example.json'), '{}');
  importLegacyData(legacy, local);
  assert.deepEqual(readJson(path.join(local, 'gamestate.json')).value, { round: 2 });
  assert.ok(fs.existsSync(path.join(local, 'history', 'game_example.json')));
  writeJson(path.join(local, 'gamestate.json'), { round: 3 });
  importLegacyData(legacy, local);
  assert.deepEqual(readJson(path.join(local, 'gamestate.json')).value, { round: 3 });
  assert.deepEqual(readJson(path.join(legacy, 'gamestate.json')).value, { round: 2 });
});
