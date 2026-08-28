/**
 * Каркас документа и переиспользуемые блоки.
 *
 * CSS подключается одним блокирующим <link>. Раньше здесь была схема
 * «критический инлайном + остальное через preload с onload»: первый экран
 * рисовался без блокирующих запросов. Схему сняли, потому что она держала
 * вёрстку в двух копиях, а копии разошлись. В инлайновой не было мобильных
 * правил таблицы — и телефон на LTE успевал секундами показывать широкую
 * сломанную таблицу, прежде чем доезжал main.css. Один файл (после редизайна
 * 2026.1 — около 57 КБ минифицированного, 11 КБ в gzip) с immutable-кэшем
 * этого не стоит: со второй страницы он уже в кэше, а расходиться теперь
 * нечему.
 *
 * Ни одной видимой строки текста здесь не задаётся: всё берётся из локали,
 * поэтому смена ГЕО не требует правок в шаблонах.
 *
 * Первый экран собирается одной функцией pageHead(): заголовок, ответ,
 * строка проверки и сводка цифрами. Раньше каждый шаблон складывал их
 * вручную, и вступление отъедало весь вьюпорт — таблица начиналась ниже
 * сгиба. Теперь высота первого экрана правится в одном месте.
 */

import { esc, affiliateLink, logo, tableScroll, jsonLdBlock, breadcrumbList, article, faqPage } from '../../lib/render.js';
import { crumbLabel, pageTitle, pageH1, pageDescription, resolveAuthor, properLabel, formatScore, scoreBand } from '../../lib/labels.js';
import { icon, iconSprite, paymentIcon, hasPaymentLogo, logoOrMark, SECTION_ICONS } from '../../lib/icons.js';
import { get, isoDate, withBase, urlJoin } from '../../lib/util.js';

/** Полный HTML-документ. Единственное место, где собирается <head>. */
export function document_(ctx, page, { main, jsonLd = [], h1 }) {
  const { site, locale } = ctx;
  const title = pageTitle(page, ctx);
  const description = pageDescription(page, ctx);
  const canonical = `${site.domain}${page.url}`;
  const author = resolveAuthor(page, ctx);

  const nodes = [
    ...jsonLd,
    page.breadcrumbs.length > 1
      ? breadcrumbList(page.breadcrumbs, { domain: site.domain, labelFor: (c) => crumbLabel(c, ctx) })
      : null,
    article({
      headline: h1 ?? pageH1(page, ctx),
      description,
      url: page.url,
      domain: site.domain,
      author,
      publishedAt: ctx.buildDate,
      updatedAt: pageModified(page, ctx),
    }),
  ];

  return `<!doctype html>
<html lang="${esc(site.lang)}"${site.theme.mode === 'light' ? '' : ` data-theme="${esc(site.theme.mode)}"`}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#ffffff">
<link rel="canonical" href="${esc(canonical)}">
${page.noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${esc(site.lang)}">
<link rel="stylesheet" href="${ctx.asset('/assets/css/main.css')}">
${jsonLdBlock(nodes)}
</head>
<body>
${iconSprite()}
<a href="#main" class="skip">${esc(locale.nav.skipToContent)}</a>
${header(ctx, page)}
<main id="main" class="wrap">
${breadcrumbs(ctx, page)}
${main}
</main>
${footer(ctx)}
<script src="${ctx.asset('/assets/js/nav.js')}" defer></script>
<script src="${ctx.asset('/assets/js/table-sort.js')}" defer></script>
<script src="${ctx.asset('/assets/js/filters.js')}" defer></script>
${page.type === 'brand' ? `<script src="${ctx.asset('/assets/js/sticky-cta.js')}" defer></script>` : ''}
</body>
</html>
`;
}

function pageModified(page, ctx) {
  if (page.type === 'brand') return page.data.brand.updatedAt;
  if (page.type === 'listing') {
    const dates = page.data.brands.map((b) => b.updatedAt).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : ctx.buildDate;
  }
  return ctx.buildDate;
}

// ---------------------------------------------------------------------------
// Шапка
// ---------------------------------------------------------------------------

/**
 * Шапка. Липкая, в одну строку, всё меню — под кнопкой.
 *
 * Названия разделов у нас длинные и такими и должны быть: «Casinos nach
 * Zahlungsmethode» — это то, что человек ищет. Семь таких ссылок в строку не
 * помещаются ни на одном экране: на десктопе они обрезались, на мобильном
 * превращались в ленту с горизонтальной прокруткой, где не видно, что дальше.
 *
 * Поэтому меню собрано в панель и разложено по группам. Открывается нативным
 * <details> — без JS оно тоже работает, скрипт добавляет только закрытие по
 * Esc и по клику мимо. На широком экране рядом остаются короткие ярлыки
 * разделов для быстрого перехода.
 */
function header(ctx, page) {
  const { locale, graph } = ctx;
  const hubs = graph.pages.filter((p) => p.type === 'hub');
  const short = locale.hubLabelsShort ?? {};
  const nameParts = (locale.site.name ?? '').split(' ');
  const [first, ...rest] = nameParts;

  const isHere = (p) => (p.url === page.url ? ' aria-current="page"' : '');

  const compact = hubs
    .filter((hub) => short[hub.key])
    .map((hub) => `<li><a href="${esc(hub.url)}"${isHere(hub)}>${esc(short[hub.key])}</a></li>`)
    .join('');

  const panelLink = (p, label) => `<li><a href="${esc(p.url)}"${isHere(p)}>`
    + `${icon(SECTION_ICONS[p.key] ?? 'chevron-right', { size: 15 })}<span>${esc(label)}</span></a></li>`;

  // Второй столбец панели: карточки брендов, сравнение и всё редакционное.
  // Порядок задан здесь, а не в данных: это порядок чтения, а не структура.
  const editorialKeys = ['brand-index', 'compare', 'how-we-test', 'authors', 'editorial-policy', 'responsible-gambling'];
  const editorial = editorialKeys
    .map((key) => graph.pages.find((p) => p.key === key))
    .filter(Boolean);

  return `<header class="site-head"><div class="wrap site-head__row">
<a class="brandmark" href="${urlJoin()}"><span class="brandmark__sign" aria-hidden="true">${esc(initials(nameParts))}</span><span class="brandmark__text"><span>${esc(first)}</span> ${esc(rest.join(' '))}</span></a>
${compact ? `<nav class="nav-compact" aria-label="${esc(locale.nav.sections ?? 'Rubriken')}"><ul>${compact}</ul></nav>` : ''}
<details class="menu" data-menu>
<summary class="menu__btn">${icon('menu', { size: 17, className: 'ic--menu' })}${icon('close', { size: 17, className: 'ic--close' })}<span>${esc(locale.nav.menu ?? 'Menü')}</span></summary>
<nav class="menu__panel" aria-label="${esc(locale.nav.allSections ?? 'Alle Bereiche')}">
<div class="menu__group">
<h2>${esc(locale.nav.sections ?? 'Rubriken')}</h2>
<ul>${hubs.map((hub) => panelLink(hub, locale.hubLabels[hub.key] ?? hub.key)).join('')}</ul>
</div>
<div class="menu__group">
<h2>${esc(locale.nav.editorial ?? 'Redaktion')}</h2>
<ul>${editorial.map((p) => panelLink(p, locale.pageLabels[p.key] ?? p.key)).join('')}</ul>
</div>
</nav>
</details>
</div></header>`;
}

/** Инициалы для знака в шапке: две буквы из названия сайта. */
function initials(parts) {
  const letters = parts.filter(Boolean).map((w) => w[0]).join('');
  return letters.slice(0, 2).toUpperCase();
}

function breadcrumbs(ctx, page) {
  if (page.breadcrumbs.length <= 1) return '';
  const sep = icon('chevron-right', { size: 12 });
  const parts = page.breadcrumbs.map((crumb, index) =>
    index === page.breadcrumbs.length - 1
      ? `<span aria-current="page">${esc(crumbLabel(crumb, ctx))}</span>`
      : `<a href="${esc(crumb.url)}">${esc(crumbLabel(crumb, ctx))}</a>`);
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join(sep)}</nav>`;
}

function footer(ctx) {
  const { locale, graph, site } = ctx;
  const links = graph.pages.filter((p) => p.inFooter);
  const c = locale.compliance ?? {};
  const f = locale.footer ?? {};

  const helplines = c.helplines?.length
    ? `<ul>${c.helplines.map((h) => `<li>${h.url
      ? `<a href="${esc(h.url)}" rel="nofollow noopener" target="_blank">${esc(h.name)}</a>`
      : esc(h.name)}${h.phone ? `: <strong>${esc(h.phone)}</strong>` : ''}${h.note ? `<br><small>${esc(h.note)}</small>` : ''}</li>`).join('')}</ul>`
    : '';

  return `<footer class="site-foot"><div class="wrap">
<div class="site-foot__grid">

<div>
<h2>${icon('alert', { size: 16 })}${esc(f.responsibleHeading)}</h2>
<p><span class="age">${esc(locale.ui.ageWarning)}</span>${esc(c.ageStatement ?? '')}</p>
${helplines}
${c.selfExclusionUrl ? `<p><a href="${esc(c.selfExclusionUrl)}" rel="nofollow noopener" target="_blank">${esc(f.selfExclusionLink)}</a>${c.selfExclusionNote ? `<br><small>${esc(c.selfExclusionNote)}</small>` : ''}</p>` : ''}
</div>

<div>
<h2>${icon('book', { size: 16 })}${esc(f.aboutHeading)}</h2>
<ul>${links.map((p) => `<li><a href="${esc(p.url)}">${esc(locale.pageLabels[p.key] ?? p.key)}</a></li>`).join('')}</ul>
</div>

<div>
<h2>${icon('info', { size: 16 })}${esc(f.transparencyHeading)}</h2>
<p>${esc(locale.ui.affiliateDisclosure)}</p>
</div>

</div>
${siteIndex(ctx)}
<p class="site-foot__legal">${esc(c.disclaimer ?? '')}${c.regulatorNote ? ` ${esc(c.regulatorNote)}` : ''}<br>© ${site.year} ${esc(locale.site.name)}</p>
</div></footer>`;
}

/**
 * Указатель всех списков в подвале, по разделам.
 *
 * Ставится по двум причинам сразу. Первая: до него часть листингов имела
 * меньше трёх входящих ссылок — их давали карточки брендов, а карточек
 * больше нет. Вторая: из навигации листинги были достижимы только через
 * свой хаб, то есть в два перехода с главной, и половина адресов из
 * sitemap оттуда не набиралась вовсе.
 *
 * Список считается из графа, а не пишется руками: новая опубликованная
 * страница попадает сюда сама, а снятая с публикации исчезает.
 */
function siteIndex(ctx) {
  const { graph, locale } = ctx;
  const hubs = graph.pages.filter((p) => p.type === 'hub');
  const listings = graph.pages.filter((p) => p.type === 'listing');
  if (!listings.length) return '';

  const groups = hubs.map((hub) => {
    const own = listings.filter((p) => p.parent === hub.url);
    if (!own.length) return '';
    return `<div class="site-index__group">
<h3><a href="${esc(hub.url)}">${esc(locale.hubLabels[hub.key] ?? hub.key)}</a></h3>
<ul>${own.map((p) => `<li><a href="${esc(p.url)}">${esc(properLabel(p.data?.slug ?? p.key, locale))}</a></li>`).join('')}</ul>
</div>`;
  }).join('');

  if (!groups) return '';

  return `<nav class="site-index" aria-label="${esc(locale.nav.allSections ?? 'Alle Listen')}">
<h2>${icon('grid', { size: 16 })}${esc(locale.footer?.indexHeading ?? locale.nav.allSections ?? 'Alle Listen')}</h2>
<div class="site-index__cols">${groups}</div>
</nav>`;
}

// ---------------------------------------------------------------------------
// Блоки, переиспользуемые шаблонами
// ---------------------------------------------------------------------------

/**
 * Первый экран: H1, прямой ответ и строка проверки. По центру колонки.
 *
 * Сводки «Auf einen Blick» справа больше нет. Она повторяла то, что стоит
 * строкой ниже в самой таблице («10 в списке», «10/10 с лицензией»,
 * «Bestbewertet: Betano» — то же самое первой строкой), и ради повтора
 * забирала треть первого экрана и отодвигала таблицу вниз.
 *
 * Порядок в разметке важен и менять его нельзя: линтер берёт первый <p>
 * после </h1> и считает в нём слова — это и есть прямой ответ из листа 08.
 */
export function pageHead(ctx, { h1, answer, brands, author, extra = [], badge = null }) {
  return `<div class="hero">
<div class="hero__main">
${badge ? `<div class="hero__title">${badge}<h1>${esc(h1)}</h1></div>` : `<h1>${esc(h1)}</h1>`}
${answer ? `<p class="lede">${esc(answer)}</p>` : ''}
${metaRow(ctx, { brands, author, extra })}
</div>
</div>`;
}

/**
 * Таблица офферов. Лист 04: «Настоящая <table> с сортировкой, а не карточки
 * подряд». Восемь колонок из листа 08 плюс позиция и кнопки действий.
 *
 * Две вещи, которые стоит знать при правке:
 *
 * 1. Позиция живёт внутри ячейки бренда, а не отдельной колонкой. Липкой при
 *    горизонтальной прокрутке остаётся одна колонка вместо двух, и на узком
 *    экране между краями остаётся место под сами данные.
 * 2. Колонка действий липнет к правому краю. Замечание с приёмки: кнопки
 *    «отзыв» и «на сайт» должны быть видны всегда, иначе до них нужно
 *    доскроллить на каждой строке.
 *
 * На каждой строке живут data-f-* — по ним работает фильтр. На числовых
 * ячейках data-value — по ним работает сортировка. Контракты описаны в assets/js.
 */
export function offersTable(brands, ctx, { id = 'offers', showRank = true, termFilter = false } = {}) {
  const { locale, site, criteria } = ctx;
  const termsOf = termFilter ? termSlugsByBrand(ctx) : null;
  const t = locale.table;
  const u = locale.units;

  // data-sort-current ставится на ту колонку, по которой список уже
  // отсортирован сервером. Без него таблица приезжает упорядоченной, но
  // ни одна колонка об этом не сообщает: скринридер читает «нет
  // сортировки», а поле сортировки на телефоне открывается с пустым
  // выбором, хотя порядок в списке вполне определённый.
  // data-col — постоянное имя колонки, не зависящее ни от языка, ни от
  // порядка. По нему адресуются правила, которые касаются колонки целиком:
  // на печати, например, отпадают платёжные значки (в сером они не читаются)
  // и колонка лицензии (то же самое написано плашкой рядом с названием).
  // Считать колонки через nth-child для этого нельзя: порядок здесь
  // осознанно менялся и поменяется ещё.
  const th = (col, label, sort, dir, current) => sort === 'none'
    ? `<th scope="col" role="columnheader" data-col="${col}"><span>${esc(label)}</span></th>`
    : `<th scope="col" role="columnheader" data-col="${col}" data-sort="${sort}"${dir ? ` data-sort-default="${dir}"` : ''}${current ? ` data-sort-current="${current}"` : ''}>${esc(label)}</th>`;

  // Подпись ячейки в карточке. Ниже 960 px таблица разбирается на карточки,
  // и значение остаётся без заголовка колонки над ним: подпись приезжает
  // из data-label через ::before. Источник подписи тот же, что и у шапки, —
  // разойтись при правке они не могут.
  const td = (col, label, attrs, html) => `<td role="cell" data-col="${col}" data-label="${esc(label)}"${attrs ? ` ${attrs}` : ''}>${html}</td>`;

  // Порядок колонок. Оценка идёт сразу за названием, а не в конце.
  //
  // В конце она пряталась: таблица шире контейнера, колонка действий липнет
  // к правому краю и накрывала соседа слева — то есть ровно оценку, при
  // нулевой прокрутке её не было видно вообще. А оценка ещё и ключ, по
  // которому список отсортирован по умолчанию: её место рядом с брендом.
  const head = `<thead role="rowgroup"><tr role="row">
${th('brand', t.brand, 'text')}
${th('score', t.score, 'number', 'desc', 'desc')}
${th('bonus', t.bonus, 'number', 'desc')}
${th('wagering', t.wagering, 'number', 'asc')}
${th('min-deposit', t.minDeposit, 'number', 'asc')}
${th('payments', t.payments, 'none')}
${th('payout', t.payoutSpeed, 'number', 'asc')}
${th('license', t.license, 'text')}
${th('action', t.action, 'none')}
</tr></thead>`;

  const rows = brands.map((brand, index) => {
    const amount = get(brand, 'bonus.amount');
    const spins = get(brand, 'bonus.freeSpins');
    const wagering = get(brand, 'bonus.wagering');
    const applies = get(brand, 'bonus.wageringApplies');
    const minDep = get(brand, 'bonus.minDeposit');
    const payout = get(brand, 'payout.effectiveHours');
    const authority = get(brand, 'license.authority');
    const payments = get(brand, 'payments') ?? [];
    const score = brand.score.total;
    const na = `<span class="score--na">${esc(t.notChecked)}</span>`;

    return `<tr data-row role="row"${get(brand, 'license.localLicensed') ? ' data-licensed' : ''}
${termsOf ? ` data-f-term="${esc((termsOf.get(brand.slug) ?? []).join(','))}"\n` : ''} data-f-license="${esc(authority)}"
 data-f-min-deposit="${esc(minDep ?? '')}"
 data-f-payout-speed="${esc(payout ?? '')}"
 data-f-bonus-type="${esc((get(brand, 'bonus.types') ?? []).join(','))}"
 data-f-payment="${esc(payments.join(','))}">
<th scope="row" role="rowheader" data-value="${esc(brand.name)}"><div class="cell-brand">
${showRank ? `<span class="cell-brand__rank"${index < 3 ? ` data-tier="${index + 1}"` : ''} data-rank>${index + 1}</span>` : ''}
${brandLogoLink(brand, ctx, { size: 24 })}
<span class="cell-brand__body">${affiliateLink({ brand, site, label: brand.name, className: 'cell-brand__name' })}</span>
</div></th>
${td('score', t.score, `class="score ${scoreBand(score)}" data-value="${esc(score ?? '')}"`, `<b>${esc(formatScore(score, ctx))}</b><i style="--pct:${Math.round(((score ?? 0) / (criteria.scale ?? 10)) * 100)}%"></i>`)}
${td('bonus', t.bonus, `class="num" data-value="${esc(amount ?? '')}"`, `${amount == null ? na : `${esc(amount)} ${esc(u.currency)}`}${spins ? `<small>+ ${esc(spins)} ${esc(t.freeSpins)}</small>` : ''}`)}
${td('wagering', t.wagering, `class="num" data-value="${esc(wagering ?? '')}"`, `${wagering == null ? na : `${esc(wagering)}${esc(u.times)}`}${applies ? `<small>${esc(t.appliesTo[applies] ?? applies)}</small>` : ''}`)}
${td('min-deposit', t.minDeposit, `class="num" data-value="${esc(minDep ?? '')}"`, minDep == null ? na : `${esc(minDep)} ${esc(u.currency)}`)}
${td('payments', t.payments, '', paymentCell(payments, locale))}
${td('payout', t.payoutSpeed, `class="num" data-value="${esc(payout ?? '')}"`, payout == null
      ? na
      : `${icon('clock', { size: 13 })} ${esc(payout)} ${esc(u.hours)}<small>${get(brand, 'payout.isMeasured') ? `${esc(t.claimed)} ${esc(get(brand, 'payout.claimedHours'))} ${esc(u.hours)}` : esc(t.perOperator)}</small>`)}
${td('license', t.license, `data-value="${esc(authority)}"`, esc(authority))}
<td role="cell" data-col="action" class="cell-actions"><span class="cell-actions__stack">
${affiliateLink({ brand, site, label: locale.ui.visitCasino, className: 'cta', iconHtml: icon('external', { size: 13 }) })}
<a class="btn" href="${esc(urlJoin(locale.brandBase ?? 'casino', brand.slug))}">${icon('book', { size: 13 })} ${esc(locale.ui.readReview)}</a>
</span></td>
</tr>`;
  }).join('\n');

  return tableScroll(`<table id="${esc(id)}" role="table" data-sortable>${head}<tbody role="rowgroup">${rows}</tbody></table>`);
}

/**
 * Логотип, обёрнутый в ссылку на текущую промо-кампанию.
 *
 * Один адрес на все логотипы сайта, не адрес конкретного бренда — так
 * попросили явно, и он лежит в site.affiliate.logoLinkUrl. Кнопка «Zum
 * Casino» и название бренда в той же строке ведут туда же (см.
 * affiliateLink() в lib/render.js) — тоже явное требование: лого, имя
 * и кнопка теперь один и тот же вход. Отдельный переход к разбору
 * казино даёт кнопка «Zum Testbericht» рядом.
 *
 * aria-label ставится всегда, а не берётся из alt картинки: монограмма-
 * заглушка (см. brandMark) помечена aria-hidden, и без своей подписи на
 * ссылке ссылка осталась бы без доступного имени вовсе — пустая ссылка
 * это отказ WCAG 2.4.4, а не мелочь.
 */
export function brandLogoLink(brand, ctx, { size = 28 } = {}) {
  const { site, locale } = ctx;
  const mark = logoOrMark(brand, site, { size });
  const url = site.affiliate?.logoLinkUrl;
  if (!url) return mark;

  return `<a href="${esc(url)}" class="logo-link" rel="${esc(site.affiliate.rel)}"`
    + ` target="${esc(site.affiliate.target)}" data-affiliate="logo-${esc(brand.slug)}"`
    + ` aria-label="${esc(brand.name)}: ${esc(locale.ui.visitCasino)}">${mark}</a>`;
}

/**
 * Категории, в которые попадает каждый бренд.
 *
 * Нужны каталогу: строки таблицы разделов, у которых нет своей страницы,
 * ведут в общий список с готовым фильтром. Без этой карты фильтровать было
 * бы не по чему — сам бренд не знает, в какие подборки он входит, это знает
 * только граф.
 *
 * Считается один раз на сборку и кладётся в WeakMap по ctx: обходить
 * шестьдесят термов на каждую из восемнадцати строк в каждом вызове
 * таблицы значило бы делать одну и ту же работу заново.
 */
const TERM_SLUGS = new WeakMap();

function termSlugsByBrand(ctx) {
  const cached = TERM_SLUGS.get(ctx);
  if (cached) return cached;

  const map = new Map();
  for (const entry of ctx.graph?.resolvedTerms ?? []) {
    for (const brand of entry.brands ?? []) {
      const list = map.get(brand.slug);
      if (list) list.push(entry.slug);
      else map.set(brand.slug, [entry.slug]);
    }
  }

  TERM_SLUGS.set(ctx, map);
  return map;
}

/**
 * JSON внутрь <script type="application/json">.
 *
 * Экранируется только «<»: внутри такого блока браузер ищет закрывающий
 * тег текстом, и подстрока «</script» в любом значении оборвала бы блок
 * посреди данных. < для JSON.parse — тот же символ.
 */
function jsonBlock(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Подписи категорий для чипа «отфильтровано по…». Только те, где есть бренды. */
function termLabelMap(ctx) {
  const labels = {};
  for (const entry of ctx.graph?.resolvedTerms ?? []) {
    if (entry.brands?.length) labels[entry.slug] = properLabel(entry.slug, ctx.locale);
  }
  return labels;
}

/**
 * Ячейка платежей. Иконка по типу метода, не логотип: логотипы платёжных
 * систем — чужие товарные знаки, а перерисованные «похоже» они выглядят
 * подделкой. Тип (карта, кошелёк, банк, ваучер, крипта) человеку и нужен,
 * а название стоит подписью.
 */
function paymentCell(payments, locale) {
  if (!payments.length) return '';

  // Четыре знака в свёрнутом виде: пятый не помещался в колонку и
  // переносился на вторую строку, задирая высоту каждой строки таблицы.
  const MARKS = 4;

  // Сначала методы, у которых есть настоящий логотип: четыре знака Visa,
  // Mastercard и PayPal отвечают на вопрос сразу, а четыре одинаковых
  // прямоугольника «карта» не отвечают ни на что.
  const ordered = [...payments].sort((a, b) => Number(hasPaymentLogo(b)) - Number(hasPaymentLogo(a)));
  const tile = (method) => {
    const label = properLabel(method, locale);
    return `<span class="cell-pay__type" title="${esc(label)}">${paymentIcon(method, { size: 18, label })}</span>`;
  };

  const marks = ordered.slice(0, MARKS).map(tile).join('');
  const rest = payments.length - Math.min(MARKS, payments.length);
  const shown = ordered.slice(0, 2).map((m) => properLabel(m, locale)).join(', ');

  // Список целиком раскрывается по нажатию.
  //
  // Раньше остаток прятался за «+6», и что за этими шестью стоит, узнать
  // было негде: подсказка в title не открывается пальцем, а на странице
  // «PayPal Casino» вопрос «а Skrill тут есть» — ровно тот, с которым
  // человек пришёл.
  //
  // Нативный <details>: работает без JS, открывается с клавиатуры, и
  // раскрытие задирает высоту только своей строки. Разворачивать список
  // на всю ширину таблицы было бы просторнее, но для этого нужен
  // второй <tr>, а он сломал бы и сортировку, и фильтр — оба ходят по
  // строкам таблицы как по списку предложений.
  // Методов не больше, чем помещается в свёрнутый вид: раскрывать нечего.
  if (!rest) return `<span class="cell-pay">${marks}</span><small>${esc(shown)}</small>`;

  // Раскрытый вид — все методы теми же плитками и теми же рядами по четыре,
  // что и в свёрнутом. Подпись «Visa, Mastercard +6» при этом уходит: она
  // пересказывала ровно то, что теперь видно целиком.
  const full = ordered.slice(MARKS).map((method) => `<li>${tile(method)}</li>`).join('');

  return `<details class="pay">
<summary class="pay__summary"><span class="cell-pay">${marks}</span><small><span>${esc(shown)} +${rest}</span></small></summary>
<ul class="pay__list">${full}</ul>
</details>`;
}

/**
 * Фильтры. Лист 08: по бонусу, минимальному депозиту, скорости вывода
 * и лицензии. Варианты строятся из фактического состава листинга — опций,
 * которые ничего не находят, не бывает.
 */
export function filterForm(brands, ctx, { targetId = 'offers', termFilter = false } = {}) {
  const { locale } = ctx;
  const f = locale.filters;

  const licences = [...new Set(brands.map((b) => get(b, 'license.authority')))].sort();
  const bonusTypes = [...new Set(brands.flatMap((b) => get(b, 'bonus.types') ?? []))].sort();
  const depositSteps = [5, 10, 20, 50].filter((s) => brands.some((b) => get(b, 'bonus.minDeposit') != null && get(b, 'bonus.minDeposit') <= s));
  const payoutSteps = [24, 48, 72, 120].filter((s) => brands.some((b) => get(b, 'payout.effectiveHours') != null && get(b, 'payout.effectiveHours') <= s));

  const field = (id, label, attrs, options) => options.length ? `<div class="filters__field">
<label for="${id}">${esc(label)}</label>
<select id="${id}" ${attrs}><option value="">${esc(f.any)}</option>${options}</select>
</div>` : '';

  // <details> вокруг формы, а не вместо неё: на широком экране раскрыт
  // (open), на узком CSS его схлопывает. Без JS работает и там и там.
  return `<details class="filters-wrap" open>
<summary class="filters__toggle">${icon('filter', { size: 15 })}<span>${esc(f.heading ?? f.any)}</span></summary>
<form class="filters" id="filters-${esc(targetId)}" data-filter-form data-filter-target="#${esc(targetId)}" data-filter-sync-url>
<p class="filters__legend">${icon('filter', { size: 15 })}${esc(f.heading ?? f.any)}</p>
${sortField(targetId, locale)}
${field('f-bonus', f.bonusType, 'data-filter-field="bonus-type" data-filter-op="includes"',
    bonusTypes.map((t) => `<option value="${esc(t)}">${esc(properLabel(t, locale))}</option>`).join(''))}
${field('f-dep', f.minDeposit, 'data-filter-field="min-deposit" data-filter-op="lte"',
    depositSteps.map((s) => `<option value="${s}">${esc(f.upTo)} ${s} ${esc(locale.units.currency)}</option>`).join(''))}
${field('f-payout', f.payoutSpeed, 'data-filter-field="payout-speed" data-filter-op="lte"',
    payoutSteps.map((s) => `<option value="${s}">${esc(f.upTo)} ${s} ${esc(locale.units.hours)}</option>`).join(''))}
${field('f-lic', f.license, 'data-filter-field="license" data-filter-op="eq"',
    licences.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join(''))}
${termFilter ? '<input type="hidden" value="" data-filter-field="term" data-filter-op="includes">' : ''}
<p class="filters__status"><output data-filter-count>${brands.length}</output> ${esc(locale.ui.resultsCount)}</p>
<button type="button" data-filter-reset hidden>${icon('close', { size: 13 })}${esc(locale.ui.resetFilters)}</button>
</form>
</details>
${termFilter ? `<p class="context-filter" data-context-filter hidden>
${icon('filter', { size: 15 })}<span data-context-label></span>
<button type="button" form="filters-${esc(targetId)}" data-filter-reset>${icon('close', { size: 13 })}${esc(locale.ui.showAll ?? locale.ui.resetFilters)}</button>
</p>
<script type="application/json" data-term-labels>${jsonBlock(termLabelMap(ctx))}</script>` : ''}
<div class="empty-note" data-filter-empty="#${esc(targetId)}" hidden>
<p>${esc(locale.ui.noResults)}</p>
<button type="button" form="filters-${esc(targetId)}" data-filter-reset>${icon('close', { size: 14 })}${esc(locale.ui.resetFilters)}</button>
</div>`;
}

/**
 * Поле сортировки для узкого экрана.
 *
 * Ниже 960 px таблица разбирается на карточки, шапка с кнопками сортировки
 * при этом уезжает — а сортировка на телефоне нужна ровно так же, как на
 * мониторе: «покажи с самым мягким умсатцем» это и есть вопрос, с которым
 * человек пришёл.
 *
 * Пустой <select> и ни одной строчки о колонках: варианты соберёт
 * table-sort.js из шапки той же таблицы. Дублировать здесь список колонок
 * значило бы завести второй источник, который разойдётся с первым при
 * первой же правке таблицы.
 *
 * Поле приезжает hidden и открывается скриптом. Без JS сортировки нет и
 * быть не может, так что показывать неработающий орган управления незачем;
 * порядок по умолчанию — наш рейтинг — уже проставлен на сервере.
 *
 * Подписи направлений едут data-атрибутами: assets/js не знает ни одного
 * языка, и это его контракт, а не случайность.
 */
function sortField(targetId, locale) {
  const u = locale.ui;
  return `<div class="filters__field filters__field--sort" data-sort-field hidden>
<label for="f-sort">${esc(u.sortBy)}</label>
<select id="f-sort" data-sort-select data-sort-target="#${esc(targetId)}"
 data-label-desc="${esc(u.sortHighFirst ?? '')}"
 data-label-asc="${esc(u.sortLowFirst ?? '')}"
 data-label-text="${esc(u.sortAlpha ?? '')}"></select>
</div>`;
}

/**
 * FAQ на нативных <details> (лист 08). Возвращает и разметку, и узел FAQPage,
 * чтобы схема не могла разойтись с тем, что выведено на странице (лист 09).
 */
export function faqBlock(items, ctx) {
  if (!items?.length) return { html: '', node: null };

  const html = `<section class="section" data-faq>
<h2>${icon('info', { size: 18 })}${esc(ctx.locale.ui.faq)}</h2>
${items.map((item) => `<details><summary data-faq-question>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('\n')}
</section>`;

  return { html, node: faqPage(items) };
}

/** Строка метаданных под H1: дата сверки, автор, число позиций. */
export function metaRow(ctx, { brands, author, extra = [] } = {}) {
  const { locale } = ctx;
  const parts = [];

  if (brands?.length) {
    const dates = brands.flatMap((b) => [get(b, 'bonus.checkedAt'), get(b, 'payout.checkedAt')]).filter(Boolean).sort();
    const latest = dates.length ? dates[dates.length - 1] : null;
    if (latest) {
      parts.push(`${icon('calendar', { size: 14 })}<time datetime="${esc(isoDate(latest))}" data-checked>${esc(locale.ui.checkedOn)} ${esc(latest)}</time>`);
    }
  }
  if (author) {
    parts.push(`${icon('user', { size: 14 })}${esc(locale.ui.author)}: <a href="${esc(author.url)}" rel="author">${esc(author.name)}</a>, ${esc(locale.authorRoles?.[author.role] ?? author.role)}`);
  }
  parts.push(...extra);

  return parts.length
    ? `<p class="meta-row">${parts.map((part) => `<span>${part}</span>`).join('')}</p>`
    : '';
}

/**
 * Раскрытие партнёрского статуса над сгибом (лист 04).
 *
 * Свёрнуто в одну строку: требование — «на видном месте», а не «занимает
 * четверть первого экрана». Заголовок виден всегда, полный текст открывается
 * нажатием и целиком лежит в HTML, поэтому индексируется в любом случае.
 */
export function disclosure(ctx) {
  const { locale } = ctx;
  return `<details class="disclosure">
<summary>${icon('info', { size: 15 })}${esc(locale.ui.affiliateDisclosureShort ?? locale.ui.affiliateDisclosure)}</summary>
<p>${esc(locale.ui.affiliateDisclosure)}</p>
</details>`;
}

/**
 * Таблица фактов: строка — не оффер, а категория, метод оплаты, студия или
 * лицензия. Разметка та же, что у таблицы офферов, потому что на ней уже
 * держатся три вещи: сортировка по клику на заголовке, разбор на карточки
 * ниже 960 px и печатная версия. Заводить для сводных таблиц второй набор
 * правил значило бы чинить каждую из них дважды.
 *
 * Отличий от offersTable два. Колонки приходят снаружи: у семи разделов
 * сайта они разные, и общий набор превратил бы разделы в семь копий одной
 * таблицы. И минимальная ширина задаётся на месте — 56rem рассчитаны на
 * девять колонок, а на пяти они растягивают таблицу в прокрутку на пустом
 * месте.
 *
 * columns: [{ col, label, sort, dir, current }]
 * rows:    [{ html, value, note, cells: [{ html, value, className }] }]
 */
export function factsTable(ctx, { id, headLabel, headCol = 'name', columns, rows, minWidth = '46rem', caption = null }) {
  if (!rows?.length) return '';

  const head = `<thead role="rowgroup"><tr role="row">
<th scope="col" role="columnheader" data-col="${esc(headCol)}" data-sort="text">${esc(headLabel)}</th>
${columns.map((column) => `<th scope="col" role="columnheader" data-col="${esc(column.col)}" data-sort="${esc(column.sort ?? 'number')}"${column.dir ? ` data-sort-default="${esc(column.dir)}"` : ''}${column.current ? ` data-sort-current="${esc(column.current)}"` : ''}>${esc(column.label)}</th>`).join('\n')}
</tr></thead>`;

  const body = rows.map((row) => `<tr data-row role="row">
<th scope="row" role="rowheader" data-value="${esc(row.value ?? '')}">${row.html}${row.note ? `<small>${esc(row.note)}</small>` : ''}</th>
${row.cells.map((cell, index) => {
    const column = columns[index];
    return `<td role="cell" data-col="${esc(column.col)}" data-label="${esc(column.label)}" class="${esc(cell.className ?? 'num')}"${cell.value == null ? '' : ` data-value="${esc(cell.value)}"`}>${cell.html}</td>`;
  }).join('\n')}
</tr>`).join('\n');

  return tableScroll(`<table id="${esc(id)}" class="table--facts" style="--table-min:${esc(minWidth)}" role="table" data-sortable>${caption ? `<caption>${esc(caption)}</caption>` : ''}${head}<tbody role="rowgroup">${body}</tbody></table>`);
}

/**
 * Три шага со значками.
 *
 * На служебных страницах до первой таблицы лежало по девятьсот знаков
 * сплошного текста в четыре абзаца, и читать их никто не будет: человек
 * пришёл посмотреть, как считается оценка, а не прочитать эссе о том, как
 * она считается. Шаг отвечает на тот же вопрос значком и одной строкой.
 *
 * Нумерация настоящая, через counter: порядок здесь и есть содержание.
 */
export function steps(items, ctx) {
  if (!items?.length) return '';

  return `<ol class="steps">
${items.map((item) => `<li class="steps__item">
<span class="steps__mark">${icon(item.icon ?? 'check', { size: 20 })}</span>
<h3>${esc(item.title)}</h3>
<p>${esc(item.text)}</p>
</li>`).join('\n')}
</ol>`;
}

/**
 * Стопка весов: шесть кусков одной полосы в сумме на сто процентов.
 *
 * Таблица весов ниже отвечает на вопрос «сколько у какого критерия», но не
 * на вопрос «как это выглядит целиком» — а именно он и объясняет формулу
 * человеку, который в таблицу вчитываться не станет. Числа те же самые и
 * из того же criteria.json: разойтись им негде.
 */
export function weightStack(criteria, ctx, caption) {
  const list = criteria?.criteria ?? [];
  if (!list.length) return '';
  const { locale } = ctx;

  return `<figure class="stack">
<div class="stack__bar" role="img" aria-label="${esc(list.map((c) => `${locale.criteria[c.id] ?? c.id} ${c.weight} %`).join(', '))}">
${list.map((c, index) => `<span class="stack__seg" data-tone="${index % 3}" style="--share:${c.weight}"></span>`).join('')}
</div>
<ul class="stack__key">
${list.map((c, index) => `<li><i data-tone="${index % 3}"></i>${esc(locale.criteria[c.id] ?? c.id)} <b>${c.weight} %</b></li>`).join('\n')}
</ul>
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
</figure>`;
}


/**
 * Текстовые разделы страницы из локали.
 *
 * Требование к контенту: от пяти тысяч знаков собственного текста и разный
 * набор блоков по страницам. Текст держится в локали, а не в шаблоне, —
 * правка формулировки не должна быть правкой кода, и переводу на другой
 * язык нужен один файл, а не семь.
 */
export function proseSections(sections) {
  if (!sections?.length) return '';

  return sections.map((section) => `<section class="section">
<h2>${esc(section.heading)}</h2>
${section.body.map((text) => `<p>${esc(text)}</p>`).join('\n')}
</section>`).join('\n');
}

/** Пометка о незавершённом блоке. Убирается вместе с дописанным контентом. */
export function standNote(text) {
  return `<p class="stand-note">${icon('alert', { size: 15 })}<span>${esc(text)}</span></p>`;
}

// ---------------------------------------------------------------------------
// Атомарные компоненты редизайна 2026.1 (bento/glass, светлая тема)
// ---------------------------------------------------------------------------

/**
 * Кольцевой бейдж оценки (RatingBadge). Тот же --pct-приём, что у табличного
 * .score i (см. main.css), но для мест, где оценка — не строка данных, а
 * самостоятельный акцент: бенто-карточка, шапка обзора казино. Пороги и
 * цвет — те же scoreBand()/formatScore(), что уже красят .score в таблице:
 * разойтись с ней бейдж не может, оба берут число из одного места.
 */
export function ratingBadge(value, ctx, { size = 'md' } = {}) {
  const scale = ctx.criteria?.scale ?? 10;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Math.round((value / scale) * 100)));
  const band = scoreBand(value);
  const cls = ['rating-badge', band, size === 'lg' ? 'rating-badge--lg' : ''].filter(Boolean).join(' ');
  return `<span class="${cls}" style="--pct:${pct}%"><span class="rating-badge__value">${esc(formatScore(value, ctx))}</span></span>`;
}

/**
 * Пилюля суммы бонуса (BonusPill). Те же поля, что offersTable() уже
 * показывает в своей колонке — здесь просто вынесены в переиспользуемый
 * блок для бенто-карточек и шапки обзора, без второго источника данных.
 */
export function bonusPill(brand, ctx) {
  const { locale } = ctx;
  const amount = get(brand, 'bonus.amount');
  if (amount == null) return `<span class="bonus-pill"><b>${esc(locale.table.notChecked)}</b></span>`;
  const spins = get(brand, 'bonus.freeSpins');
  return `<span class="bonus-pill"><b>${esc(amount)} ${esc(locale.units.currency)}</b>`
    + `${spins ? `<small>+ ${esc(spins)} ${esc(locale.table.freeSpins)}</small>` : ''}</span>`;
}

/**
 * Строка Quick Metrics: скорость выплат, вейджер и минимальный депозит
 * одним взглядом — те же поля brand.payout и brand.bonus, что уже читает
 * offersTable(), просто без остальных семи колонок вокруг. «Хорошее»
 * значение (выплата в течение суток) подсвечивается тем же зелёным, что и
 * .score.is-high — второго языка цвета для «это хорошо» на сайте нет.
 */
export function quickMetrics(brand, ctx) {
  const { locale } = ctx;
  const u = locale.units;
  const t = locale.table;
  const payout = get(brand, 'payout.effectiveHours');
  const wagering = get(brand, 'bonus.wagering');
  const minDep = get(brand, 'bonus.minDeposit');
  const na = `<span class="score--na">${esc(t.notChecked)}</span>`;

  const items = [
    {
      icon: 'clock', label: t.payoutSpeed,
      value: payout == null ? na : `${esc(payout)} ${esc(u.hours)}`,
      good: payout != null && payout <= 24,
    },
    {
      icon: 'repeat', label: t.wagering,
      value: wagering == null ? na : `${esc(wagering)}${esc(u.times)}`,
    },
    {
      icon: 'coins', label: t.minDeposit,
      value: minDep == null ? na : `${esc(minDep)} ${esc(u.currency)}`,
    },
  ];

  return `<div class="badge-metrics">${items.map((item) => `<span class="badge-metric${item.good ? ' badge-metric--good' : ''}">
<span class="badge-metric__label">${icon(item.icon, { size: 12 })}${esc(item.label)}</span>
<span class="badge-metric__value">${item.value}</span>
</span>`).join('')}</div>`;
}

/**
 * Карточка казино (Casino Card) — единый bento-компонент вместо трёх
 * разрозненных вручную свёрстанных .card--top/.card, что раньше писал
 * каждый шаблон отдельно (home.js топ-3, brand.js «похожие казино»). Один
 * источник разметки: правка карточки — теперь одна правка, а не три.
 *
 * variant: 'featured' — полная карточка топ-листа (медаль, бонус, Quick
 * Metrics, pros/cons, двойной CTA «Zum Casino» / «Zum Testbericht»);
 * 'compact' — лёгкая карточка для «похожие казино»: рейтинг, лицензия,
 * ссылка на обзор, без повторного CTA — предложение уже сделано на текущей
 * странице бренда.
 *
 * note/payments — необязательные: собственный редакционный текст про
 * конкретную карточку и список платёжных методов со ссылками. Их считает
 * вызывающий шаблон (там же, где раньше считал paymentUrl()) — компонент
 * сам по графу страниц не ходит.
 *
 * spotlight/ribbon — ровно одна карточка на странице (обычно первая в
 * топ-листе) может получить пульсирующий CTA и ленточку сверху («Top Pick»
 * из брифа). Остальные карточки того же грида — с обычным CTA: три
 * одновременно пульсирующие кнопки на одном экране — это и есть тот самый
 * «кричащий гемблинг-стиль 2010-х», от которого просили уйти, а не премиум.
 */
export function brandCard(brand, ctx, {
  rank = null, variant = 'featured', note = null, payments = null, spotlight = false, ribbon = null,
} = {}) {
  const { site, locale } = ctx;
  const licensed = get(brand, 'license.localLicensed');
  const reviewUrl = urlJoin(locale.brandBase ?? 'casino', brand.slug);

  const pros = (brand.pros ?? []).slice(0, 2);
  const cons = (brand.cons ?? []).slice(0, 1);
  const tags = pros.length || cons.length
    ? `<ul class="pro-cons-tags">
${pros.map((p) => `<li class="is-pro">${icon('check', { size: 11 })}${esc(p)}</li>`).join('')}
${cons.map((c) => `<li class="is-con">${icon('minus', { size: 11 })}${esc(c)}</li>`).join('')}
</ul>`
    : '';

  const paymentChips = payments?.length
    ? `<ul class="chips">${payments.map((p) => `<li><a href="${esc(p.url)}">${paymentIcon(p.method, { size: 13 })}${esc(properLabel(p.method, locale))}</a></li>`).join('')}</ul>`
    : '';

  const ctaClass = spotlight ? 'cta cta--glow' : 'cta';
  const cta = variant === 'featured' && brand.affiliate?.active
    ? `<div class="bento-card__actions">
${affiliateLink({ brand, site, label: locale.ui.visitCasino, className: ctaClass, iconHtml: icon('external', { size: 13 }) })}
<a class="btn" href="${esc(reviewUrl)}">${icon('book', { size: 13 })} ${esc(locale.ui.readReview)}</a>
</div>`
    : `<a class="btn" href="${esc(reviewUrl)}">${icon('book', { size: 13 })} ${esc(locale.ui.readReview)}</a>`;

  const classes = ['card', 'bento', 'bento-card'];
  if (variant === 'featured') classes.push('bento--featured');
  if (spotlight) classes.push('bento-card--spotlight');

  return `<li class="${classes.join(' ')}">
${ribbon ? `<span class="bento-card__ribbon">${icon('star', { size: 11 })}${esc(ribbon)}</span>` : ''}
<div class="bento-card__head">
${rank ? `<span class="cell-brand__rank" data-tier="${rank}">${rank}</span>` : ''}
${brandLogoLink(brand, ctx, { size: 40 })}
${ratingBadge(brand.score?.total, ctx, { size: 'lg' })}
</div>
<h3><a href="${esc(reviewUrl)}">${esc(brand.name)}</a></h3>
<p class="card__meta">
<span class="pill">${icon('shield', { size: 11 })}${esc(get(brand, 'license.authority'))}</span>
${licensed ? `<span class="pill pill--ok">${esc(locale.table.germanLicence)}</span>` : '<span class="pill pill--no">ohne deutsche Lizenz</span>'}
</p>
${variant === 'featured' ? bonusPill(brand, ctx) : ''}
${variant === 'featured' ? quickMetrics(brand, ctx) : ''}
${tags}
${note ? `<p>${esc(note)}</p>` : ''}
${paymentChips}
${cta}
</li>`;
}

/**
 * Плавающая плашка с бонусом при скролле (Sticky/Floating Bar из брифа).
 * Появляется, только когда основной CTA над сгибом уходит из вьюпорта —
 * следит assets/js/sticky-cta.js через IntersectionObserver на элементе
 * с data-sticky-watch. hidden по умолчанию: без JS основной CTA и так
 * виден на первом экране (см. вызов в brand.js), дублировать его в
 * разметке без скрипта, решающего когда его показать, было бы лишним
 * элементом страницы, который никогда не появляется.
 */
export function stickyBonusBar(brand, ctx) {
  if (!brand.affiliate?.active) return '';
  const { site, locale } = ctx;
  return `<div class="sticky-bonus" data-sticky-bonus hidden>
<div class="sticky-bonus__brand">${logoOrMark(brand, site, { size: 28 })}<strong>${esc(brand.name)}</strong></div>
${bonusPill(brand, ctx)}
${affiliateLink({ brand, site, label: locale.ui.visitCasino, className: 'cta', iconHtml: icon('external', { size: 13 }) })}
</div>`;
}

/**
 * Радар критериев оценки — инлайновый SVG, без единой зависимости (лист
 * package.json: «Zero dependencies by design»). Строится по тому же
 * brand.score.breakdown, что и factsTable() в scoreBreakdown() (brand.js):
 * таблицу не заменяет — сортировка, печать и скринридер остаются на ней,
 * диаграмма её визуальный компаньон. Меньше трёх осей рисовать нечего —
 * многоугольник из двух точек не читается, возвращаем пусто.
 */
export function radarChart(breakdown, ctx) {
  const list = (breakdown ?? []).filter((c) => !c.skipped && c.score != null);
  if (list.length < 3) return '';

  const { locale } = ctx;
  const scale = ctx.criteria?.scale ?? 10;
  const n = list.length;
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const R = 76;

  const point = (i, r) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const fmt = (n2) => n2.toFixed(1);

  const rings = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = list.map((_, i) => point(i, R * f).map(fmt).join(',')).join(' ');
    return `<polygon class="radar-grid" points="${pts}"/>`;
  }).join('');

  const axes = list.map((_, i) => {
    const [x, y] = point(i, R);
    return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${fmt(x)}" y2="${fmt(y)}"/>`;
  }).join('');

  const ratioOf = (c) => Math.max(0, Math.min(1, c.score / scale));
  const shapePts = list.map((c, i) => point(i, R * ratioOf(c)).map(fmt).join(',')).join(' ');
  const dots = list.map((c, i) => {
    const [x, y] = point(i, R * ratioOf(c));
    return `<circle class="radar-dot" cx="${fmt(x)}" cy="${fmt(y)}" r="3"/>`;
  }).join('');

  // Номер вместо полного названия критерия: «Zahlungsmethoden» и «Support
  // und Mobil» в подписи прямо на диаграмме обрезались о край SVG — немецкие
  // названия критериев для этого попросту длинные, и укоротить их нельзя
  // (это не наш текст, а locale.criteria). Цифра у вершины плюс та же
  // цифра в легенде справа — расшифровка не теряется, просто не пытается
  // уместиться в стеснённом углу диаграммы.
  const labels = list.map((c, i) => {
    const [x, y] = point(i, R + 16);
    return `<circle class="radar-label-bg" cx="${fmt(x)}" cy="${fmt(y)}" r="8"/>`
      + `<text class="radar-label" x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`;
  }).join('');

  const key = list.map((c, i) => `<li><span><b class="radar__key-num">${i + 1}</b>${esc(locale.criteria[c.id] ?? c.id)}</span><b>${esc(formatScore(c.score, ctx))}</b></li>`).join('');

  return `<div class="radar">
<svg class="radar__chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(locale.ui.methodology ?? 'Kriterien')}">
${rings}${axes}
<polygon class="radar-shape" points="${shapePts}"/>
${dots}
${labels}
</svg>
<ul class="radar__key">${key}</ul>
</div>`;
}

export {
  esc, logo, affiliateLink, get, icon, paymentIcon, logoOrMark,
};
