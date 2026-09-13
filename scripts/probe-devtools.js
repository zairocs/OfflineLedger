const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'debugger-frontend',
  'dist',
  'third-party',
  'front_end',
);
const start = path.join(root, 'entrypoints', 'rn_fusebox', 'rn_fusebox.js');

function grab(code) {
  const out = [];
  const re = /(?:from|import)\s*["']([^"']+)["']|import\(["']([^"']+)["']\)/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1] || m[2]);
  return out;
}

function httpGet(urlPath) {
  return new Promise(resolve => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: 8081,
        path: urlPath,
        timeout: 20000,
        headers: { Accept: '*/*' },
      },
      res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, urlPath }));
      },
    );
    req.on('error', err => resolve({ status: 0, error: err.message, urlPath }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout', urlPath });
    });
  });
}

async function main() {
  const seen = new Set();
  const queue = [start];
  const missing = [];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!fs.existsSync(file)) {
      missing.push(file);
      continue;
    }
    if (!file.endsWith('.js')) continue;
    let code = '';
    try {
      code = fs.readFileSync(file, 'utf8');
    } catch (e) {
      missing.push(`${file} READ:${e.code}`);
      continue;
    }
    const dir = path.dirname(file);
    for (const spec of grab(code)) {
      if (!spec.startsWith('.')) continue;
      let resolved = path.normalize(path.join(dir, spec));
      if (!path.extname(resolved)) resolved += '.js';
      queue.push(resolved);
    }
  }

  console.log('scanned', seen.size, 'missing', missing.length);
  if (missing.length) console.log(missing.slice(0, 20).join('\n'));

  const files = [...seen].filter(f => fs.existsSync(f));
  const failures = [];
  for (const file of files) {
    const rel = file.slice(root.length).replace(/\\/g, '/');
    const urlPath = '/debugger-frontend' + rel;
    const result = await httpGet(urlPath);
    if (result.status !== 200) failures.push(result);
  }

  const extra = [
    '/debugger-frontend/entrypoints/rn_fusebox/rn_fusebox.js',
    '/debugger-frontend/rn_fusebox.js',
    '/entrypoints/rn_fusebox/rn_fusebox.js',
    '/inspector/debug?device=test&page=1',
    '/json/list',
  ];
  for (const urlPath of extra) {
    const result = await httpGet(urlPath);
    console.log(result.status, urlPath, result.error || '');
  }

  console.log('http failures', failures.length);
  console.log(JSON.stringify(failures.slice(0, 30), null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
