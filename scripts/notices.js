import fs from 'node:fs';
import path from 'node:path';

// Preserve dependency copyright and font license notices in the static distribution.
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const notices = [];
for (const [directory, metadata] of Object.entries(lock.packages)) {
  if (!directory || metadata.dev || !fs.existsSync(directory)) continue;
  const files = fs.readdirSync(directory).filter(name => /^(licen[cs]e|copying|notice|ofl)([.-]|$)/i.test(name));
  const contents = files.filter(name => fs.statSync(path.join(directory,name)).isFile()).map(name => fs.readFileSync(path.join(directory,name),'utf8'));
  notices.push(`${directory.replace(/^node_modules\//,'')} ${metadata.version}\nDeclared license: ${metadata.license || 'See package'}\n${contents.join('\n\n')}`);
}
fs.mkdirSync('public',{recursive:true});
fs.writeFileSync('public/THIRD_PARTY_LICENSES.txt',notices.join('\n\n'+'='.repeat(72)+'\n\n'));
console.log(`Preserved notices for ${notices.length} runtime packages.`);
