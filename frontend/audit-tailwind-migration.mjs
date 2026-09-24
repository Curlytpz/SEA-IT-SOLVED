import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const rootDir = import.meta.dirname;
const srcDir = path.join(rootDir, 'src');

function listFiles(directory, extensions, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) listFiles(fullPath, extensions, output);
    else if (extensions.has(path.extname(entry.name))) output.push(fullPath);
  }
  return output;
}

const sourceFiles = listFiles(srcDir, new Set(['.js', '.jsx', '.ts', '.tsx']));
const cssFiles = listFiles(srcDir, new Set(['.css']));
const sources = sourceFiles.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
const classPattern = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
const classes = new Map();

for (const cssPath of cssFiles) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const tree = postcss.parse(css, { from: cssPath });
  tree.walkRules((rule) => {
    const found = new Set([...rule.selector.matchAll(classPattern)].map((match) => match[1]));
    for (const className of found) {
      const record = classes.get(className) ?? { rules: 0, locations: new Set(), files: new Set() };
      record.rules += 1;
      record.locations.add(`${path.relative(rootDir, cssPath).replaceAll('\\', '/')}:${rule.source?.start?.line ?? 0}`);
      classes.set(className, record);
    }
  });
}

for (const [className, record] of classes) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`);
  for (const source of sources) {
    if (token.test(source.text)) record.files.add(path.relative(rootDir, source.file).replaceAll('\\', '/'));
  }
}

const live = [...classes.entries()]
  .filter(([, record]) => record.files.size > 0)
  .sort((a, b) => b[1].rules - a[1].rules || a[0].localeCompare(b[0]));
const dead = [...classes.entries()]
  .filter(([, record]) => record.files.size === 0)
  .sort((a, b) => a[0].localeCompare(b[0]));

const report = {
  stylesheets: cssFiles.map((file) => ({
    file: path.relative(rootDir, file).replaceAll('\\', '/'),
    lines: fs.readFileSync(file, 'utf8').split(/\r?\n/).length,
  })),
  sourceFiles: sourceFiles.length,
  cssClasses: classes.size,
  liveClasses: live.length,
  deadClasses: dead.length,
  live: live.map(([className, record]) => ({
    className,
    rules: record.rules,
    locations: [...record.locations].sort(),
    files: [...record.files].sort(),
  })),
  dead: dead.map(([className, record]) => ({
    className,
    rules: record.rules,
    locations: [...record.locations].sort(),
  })),
};

if (process.argv.includes('--summary')) {
  console.log(JSON.stringify({
    stylesheets: report.stylesheets,
    sourceFiles: report.sourceFiles,
    cssClasses: report.cssClasses,
    liveClasses: report.liveClasses,
    deadClasses: report.deadClasses,
    dead: report.dead.map(({ className, locations }) => ({ className, locations })),
  }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
