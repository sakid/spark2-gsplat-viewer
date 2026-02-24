import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGETS = ['src/js', 'src/utils', 'src/css/style.css'];
const LIMIT = 150;

function walk(filePath, out = []) {
  const stat = fs.statSync(filePath);
  if (stat.isFile()) {
    out.push(filePath);
    return out;
  }
  for (const entry of fs.readdirSync(filePath)) {
    walk(path.join(filePath, entry), out);
  }
  return out;
}

const files = TARGETS.flatMap((target) => walk(path.join(ROOT, target))).filter((file) => /\.(js|css)$/.test(file));
const failures = [];

for (const file of files) {
  const lineCount = fs.readFileSync(file, 'utf8').split('\n').length;
  if (lineCount > LIMIT) {
    failures.push({ file, lineCount });
  }
}

if (failures.length > 0) {
  console.error('Line count check failed:');
  for (const failure of failures) {
    console.error(`- ${path.relative(ROOT, failure.file)}: ${failure.lineCount} lines`);
  }
  process.exit(1);
}

console.log(`Line count check passed for ${files.length} files (limit ${LIMIT}).`);
