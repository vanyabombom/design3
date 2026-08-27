/**
 * sitemap.xml, robots.txt и файлы редиректов.
 *
 * Редиректы генерируются из тех же данных, что и страницы, поэтому короткий URL
 * не может «потеряться»: если терм переименован, его 301 переедет вместе с ним.
 */

import { esc } from './util.js';

const PRIORITY_MAP = { 1: '0.9', 2: '0.7', 3: '0.5', 5: '0.1' };

export function buildSitemap(pages, { domain, lastmodFor }) {
  const entries = pages
    .filter((page) => page.inSitemap && !page.noindex)
    .map((page) => {
      const lastmod = lastmodFor(page);
      return [
        '  <url>',
        `    <loc>${esc(domain)}${esc(page.url)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        `    <priority>${PRIORITY_MAP[page.priority] ?? '0.5'}</priority>`,
        '  </url>',
      ].filter(Boolean).join('\n');
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'.replace('www.sitemap.org', 'www.sitemaps.org'),
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

export function buildRobots({ domain, affiliateBase, disallowAll = false }) {
  // Демо-выкладка: авторы — заглушки, партнёрские ссылки не боевые. Индексировать
  // это рано, иначе в выдачу попадёт черновик, который потом придётся выбивать.
  if (disallowAll) {
    return [
      '# Демонстрационная выкладка. Снимается через site.deploy.demo = false.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  return [
    'User-agent: *',
    'Allow: /',
    // Точки выхода на офферы в индексе не нужны: это не контент, а перенаправление.
    affiliateBase ? `Disallow: ${affiliateBase}` : null,
    '',
    `Sitemap: ${domain}/sitemap.xml`,
    '',
  ].filter((line) => line !== null).join('\n');
}

/** Apache. Формат выбирается в site.build.redirectFormat. */
export function buildHtaccess(redirects) {
  const lines = [
    '# Сгенерировано build.js. Руками не править — перезапишется на следующей сборке.',
    '# Короткие URL эталона (лист 07) и синонимы термов ведут на канон,',
    '# вместо того чтобы существовать отдельными дублирующими страницами.',
    '',
    '<IfModule mod_rewrite.c>',
    '  RewriteEngine On',
  ];

  for (const redirect of redirects) {
    lines.push(`  # ${redirect.reason}`);
    lines.push(`  RewriteRule ^${redirect.from.replace(/^\//, '').replace(/\/$/, '')}/?$ ${redirect.to} [R=301,L]`);
  }

  lines.push('</IfModule>', '');
  return lines.join('\n');
}

/**
 * nginx. Два файла в http-контекст (/etc/nginx/conf.d/), потому что map живёт
 * только там. Оба кладутся РЯДОМ с webroot, а не внутрь него: конфиг сервера,
 * лежащий в dist/, скачивается по прямой ссылке.
 *
 * Каждый адрес пишется в двух вариантах — со слэшем и без. nginx сравнивает
 * ключи map точно, и /bitcoin без слэша иначе уедет в 404 вместо 301.
 */
export function buildNginxMap(redirects) {
  const entries = [];
  const seen = new Map();
  const collisions = [];

  for (const redirect of redirects) {
    const withSlash = redirect.from.endsWith('/') ? redirect.from : `${redirect.from}/`;
    for (const key of [withSlash, withSlash.replace(/\/$/, '')]) {
      if (!key) continue;
      // nginx падает при старте на повторяющемся ключе map, а не игнорирует его.
      // Дубль ключа означает ошибку в данных, поэтому его видно в отчёте.
      if (seen.has(key)) {
        if (seen.get(key) !== redirect.to) collisions.push({ key, a: seen.get(key), b: redirect.to });
        continue;
      }
      seen.set(key, redirect.to);
      entries.push({ key, to: redirect.to, reason: redirect.reason });
    }
  }

  const longest = entries.reduce((max, e) => Math.max(max, e.key.length), 0);
  // Дефолт map_hash_bucket_size — 32 или 64 байта в зависимости от процессора.
  // Ключ длиннее не влезает, и nginx отказывается стартовать целиком.
  const bucket = Math.max(64, 2 ** Math.ceil(Math.log2(longest + 8)));

  const lines = [
    '# Сгенерировано build.js. Руками не править — перезапишется на следующей сборке.',
    '# Короткие URL эталона (лист 07) и синонимы термов ведут на канон.',
    `# Записей: ${redirects.length} редиректов → ${entries.length} ключей (со слэшем и без).`,
    '',
    `# Самый длинный ключ — ${longest} знаков. Без этой пары строк nginx не стартует.`,
    `map_hash_bucket_size ${bucket};`,
    `map_hash_max_size ${Math.max(2048, 2 ** Math.ceil(Math.log2(entries.length * 4)))};`,
    '',
    'map $uri $casino_redirect {',
    '    default "";',
    '',
  ];

  for (const entry of entries) {
    lines.push(`    # ${entry.reason}`);
    lines.push(`    "${entry.key}"  "${entry.to}";`);
  }

  lines.push('}', '');

  if (collisions.length) {
    lines.push('# ВНИМАНИЕ: конфликтующие адреса, оставлен первый вариант:');
    for (const collision of collisions) lines.push(`#   ${collision.key}: ${collision.a} / ${collision.b}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function buildNginxServer({ domain, root, demo = false, base = '' }) {
  const host = String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const isIp = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host);
  // У IP не бывает www-поддомена, а default_server нужен, чтобы запрос по
  // голому адресу не перехватил дефолтный конфиг дистрибутива.
  const serverName = isIp ? '_' : `${host} www.${host}`;
  const listen = isIp ? 'listen 80 default_server;' : 'listen 80;';

  const lines = [
    '# Сгенерировано build.js. Руками не править — перезапишется на следующей сборке.',
    '# Кладётся в /etc/nginx/conf.d/ рядом с 00-casino-redirects.conf.',
    base ? `# Сайт живёт в подпапке ${base}/ — домена пока нет, показываем по IP.` : null,
    '',
    'server {',
    `    ${listen}`,
    isIp ? '    listen [::]:80 default_server;' : '    listen [::]:80;',
    `    server_name ${serverName};`,
    '',
    `    root ${root};`,
    '    index index.html;',
    '',
    '    charset utf-8;',
    '',
  ];

  if (demo) {
    lines.push(
      '    # ВРЕМЕННО, НА ВРЕМЯ ПОКАЗА.',
      '    # Авторы — заглушки, партнёрские ссылки не боевые: в индекс это пускать рано.',
      '    # Снимается одной строкой, пересборка не нужна.',
      '    add_header X-Robots-Tag "noindex, nofollow" always;',
      '',
    );
  }

  lines.push(
    '    # 301 из map. Проверяется до обращения к диску, поэтому дешёвый.',
    '    if ($casino_redirect != "") {',
    '        return 301 $casino_redirect;',
    '    }',
    '',
    '    # Человекопонятные адреса: /vergleich/ → /vergleich/index.html',
    '    location / {',
    '        try_files $uri $uri/ $uri.html =404;',
    '',
    '        # HTML не кэшируем впрок. no-cache это не «не хранить», а',
    '        # «хранить, но каждый раз переспрашивать»: при неизменной странице',
    '        # уходит дешёвый 304, а после выкладки посетитель сразу получает',
    '        # новую сборку и новые адреса статики.',
    '        add_header Cache-Control "no-cache";',
    // Свой add_header отменяет наследование заголовков с уровня server.
    // Без этой строки страницы остались бы без noindex — а это и есть
    // единственное, что сейчас держит черновик вне индекса.
    demo ? '        add_header X-Robots-Tag "noindex, nofollow" always;' : null,
    '    }',
    '',
    `    error_page 404 ${base}/404.html;`,
    `    location = ${base}/404.html {`,
    '        internal;',
    '    }',
    '',
    '    # Файлы с отпечатком в имени: main.9f3c1a20.css. Под этим адресом',
    '    # лежит ровно одна версия файла и другой не будет никогда — новая',
    '    # сборка даёт новое имя. Только поэтому здесь честно стоит immutable:',
    '    # браузер не переспрашивает вообще, а обновление всё равно доезжает.',
    // Регулярка обязательно в кавычках. Без них nginx принимает { } за
    // границы блока и не стартует с unknown directive "8}...".
    '    location ~* "\\.[0-9a-f]{8}\\.(?:css|js)$" {',
    // Один заголовок вместо двух: expires добавляет собственный
    // Cache-Control, и в ответе их оказывалось два. Браузер их сольёт,
    // но читать такой ответ неприятно, а Expires для HTTP/1.0 тут не нужен.
    '        add_header Cache-Control "public, max-age=31536000, immutable";',
    demo ? '        add_header X-Robots-Tag "noindex, nofollow" always;' : null,
    '    }',
    '',
    '    # Картинки и шрифты имени не меняют: на них ссылаются данные, а данные',
    '    # про хэши сборки знать не должны. Поэтому срок короткий и без',
    '    # immutable — иначе заменённый логотип не доедет до тех, кто уже был.',
    `    location ${base}/assets/ {`,
    '        add_header Cache-Control "public, max-age=604800";',
    // add_header не наследуется, если блок объявляет свой: заголовок с уровня
    // server здесь пришлось бы потерять, поэтому он повторён.
    demo ? '        add_header X-Robots-Tag "noindex, nofollow" always;' : null,
    '    }',
    '',
    '    location = /robots.txt  { access_log off; }',
    '    location = /sitemap.xml { access_log off; }',
    '',
    '    # Служебные файлы генератора в webroot не отдаём.',
    '    location ~ /\\.(ht|git) {',
    '        deny all;',
    '    }',
    '    location = /_redirects {',
    '        deny all;',
    '    }',
    '',
    '    gzip on;',
    '    gzip_min_length 1024;',
    '    gzip_types text/plain text/css text/xml application/javascript application/json image/svg+xml;',
    '}',
    '',
  );

  return lines.filter((line) => line !== null).join('\n');
}

/** Netlify / Cloudflare Pages. */
export function buildNetlifyRedirects(redirects) {
  const lines = [
    '# Сгенерировано build.js. Руками не править.',
    '',
  ];
  for (const redirect of redirects) {
    lines.push(`${redirect.from}  ${redirect.to}  301`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Карта URL для заказчика: CSV со всеми адресами, типами, родителями и
 * составом листингов. Отдаётся раньше вёрстки — по нему видно структуру
 * будущего сайта целиком и можно спорить о ней до того, как что-то свёрстано.
 */
export function buildUrlMapCsv({ pages, redirects, resolvedTerms }) {
  const rows = [['url', 'тип', 'уровень', 'родитель', 'приоритет', 'брендов в листинге', 'примечание']];

  const level = (url) => (url === '/' ? 0 : url.split('/').filter(Boolean).length);

  for (const page of pages) {
    const term = resolvedTerms.find((t) => t.url === page.url);
    rows.push([
      page.url,
      page.type,
      String(level(page.url)),
      page.parent ?? '—',
      String(page.priority ?? ''),
      term ? String(term.brands.length) : '',
      term?.truncated ? `отсечено по limit: ${term.truncated}` : (page.noindex ? 'noindex' : ''),
    ]);
  }

  for (const redirect of redirects) {
    rows.push([redirect.from, '301', String(level(redirect.from)), redirect.to, '', '', redirect.reason]);
  }

  return rows
    .map((row) => row.map((cell) => (/[";,\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(';'))
    .join('\n') + '\n';
}
