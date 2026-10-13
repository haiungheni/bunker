const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
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
      try {
        JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.copyFileSync(file, `${file}.bak`);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
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
module.exports = { writeJson, readJson };
