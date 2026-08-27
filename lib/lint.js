/**
 * Линтер собранного сайта.
 *
 * Каждое правило здесь — строка из листа 09_КРИТЕРИИ ПРИЁМКИ или из блока
 * «ЧЕГО НЕ ДЕЛАТЬ» листа 08. Смысл в том, чтобы провалить сборку локально,
 * а не узнать о проблеме на приёмке. На 200+ страницах глазами это не ловится:
 * одна партнёрская ссылка без rel среди полутора тысяч — вопрос времени, а не
 * аккуратности.
 *
 * level: 'error' валит сборку, 'warn' попадает в отчёт.
 */

import { countWords, uniquenessRatio , urlJoin } from './util.js';
import { countInboundLinks } from './graph.js';

const FORBIDDEN_TEXT_PATTERNS = [
  { id: 'lorem', re: /lorem\s+ipsum|dolor\s+sit\s+amet/i, message: 'текст-заглушка Lorem Ipsum (лист 08: «ЧЕГО НЕ ДЕЛАТЬ»)' },
  { id: 'placeholder', re: /\bTODO\b|\bFIXME\b|\bXXX\b|\[текст\]|\{\{[^}]+\}\}/, message: 'незаполненная заглушка в готовой странице' },
  { id: 'fake-counter', re: /(\d+)\s*(?:игрок|player|spieler|jugador)\w*\s+(?:сейчас|онлайн|online|now|jetzt)/i, message: 'счётчик «онлайн сейчас» (лист 08: запрещено)' },
  { id: 'urgency-timer', re: /data-countdown|class="[^"]*countdown|осталось\s+\d+\s*(?:мин|час)|expires?\s+in\s+\d+/i, message: 'таймер срочности (лист 08: запрещено)' },
  { id: 'fake-winner', re: /(?:только что|just now|gerade eben)[^<.]{0,40}(?:выигр|won|gewonnen)/i, message: 'выдуманный победитель с суммой (лист 08: запрещено)' },
];

const BAD_AUTHOR_NAMES = ['admin', 'administrator', 'player', 'pin-admin', 'user', 'editor', 'root'];

/** Достаёт содержимое тега. Наивно, но нам хватает: HTML генерируем мы сами. */
function extractTag(html, tag) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : null;
}

function extractMeta(html, name) {
  const match = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function extractJsonLdTypes(html) {
  const types = new Set();
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === 'object') {
          if (node['@type']) [].concat(node['@type']).forEach((t) => types.add(t));
          Object.values(node).forEach(walk);
        }
      };
      walk(parsed);
    } catch {
      types.add('__INVALID__');
    }
  }
  return types;
}

/**
 * @param {object} ctx
 * @param {object} ctx.site
 * @param {Array}  ctx.rendered  [{ page, url, html }]
 * @param {object} ctx.graph
 * @param {Array}  ctx.brands
 * @param {object} ctx.taxonomies
 */
export function lint(ctx) {
  const { site, rendered, graph, taxonomies } = ctx;
  const findings = [];
  const add = (level, ruleId, url, message) => findings.push({ level, ruleId, url, message });

  const knownUrls = new Set(graph.pages.map((p) => p.url));
  const redirectFrom = new Map(graph.redirects.map((r) => [r.from, r.to]));
  const inbound = countInboundLinks(rendered);

  const seo = site.seo ?? {};
  const perf = site.performance ?? {};
  const forbid = site.compliance?.forbid ?? {};

  for (const { page, url, html } of rendered) {
    // Страница-редирект на оффер это не контент: у неё нет и не должно быть
    // H1, описания и разметки. Проверяем на ней ровно одно — что ссылка на
    // оффер оформлена как партнёрская. Остальные правила к ней неприменимы.
    const isRedirectPage = page.template === 'go';

    // --- Партнёрские ссылки -------------------------------------------------
    // Лист 04: rel="sponsored nofollow" на все партнёрские ссылки БЕЗ ИСКЛЮЧЕНИЙ.
    for (const anchor of html.matchAll(/<a\s+([^>]*)>/gi)) {
      const attrs = anchor[1];
      const href = attrs.match(/href="([^"]*)"/)?.[1] ?? '';
      const rel = attrs.match(/rel="([^"]*)"/)?.[1] ?? '';
      const isMarked = /data-affiliate/.test(attrs);
      const isGoLink = site.affiliate?.redirectBase && href.startsWith(site.affiliate.redirectBase);

      if (isMarked || isGoLink) {
        if (!/\bsponsored\b/.test(rel) || !/\bnofollow\b/.test(rel)) {
          add('error', 'affiliate-rel', url, `партнёрская ссылка на ${href || '(без href)'} без rel="sponsored nofollow", сейчас rel="${rel}"`);
        }
        if (isGoLink && !isMarked) {
          add('warn', 'affiliate-unmarked', url, `ссылка на ${href} ведёт на редирект, но не помечена data-affiliate — линтер не сможет проверить её в будущем`);
        }
      } else if (/^https?:\/\//.test(href) && !href.startsWith(site.domain)) {
        if (!/\bnofollow\b/.test(rel) && !/\bnoopener\b/.test(rel)) {
          add('warn', 'external-rel', url, `внешняя ссылка на ${href} без rel — если это оффер, нужен sponsored nofollow`);
        }
      }
    }

    // Лист 02: страница ответственной игры — «без офферов и CTA».
    if (page.noOffers) {
      const offers = [...html.matchAll(/<a\s+[^>]*data-affiliate/gi)].length;
      if (offers > 0) {
        add('error', 'no-offers-page', url, `на странице ${offers} партнёрских ссылок, а она должна быть без офферов и CTA (лист 02)`);
      }
    }

    if (isRedirectPage) continue;

    // --- Внутренние ссылки --------------------------------------------------
    for (const match of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const href = match[1];
      if (knownUrls.has(href)) continue;
      if (redirectFrom.has(href)) {
        add('warn', 'link-to-redirect', url, `внутренняя ссылка на ${href} ведёт через 301 на ${redirectFrom.get(href)} — ссылаться надо сразу на канон`);
        continue;
      }
      if (/\.(css|js|webp|png|svg|ico|xml|txt|json|woff2?)$/.test(href)) continue;
      add('error', 'broken-link', url, `битая внутренняя ссылка на ${href}`);
    }

    // --- Заголовки и метатеги ----------------------------------------------
    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
    if (h1Count === 0) add('error', 'h1-missing', url, 'на странице нет H1');
    if (h1Count > 1) add('error', 'h1-multiple', url, `на странице ${h1Count} тегов H1, должен быть один (лист 08)`);

    const title = extractTag(html, 'title');
    if (!title) {
      add('error', 'title-missing', url, 'нет тега title');
    } else {
      if (title.length < seo.titleMinChars || title.length > seo.titleMaxChars) {
        add('warn', 'title-length', url, `title ${title.length} знаков, норма ${seo.titleMinChars}–${seo.titleMaxChars}: «${title}»`);
      }
      if (forbid.officialInTitle && /\bofficial\b|\boffiziell\b/i.test(title)) {
        add('error', 'official-in-title', url, 'слово official в title (лист 08: запрещено)');
      }
    }

    const description = extractMeta(html, 'description');
    if (!description) {
      add('error', 'description-missing', url, 'нет meta description');
    } else if (description.length < seo.descriptionMinChars || description.length > seo.descriptionMaxChars) {
      add('warn', 'description-length', url, `meta description ${description.length} знаков, норма ${seo.descriptionMinChars}–${seo.descriptionMaxChars}`);
    }

    const h1Text = extractTag(html, 'h1');
    if (h1Text && title && h1Text.trim() === title.trim()) {
      add('warn', 'h1-equals-title', url, 'H1 дословно повторяет title — лист 05 адалтового ТЗ прямо просит их различать, для казино логика та же');
    }

    // --- Запрещённые паттерны ----------------------------------------------
    for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
      if (pattern.id === 'lorem' && !forbid.loremIpsum) continue;
      if (pattern.id === 'fake-counter' && !forbid.fakeOnlineCounters) continue;
      if (pattern.id === 'urgency-timer' && !forbid.urgencyTimers) continue;
      if (pattern.id === 'fake-winner' && !forbid.fakeWinners) continue;
      if (pattern.re.test(html)) add('error', `forbidden-${pattern.id}`, url, pattern.message);
    }

    if (forbid.loginForm && /<input[^>]+type="password"/i.test(html)) {
      add('error', 'login-form', url, 'форма, собирающая пароль (лист 08: запрещено)');
    }

    // --- Изображения --------------------------------------------------------
    for (const img of html.matchAll(/<img\s+([^>]*)>/gi)) {
      const attrs = img[1];
      const src = attrs.match(/src="([^"]*)"/)?.[1] ?? '(без src)';
      if (!/\bwidth="/.test(attrs) || !/\bheight="/.test(attrs)) {
        add('error', 'img-dimensions', url, `<img src="${src}"> без явных width/height — это гарантированный сдвиг макета и просадка LCP (лист 04)`);
      }
      if (!/\balt="/.test(attrs)) {
        add('error', 'img-alt', url, `<img src="${src}"> без alt`);
      }
      if (perf.logoFormat === 'webp' && /\.(png|jpe?g)(\?|$)/i.test(src)) {
        add('warn', 'img-format', url, `${src} не в WebP (лист 04: логотипы казино в WebP)`);
      }
    }

    // --- Разметка -----------------------------------------------------------
    const types = extractJsonLdTypes(html);
    if (types.has('__INVALID__')) {
      add('error', 'jsonld-invalid', url, 'блок application/ld+json не разбирается как JSON');
    }
    if (!page.noindex) {
      if (seo.schema?.breadcrumbList && !types.has('BreadcrumbList') && url !== urlJoin()) {
        add('warn', 'schema-breadcrumb', url, 'нет BreadcrumbList (лист 04: этого нет у конкурента — наш зазор)');
      }
      if (seo.schema?.article && !types.has('Article') && !types.has('WebPage')) {
        add('warn', 'schema-article', url, 'нет Article с dateModified и author');
      }
      const hasFaqBlock = /<h2[^>]*>[^<]*FAQ|itemtype="[^"]*FAQPage|data-faq/i.test(html);
      if (hasFaqBlock && !types.has('FAQPage')) {
        add('warn', 'schema-faq', url, 'на странице есть блок FAQ, но нет разметки FAQPage');
      }
      if (types.has('FAQPage') && !hasFaqBlock) {
        add('error', 'schema-faq-empty', url, 'разметка FAQPage есть, а видимого блока FAQ нет (лист 09: «разметка есть, а видимого контента под неё нет»)');
      }
      if (types.has('AggregateRating') && !seo.schema?.aggregateRating) {
        add('error', 'schema-rating-forbidden', url, 'AggregateRating при выключенном флаге — лист 04 разрешает его только при опубликованной методике');
      }
    }

    // --- Вес страницы -------------------------------------------------------
    const weightKb = Buffer.byteLength(html, 'utf8') / 1024;
    if (perf.maxPageWeightKb && weightKb > perf.maxPageWeightKb) {
      add('warn', 'page-weight', url, `HTML ${weightKb.toFixed(0)} КБ при бюджете ${perf.maxPageWeightKb} КБ (лист 09: тревожный сигнал — больше 500 КБ)`);
    }

    // --- Дата сверки --------------------------------------------------------
    if ([ 'listing', 'brand', 'home', 'compare' ].includes(page.template)) {
      if (!/datetime="\d{4}-\d{2}-\d{2}"/.test(html)) {
        add('error', 'checked-date', url, 'нет даты проверки в машиночитаемом виде (лист 04: дата проверки в шапке таблицы и рядом с каждым бонусом)');
      }
    }

    // --- Таблица вместо карточек -------------------------------------------
    if (['listing', 'compare', 'home'].includes(page.template)) {
      if (!/<table[\s>]/i.test(html)) {
        add('error', 'no-table', url, 'нет настоящего <table> (лист 04: «У конкурента ноль <table> — карточками. Наша таблица объективно удобнее»)');
      }
      if (!/data-sortable/.test(html)) {
        add('error', 'table-not-sortable', url, 'таблица без data-sortable — сортировка не подключится');
      }
      if (!/overflow-x/.test(html) && !/data-table-scroll/.test(html)) {
        add('warn', 'table-scroll', url, 'таблица не обёрнута в контейнер с горизонтальной прокруткой — на 320 px поедет вся страница (лист 09)');
      }
    }

    // --- Прямой ответ в первых 70 словах ------------------------------------
    if (['listing', 'home', 'brand'].includes(page.template)) {
      const afterH1 = html.split(/<\/h1>/i)[1] ?? '';
      const firstBlock = afterH1.match(/<p[^>]*>[\s\S]*?<\/p>/i)?.[0] ?? '';
      const words = countWords(firstBlock);
      if (words === 0) {
        add('error', 'answer-missing', url, 'после H1 нет абзаца с прямым ответом (лист 09: «Сначала абзац воды, потом таблица» — тревожный сигнал)');
      } else if (words > seo.answerMaxWords) {
        add('warn', 'answer-too-long', url, `первый абзац ${words} слов, ответ должен уложиться в ${seo.answerMaxWords} (лист 08)`);
      }
    }

    // --- FAQ ----------------------------------------------------------------
    if (/data-faq/.test(html)) {
      const questions = (html.match(/data-faq-question/g) ?? []).length;
      if (questions < seo.faqMinQuestions || questions > seo.faqMaxQuestions) {
        add('warn', 'faq-count', url, `${questions} вопросов в FAQ, норма ${seo.faqMinQuestions}–${seo.faqMaxQuestions} (лист 08)`);
      }
    }

    // --- Автор --------------------------------------------------------------
    if (!page.noindex && ['listing', 'brand', 'home'].includes(page.template)) {
      const authorMatch = html.match(/rel="author"[^>]*>([^<]+)</i) ?? html.match(/"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
      const author = authorMatch?.[1]?.trim().toLowerCase();
      if (!author) {
        add('error', 'author-missing', url, 'на странице не указан автор (лист 04: именованный автор с профилем на каждой странице)');
      } else if (BAD_AUTHOR_NAMES.includes(author)) {
        add('error', 'author-technical', url, `автор «${author}» — техническое имя. Лист 04: «у конкурента автор есть, но техническое имя player / pin-admin — так не делать»`);
      }
    }
  }

  // --- Страницы без входящих ссылок -----------------------------------------
  for (const page of graph.pages) {
    if (page.noindex || page.url === urlJoin()) continue;
    const sources = inbound.get(page.url);
    const count = sources ? sources.size : 0;
    if (count === 0) {
      add('error', 'orphan-page', page.url, 'на страницу не ведёт ни одна внутренняя ссылка — тупик без входящих (лист 09)');
    } else if (count < 3 && page.type !== 'go') {
      add('warn', 'weak-inbound', page.url, `всего ${count} внутренние ссылки. Лист 05: «каждая новая страница получает 3+ внутренние ссылки в день публикации»`);
    }
  }

  // --- Уникальность между соседними листингами ------------------------------
  // Лист 09: сравнить visa-casino и mastercard-casino, норма 40%+ различий.
  const byTaxonomy = new Map();
  for (const { page, url, html } of rendered) {
    if (page.template !== 'listing') continue;
    const taxId = page.data?.taxonomyId;
    if (!byTaxonomy.has(taxId)) byTaxonomy.set(taxId, []);
    byTaxonomy.get(taxId).push({ url, html });
  }

  // Таблицы из сравнения исключаются. Лист 09 формулирует требование как
  // «40%+ различий, разные лимиты и особенности» — то есть про ТЕКСТ.
  // Таблица офферов у visa-casino и mastercard-casino обязана быть похожей:
  // это одни и те же бренды, и в этом смысл сравнения. Считать её в дубли
  // значило бы штрафовать сайт за то, ради чего он сделан. Навигация,
  // хлебные крошки и футер вырезаются по той же причине.
  const prose = (html) => String(html)
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  const minUniqueness = 0.4;
  for (const [taxId, group] of byTaxonomy) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const ratio = uniquenessRatio(prose(group[i].html), prose(group[j].html));
        if (ratio < minUniqueness) {
          add('error', 'duplicate-content', group[i].url,
            `уникальность относительно ${group[j].url} — ${Math.round(ratio * 100)}% при норме ${minUniqueness * 100}% (таксономия ${taxId}, лист 09)`);
        }
      }
    }
  }

  // --- Тонкие страницы -------------------------------------------------------
  const minWords = taxonomies.thresholds?.minWordsForOwnUrl ?? 500;
  for (const { page, url, html } of rendered) {
    if (page.template !== 'listing' && page.template !== 'brand') continue;
    const words = countWords(html);
    if (words < minWords) {
      add('error', 'thin-page', url, `${words} слов при пороге ${minWords} — по листу 05 это не отдельный URL, а секция в родительской странице`);
    }
  }

  return findings;
}

/** Группирует находки для вывода в консоль. */
export function summarize(findings) {
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warn');
  const byRule = new Map();
  for (const finding of findings) {
    const key = `${finding.level}:${finding.ruleId}`;
    if (!byRule.has(key)) byRule.set(key, []);
    byRule.get(key).push(finding);
  }
  return { errors, warnings, byRule };
}
