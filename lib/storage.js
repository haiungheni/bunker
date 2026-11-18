const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function writeJson(file, value, validate = (data) => data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const suffix = crypto.randomUUID();
  const temporary = `${file}.${suffix}.tmp`;
  const backupTemporary = `${file}.${suffix}.bak.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // A validated old copy is the recovery point. Never overwrite it with corrupt JSON.
    if (fs.existsSync(file)) {
      const previous = fs.readFileSync(file, 'utf8');
      let valid = true;
      try {
        validate(JSON.parse(previous));
      } catch {
        valid = false;
      }
      if (valid) {
        fs.writeFileSync(backupTemporary, previous, { flag: 'wx' });
        fs.renameSync(backupTemporary, `${file}.bak`);
      }
    }
    fs.renameSync(temporary, file);
  } finally {
    for (const pending of [temporary, backupTemporary]) {
      if (fs.existsSync(pending)) fs.unlinkSync(pending);
    }
  }
}

function importLegacyData(source, target) {
  const marker = path.join(target, '.legacy-imported');
  if (fs.existsSync(marker)) return;
  const copy = (name) => {
    const original = path.join(source, name);
    if (!fs.existsSync(original)) return;
    try {
      fs.copyFileSync(original, path.join(target, name), fs.constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  };
  fs.mkdirSync(path.join(target, 'history'), { recursive: true });
  for (const name of ['gamestate.json', 'games_history.json', 'custom_cards.json']) {
    copy(name);
    copy(`${name}.bak`);
  }
  const history = path.join(source, 'history');
  if (fs.existsSync(history)) {
    for (const entry of fs.readdirSync(history, { withFileTypes: true })) {
      if (entry.isFile() && /^game_[\w-]+\.json(?:\.bak)?$/.test(entry.name))
        copy(path.join('history', entry.name));
    }
  }
  fs.closeSync(fs.openSync(marker, 'a'));
}

function readJson(file, validate = (value) => value) {
  let lastError;
  for (const candidate of [file, `${file}.bak`]) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return {
        value: validate(JSON.parse(fs.readFileSync(candidate, 'utf8'))),
        recovered: candidate !== file,
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return { value: null, recovered: false };
}
module.exports = { writeJson, readJson, importLegacyData };
