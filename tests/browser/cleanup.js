const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
module.exports = async () => {
  const dir = process.env.BUNKER_E2E_DATA_DIR;
  if (
    dir &&
    path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir()) &&
    path.basename(dir).startsWith('bunker-e2e-')
  )
    fs.rmSync(dir, { recursive: true, force: true });
};
