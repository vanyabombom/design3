/**
 * Локальный сервер для просмотра dist/. Только для разработки.
 *
 * Отдельно от build.js и без зависимостей. Важная деталь: он умеет отдавать
 * 301 по правилам из dist/_redirects — иначе короткие URL из листа 07 можно
 * будет проверить только после деплоя.
 *
 *   node serve.js          http://localhost:4173
 *   node serve.js 8080     другой порт
 */

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.argv[2]) || 4173;

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Корень сайта внутри dist/.
 *
 * Страницы собираются в подкаталог basePath — у немецкой сборки это
 * /casino/, — и dist/index.html не существует. Открытый localhost:4173
 * отдавал на это 404 голым текстом, хотя сайт рядом и собран.
 *
 * Каталог ищется на диске, а не читается из site.json: серверу незачем
 * знать ни про конфиг, ни про то, из чего basePath складывается. Если
 * подкаталогов с index.html несколько, угадывать нечего — оставляем
 * корень как есть.
 */
async function findBase() {
  if (await isFile(path.join(ROOT, 'index.html'))) return '/';

  try {
    const entries = await readdir(ROOT, { withFileTypes: true });
    const found = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (await isFile(path.join(ROOT, entry.name, 'index.html'))) found.push(`/${entry.name}/`);
    }
    if (found.length === 1) return found[0];
  } catch {
    // dist/ ещё не собран — сообщит первый же запрос
  }
  return '/';
}

const BASE = await findBase();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function loadRedirects() {
  try {
    const raw = await readFile(path.join(ROOT, '_redirects'), 'utf8');
    const map = new Map();
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [from, to] = trimmed.split(/\s+/);
      if (from && to) map.set(from, to);
    }
    return map;
  } catch {
    return new Map();
  }
}

const redirects = await loadRedirects();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // С голого корня — на корень сайта. На проде туда же ведёт nginx,
  // здесь это заменяет необходимость помнить и дописывать /casino/ руками.
  if (pathname === '/' && BASE !== '/') {
    res.writeHead(302, { Location: BASE });
    res.end();
    console.log(`  302  /  ->  ${BASE}`);
    return;
  }

  // Пути без завершающего слеша нормализуем, чтобы /paypal и /paypal/
  // вели себя одинаково — на проде это делает веб-сервер.
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;

  const target = redirects.get(pathname) ?? redirects.get(withSlash);
  if (target) {
    res.writeHead(301, { Location: target });
    res.end();
    console.log(`  301  ${pathname} -> ${target}`);
    return;
  }

  const candidates = path.extname(pathname)
    ? [path.join(ROOT, pathname)]
    : [path.join(ROOT, pathname, 'index.html')];

  for (const file of candidates) {
    if (!path.resolve(file).startsWith(path.resolve(ROOT))) break;
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      res.end(body);
      console.log(`  200  ${pathname}  ${(body.length / 1024).toFixed(1)} КБ`);
      return;
    } catch {
      // пробуем следующий кандидат
    }
  }

  // Страница 404 лежит внутри basePath, а не в корне dist/: раньше её здесь
  // не находили и вместо собранной страницы отдавали слово «404».
  for (const file of [path.join(ROOT, BASE, '404.html'), path.join(ROOT, '404.html')]) {
    if (!(await isFile(file))) continue;
    res.writeHead(404, { 'Content-Type': MIME['.html'] });
    res.end(await readFile(file));
    console.log(`  404  ${pathname}`);
    return;
  }

  res.writeHead(404, { 'Content-Type': MIME['.txt'] });
  res.end('404');
  console.log(`  404  ${pathname}`);
});

server.listen(PORT, () => {
  console.log(`\n  dist/ на http://localhost:${PORT}${BASE === '/' ? '' : BASE}`);
  console.log(redirects.size
    ? `  ${redirects.size} редиректов подхвачено из dist/_redirects\n`
    : '  301 не проверить: site.build.redirectFormat не пишет dist/_redirects\n');
});
