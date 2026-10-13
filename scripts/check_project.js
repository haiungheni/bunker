const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scripts = [
  'server.js',
  'lib/game.js',
  'lib/storage.js',
  ...fs
    .readdirSync(path.join(root, 'public/js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => 'public/js/' + f),
];
for (const file of scripts)
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8'));
const all = [...catalog.cards, ...catalog.threats];
if (new Set(all.map((c) => c.id)).size !== all.length) throw new Error('Duplicate card IDs');
for (const card of all) {
  const file = card.folder
    ? path.join(root, 'Jocul_Bunker/Bunker_ro', card.folder, card.filename)
    : path.join(root, 'public', decodeURIComponent(card.image));
  if (!fs.existsSync(file)) throw new Error(`Missing image: ${card.id}`);
}
console.log(`Verified ${scripts.length} JavaScript files and ${all.length} card images.`);
