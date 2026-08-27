/**
 * Статический генератор обзорника.
 *
 *   node build.js                 полная сборка в dist/
 *   node build.js --lint-only     собрать в память и только проверить
 *   node build.js --stage=content ужесточить правила контента до ошибок
 *
 * Порядок шагов не случаен: данные проверяются до расчёта оценок, оценки
 * считаются до построения графа (правило best-online-casinos сортирует по
 * score.total), граф строится до рендеринга, а линтер запускается по готовому
 * HTML — потому что половина требований листа 09 проверяема только на выходе.
 *
 * Зависимостей нет. Это требование листа 08 и одновременно то, что смотрят
 * на приёмке первым делом.
 */

import { readFile, writeFile, mkdir, rm, readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { get, set, isoDate } from './lib/util.js';
import { validateBrand } from './lib/schema.js';
import { scoreAll, validateCriteria } from './lib/score.js';
import { buildGraph } from './lib/graph.js';
import { loadTemplates } from './lib/render.js';
import { lint, summarize } from './lib/lint.js';
import { planAssets, writeAssets } from './lib/assets.js';
import { buildSitemap, buildRobots, buildHtaccess, buildNetlifyRedirects, buildNginxMap, buildNginxServer, buildUrlMapCsv } from './lib/sitemap.js';
import { urlJoin, setBasePath, withBase } from './lib/util.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');

const args = process.argv.slice(2);
const LINT_ONLY = args.includes('--lint-only');
const STAGE = (args.find((a) => a.startsWith('--stage='))?.split('=')[1]) ?? 'harness';

/**
 * На этапе стенда контент ещё не написан, и правила о качестве текста
 * сообщают о будущей работе, а не о поломке. Структурные правила —
 * партнёрские ссылки, битые ссылки, тупики, таблицы, даты — остаются
 * ошибками на любом этапе.
 */
const CONTENT_RULES = new Set([
  'duplicate-content', 'thin-page', 'title-length', 'description-length',
  'answer-too-long', 'faq-count', 'h1-equals-title', 'weak-inbound',
  'page-weight', 'img-format',
]);

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function main() {
  const started = Date.now();
  console.log(c.bold('\n  Сборка обзорника\n'));

  // -------------------------------------------------------------------------
  // 1. Данные
  // -------------------------------------------------------------------------
  const site = await readJson(path.join(DATA, 'site.json'));
  // До любого построения адресов: urlJoin — единственная точка, где они
  // собираются, и префикс подпапки должен стоять там раньше первого вызова.
  setBasePath(site.basePath ?? '');
  const [taxonomies, criteria, authors, locale, brandsFile] = await Promise.all([
    readJson(path.join(DATA, site.data.taxonomies)),
    readJson(path.join(DATA, site.data.criteria)),
    readJson(path.join(DATA, site.data.authors)),
    readJson(path.join(DATA, site.data.locale)),
    readJson(path.join(DATA, site.data.brands)),
  ]);
  const brands = brandsFile.brands;

  // Справочник по платёжным методам: свойства самого метода, одинаковые у всех
  // операторов. Именно он даёт листингам visa-casino и mastercard-casino
  // содержательное различие вместо перестановки слов (лист 05).
  const paymentMethods = site.data.paymentMethods
    ? (await readJson(path.join(DATA, site.data.paymentMethods))).methods
    : {};
  const bonusTypes = site.data.bonusTypes
    ? (await readJson(path.join(DATA, site.data.bonusTypes))).types
    : {};
  const categories = site.data.categories
    ? (await readJson(path.join(DATA, site.data.categories))).categories
    : {};

  // Справочник по игровым студиям и по темам live, ставок и лицензий. Без них
  // соседние листинги внутри одной таксономии различались бы только
  // подставленным словом, а лист 09 называет это тревожным сигналом дословно.
  const providers = site.data.providers
    ? (await readJson(path.join(DATA, site.data.providers))).providers
    : {};
  const topics = site.data.topics
    ? await readJson(path.join(DATA, site.data.topics))
    : {};

  step('данные', `${brands.length} брендов · ${taxonomies.taxonomies.length} таксономий · локаль ${locale.code}`);

  if (site.geo === 'XX') {
    warn('site.geo = "XX" — ГЕО не выбрано. Сборка идёт на нейтральной локали-заглушке.');
  }
  if (brandsFile.$demo) {
    warn(`датасет ${site.data.brands} помечен как демонстрационный. Бренды вымышленные, цифры — стенд.`);
  }
  const placeholderAuthors = authors.authors.filter((a) => a.placeholder);
  if (placeholderAuthors.length) {
    warn(`${placeholderAuthors.length} из ${authors.authors.length} авторов — заглушки. Лист 09 проверяет автора отдельной строкой.`);
  }

  // -------------------------------------------------------------------------
  // 2. Методика
  // -------------------------------------------------------------------------
  const criteriaErrors = validateCriteria(criteria);
  if (criteriaErrors.length) {
    fail('методика оценки', criteriaErrors);
    process.exitCode = 1;
    return;
  }
  step('методика', `${criteria.criteria.length} критерия, сумма весов 100`);

  // -------------------------------------------------------------------------
  // 3. Валидация брендов
  // -------------------------------------------------------------------------
  const dataErrors = [];
  const dataWarnings = [];
  const seenSlugs = new Set();

  for (const brand of brands) {
    if (seenSlugs.has(brand.slug)) dataErrors.push(`дубль слага бренда "${brand.slug}"`);
    seenSlugs.add(brand.slug);

    if (!authors.authors.some((a) => a.slug === brand.author)) {
      dataErrors.push(`бренд "${brand.slug}": автор "${brand.author}" не найден в authors.json`);
    }

    const { errors, warnings } = validateBrand(brand, { getValue: get, setValue: set });
    errors.forEach((e) => dataErrors.push(`бренд "${brand.slug}": ${e}`));
    warnings.forEach((w) => dataWarnings.push(`бренд "${brand.slug}": ${w}`));
  }

  if (dataErrors.length) {
    fail('данные брендов', dataErrors);
    process.exitCode = 1;
    return;
  }
  step('валидация', `${brands.length} брендов прошли схему${dataWarnings.length ? `, ${dataWarnings.length} предупреждений` : ''}`);

  // Производное поле: срок вывода, пригодный для сортировки и фильтров.
  // Собственный замер, если он есть; иначе то, что заявляет оператор.
  // Оценка при этом считается ТОЛЬКО по замерам (criteria.json ссылается на
  // payout.medianHours), поэтому заявленный срок не может подмешаться в баллы.
  for (const brand of brands) {
    const measured = get(brand, 'payout.medianHours');
    set(brand, 'payout.isMeasured', measured != null);
    set(brand, 'payout.effectiveHours', measured ?? get(brand, 'payout.claimedHours'));
  }

  // Производное поле: есть ли на диске файл логотипа.
  //
  // В данных brand.logo указан всегда — это адрес, по которому логотип будет
  // лежать. Файлов пока нет ни одного, и шаблон, поставивший <img> на пустое
  // место, дал бы битую картинку в каждой строке таблицы. Проверку делает
  // сборка, потому что шаблонам в файловую систему ходить незачем: они
  // получают готовый флаг и рисуют либо логотип, либо монограмму.
  let logoCount = 0;
  for (const brand of brands) {
    if (!brand.logo) { brand.hasLogo = false; continue; }
    try {
      await access(path.join(ROOT, brand.logo.replace(/^\//, '')));
      brand.hasLogo = true;
      logoCount += 1;
    } catch {
      brand.hasLogo = false;
    }
  }
  if (logoCount < brands.length) {
    warn(`${brands.length - logoCount} из ${brands.length} брендов без файла логотипа в assets/img/brands/ — в списках выводится монограмма.`);
  }

  const provisional = brands.filter((b) => get(b, 'payout.provisional'));
  if (provisional.length) {
    warn(`${provisional.length} из ${brands.length} брендов без собственных замеров вывода. У них не выводится колонка «наш замер», а критерий «Выплаты» (25% веса) не участвует в расчёте оценки.`);
  }

  // -------------------------------------------------------------------------
  // 4. Оценки
  // -------------------------------------------------------------------------
  const buildDate = isoDate(new Date());
  const scoreProblems = scoreAll(brands, criteria, { computedAt: buildDate });
  const scoreErrors = scoreProblems.filter((p) => p.level === 'error');
  if (scoreErrors.length) {
    fail('расчёт оценок', scoreErrors.map((p) => `${p.brand}: ${p.message}`));
    process.exitCode = 1;
    return;
  }
  const scores = brands.filter((b) => b.status === 'active').map((b) => b.score.total).sort((a, b) => b - a);
  step('оценки', `посчитаны формулой · от ${scores[scores.length - 1]} до ${scores[0]}`);
  scoreProblems.filter((p) => p.level === 'warn').forEach((p) => dataWarnings.push(`бренд "${p.brand}": ${p.message}`));

  // -------------------------------------------------------------------------
  // 5. Граф страниц
  // -------------------------------------------------------------------------
  const graph = buildGraph({ site, taxonomies, brands, locale });
  const graphErrors = graph.problems.filter((p) => p.level === 'error');
  if (graphErrors.length) {
    fail('карта сайта', graphErrors.map((p) => p.message));
    process.exitCode = 1;
    return;
  }
  graph.problems.filter((p) => p.level === 'warn').forEach((p) => dataWarnings.push(p.message));

  const byType = graph.pages.reduce((acc, p) => { acc[p.type] = (acc[p.type] ?? 0) + 1; return acc; }, {});
  step('карта сайта', `${graph.pages.length} страниц · ${graph.redirects.length} редиректов`);
  console.log(c.dim(`         ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(' · ')}`));

  // -------------------------------------------------------------------------
  // 6. Рендеринг
  // -------------------------------------------------------------------------
  const templates = await loadTemplates(path.join(ROOT, 'templates'));

  const staticUrls = Object.fromEntries(
    graph.pages.filter((p) => ['static', 'compare'].includes(p.type) || p.key === 'authors')
      .map((p) => [p.key, p.url]),
  );
  staticUrls.home = urlJoin();

  // Статика планируется до рендеринга: шаблонам нужны адреса с отпечатками,
  // а отпечаток считается из содержимого файла.
  const assets = await planAssets(path.join(ROOT, 'assets'), { minify: site.build.minify !== false });

  const ctx = {
    site, locale, taxonomies, criteria, authors, brands, graph, buildDate, staticUrls, paymentMethods, bonusTypes, categories,
    providers, topics,

    /**
     * Адрес файла статики. Единственный способ сослаться на CSS или JS из
     * шаблона: имя в выкладке отличается от имени в исходниках, и знать об
     * этом должен только генератор. Неизвестный путь роняет сборку — молча
     * отдать несуществующий адрес хуже, чем не собраться.
     */
    asset: (p) => {
      const hashed = assets.map.get(p);
      if (!hashed) throw new Error(`нет файла статики "${p}" — проверьте assets/`);
      return withBase(hashed);
    },
  };

  const rendered = [];
  for (const page of graph.pages) {
    const render = templates.get(page.template);
    if (!render) {
      fail('шаблоны', [`для страницы ${page.url} нужен шаблон "${page.template}", а templates/${page.template}.js не найден`]);
      process.exitCode = 1;
      return;
    }
    let html;
    try {
      html = render(ctx, page);
    } catch (error) {
      fail('рендеринг', [`${page.url} (${page.template}): ${error.message}`, ...String(error.stack).split('\n').slice(1, 4)]);
      process.exitCode = 1;
      return;
    }
    rendered.push({ page, url: page.url, html: site.build.minify ? minify(html) : html });
  }

  const totalKb = rendered.reduce((sum, r) => sum + Buffer.byteLength(r.html, 'utf8'), 0) / 1024;
  step('рендеринг', `${rendered.length} страниц · ${totalKb.toFixed(0)} КБ HTML · в среднем ${(totalKb / rendered.length).toFixed(1)} КБ`);

  // -------------------------------------------------------------------------
  // 7. Линтер
  // -------------------------------------------------------------------------
  let findings = lint({ site, rendered, graph, brands, taxonomies });

  if (STAGE === 'harness') {
    findings = findings.map((f) => (CONTENT_RULES.has(f.ruleId) && f.level === 'error' ? { ...f, level: 'warn', deferred: true } : f));
  }

  const missingAssets = await findMissingAssets(rendered, ROOT, site.basePath ?? '');
  missingAssets.forEach((asset) => findings.push({
    level: 'warn', ruleId: 'asset-missing', url: asset.url,
    message: `файл ${asset.src} не найден — логотипы брендов ещё не сделаны`,
  }));

  const { errors, warnings, byRule } = summarize(findings);
  reportLint(byRule, errors, warnings, dataWarnings);

  // -------------------------------------------------------------------------
  // 8. Запись
  // -------------------------------------------------------------------------
  if (LINT_ONLY) {
    console.log(c.dim('\n  --lint-only: файлы не записаны\n'));
  } else if (errors.length) {
    console.log(c.red('\n  Сборка остановлена: есть ошибки. Файлы не записаны.\n'));
  } else {
    const outDir = path.join(ROOT, site.build.outDir);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    for (const { page, html } of rendered) {
      const target = page.url.endsWith('.html')
        ? path.join(outDir, page.url.slice(1))
        : path.join(outDir, page.url.slice(1), 'index.html');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, html, 'utf8');
    }

    // Ассеты кладутся внутрь подпапки: ссылки на них строятся тем же withBase.
    // Имена CSS и JS уже с отпечатком содержимого — см. lib/assets.js.
    await writeAssets(assets.files, path.join(outDir, withBase('/assets')));

    if (site.build.emitSitemap) {
      await writeFile(path.join(outDir, 'sitemap.xml'),
        buildSitemap(graph.pages, { domain: site.domain, lastmodFor: (p) => lastmodFor(p, buildDate) }), 'utf8');
    }
    if (site.build.emitRobots) {
      await writeFile(path.join(outDir, 'robots.txt'),
        buildRobots({
          domain: site.domain,
          affiliateBase: withBase(site.affiliate.redirectBase),
          disallowAll: site.deploy?.demo === true,
        }), 'utf8');
    }
    if (site.build.emitRedirects) {
      const format = site.build.redirectFormat;
      if (format === 'htaccess' || format === 'both') {
        await writeFile(path.join(outDir, '.htaccess'), buildHtaccess(graph.redirects), 'utf8');
      }
      if (format === 'netlify' || format === 'both') {
        await writeFile(path.join(outDir, '_redirects'), buildNetlifyRedirects(graph.redirects), 'utf8');
      }
      if (format === 'nginx' || format === 'both') {
        // Намеренно НЕ в outDir: конфиг, лежащий в webroot, скачивается по прямой
        // ссылке вместе со всеми путями и правилами.
        const deployDir = path.join(ROOT, 'deploy', 'nginx');
        await mkdir(deployDir, { recursive: true });
        await writeFile(path.join(deployDir, '00-casino-redirects.conf'),
          buildNginxMap(graph.redirects), 'utf8');
        await writeFile(path.join(deployDir, '10-casino-site.conf'),
          buildNginxServer({
            domain: site.domain,
            root: site.deploy?.root ?? '/var/www/casino/public',
            demo: site.deploy?.demo === true,
            base: site.basePath ?? '',
          }), 'utf8');
      }
    }

    const reportsDir = path.join(ROOT, 'reports');
    await mkdir(reportsDir, { recursive: true });
    // BOM намеренно: без него Excel на Windows читает UTF-8 как ANSI и русские
    // заголовки колонок превращаются в мусор. Карта URL уходит заказчику.
    await writeFile(path.join(reportsDir, 'url-map.csv'),
      '﻿' + buildUrlMapCsv({ pages: graph.pages, redirects: graph.redirects, resolvedTerms: graph.resolvedTerms }), 'utf8');
    await writeFile(path.join(reportsDir, 'lint.txt'), textReport(findings, dataWarnings), 'utf8');

    console.log(c.green(`\n  Готово: ${site.build.outDir}/ · ${rendered.length} страниц · ${(Date.now() - started) / 1000}s`));
    console.log(c.dim('  Отчёты: reports/url-map.csv, reports/lint.txt\n'));
  }

  if (errors.length) process.exitCode = 1;
}

// ---------------------------------------------------------------------------

function lastmodFor(page, buildDate) {
  if (page.type === 'brand') return isoDate(page.data.brand.updatedAt);
  if (page.type === 'listing') {
    const dates = page.data.brands.map((b) => b.updatedAt).filter(Boolean).sort();
    return dates.length ? isoDate(dates[dates.length - 1]) : buildDate;
  }
  return buildDate;
}

/** Осторожная минификация: убираем отступы строк, содержимое текста не трогаем. */
function minify(html) {
  return html.replace(/^[ \t]+/gm, '').replace(/\n{2,}/g, '\n');
}

/**
 * Ищет картинки, на которые страницы ссылаются, а файла нет.
 *
 * Проверка идёт по исходникам, а не по dist: линтер работает до записи, и на
 * чистой сборке в dist ещё пусто. Поэтому из адреса снимается basePath —
 * в разметке стоит /casino/assets/..., а на диске лежит assets/...
 * Пока логотипов не было, всё подряд числилось отсутствующим и промах в этом
 * месте был незаметен.
 */
async function findMissingAssets(rendered, root, basePath = '') {
  const wanted = new Map();
  for (const { url, html } of rendered) {
    for (const match of html.matchAll(/<img[^>]+src="(\/[^"]+)"/g)) {
      if (!wanted.has(match[1])) wanted.set(match[1], url);
    }
  }

  const strip = (src) => (basePath && src.startsWith(`${basePath}/`) ? src.slice(basePath.length) : src);

  const missing = [];
  for (const [src, url] of wanted) {
    try {
      await access(path.join(root, strip(src).slice(1)));
    } catch {
      missing.push({ src, url });
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Отчёты
// ---------------------------------------------------------------------------

function step(name, detail) {
  console.log(`  ${c.green('✓')} ${name.padEnd(12)} ${c.dim(detail)}`);
}

function warn(message) {
  console.log(`  ${c.yellow('!')} ${c.yellow(message)}`);
}

function fail(stage, messages) {
  console.log(`\n  ${c.red('✗')} ${c.bold(stage)}\n`);
  messages.slice(0, 25).forEach((m) => console.log(`      ${c.red(m)}`));
  if (messages.length > 25) console.log(c.dim(`      ... и ещё ${messages.length - 25}`));
  console.log('');
}

function reportLint(byRule, errors, warnings, dataWarnings) {
  console.log(c.bold('\n  Линтер по критериям приёмки\n'));

  const groups = [...byRule.entries()].sort((a, b) => b[1].length - a[1].length);
  const shown = [];

  for (const [key, items] of groups) {
    const [level, ruleId] = key.split(':');
    const mark = level === 'error' ? c.red('✗') : c.yellow('!');
    const deferred = items[0].deferred ? c.dim(' (отложено до этапа контента)') : '';
    console.log(`  ${mark} ${ruleId.padEnd(24)} ${String(items.length).padStart(4)}${deferred}`);
    shown.push(...items.slice(0, 2));
  }

  if (!groups.length) console.log(c.green('  Замечаний нет.'));

  if (shown.length) {
    console.log(c.dim('\n  Примеры:'));
    shown.slice(0, 12).forEach((f) => {
      console.log(c.dim(`    ${f.url}`));
      console.log(c.dim(`      ${f.message.slice(0, 150)}`));
    });
  }

  if (dataWarnings.length) {
    console.log(c.dim(`\n  Замечания к данным: ${dataWarnings.length}`));
    dataWarnings.slice(0, 6).forEach((w) => console.log(c.dim(`    ${w.slice(0, 150)}`)));
    if (dataWarnings.length > 6) console.log(c.dim(`    ... и ещё ${dataWarnings.length - 6}, полностью в reports/lint.txt`));
  }

  console.log(`\n  ${errors.length ? c.red(`${errors.length} ошибок`) : c.green('0 ошибок')} · ${c.yellow(`${warnings.length} предупреждений`)}`);
}

function textReport(findings, dataWarnings) {
  const lines = [
    'Отчёт линтера. Правила соответствуют листу 09_КРИТЕРИИ ПРИЁМКИ и блоку',
    '«ЧЕГО НЕ ДЕЛАТЬ» листа 08 из ТЗ обзорников.',
    '',
    `Ошибок: ${findings.filter((f) => f.level === 'error').length}`,
    `Предупреждений: ${findings.filter((f) => f.level === 'warn').length}`,
    '',
    '='.repeat(78),
    '',
  ];

  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, []);
    byRule.get(f.ruleId).push(f);
  }

  for (const [ruleId, items] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`[${items[0].level.toUpperCase()}] ${ruleId} — ${items.length}${items[0].deferred ? ' (отложено до этапа контента)' : ''}`);
    items.forEach((f) => lines.push(`    ${f.url}`, `        ${f.message}`));
    lines.push('');
  }

  if (dataWarnings.length) {
    lines.push('='.repeat(78), '', 'ЗАМЕЧАНИЯ К ДАННЫМ', '');
    dataWarnings.forEach((w) => lines.push(`    ${w}`));
  }

  return lines.join('\n') + '\n';
}

main().catch((error) => {
  console.error(c.red(`\n  Сборка упала: ${error.message}\n`));
  console.error(c.dim(error.stack));
  process.exitCode = 1;
});
