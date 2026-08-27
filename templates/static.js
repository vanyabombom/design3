/**
 * Служебные страницы.
 *
 * /so-testen-wir/ особенная: она не пишется руками, а генерируется из
 * data/criteria.json — из того же файла, по которому считаются все оценки.
 * Это единственный способ гарантировать, что опубликованная методика и
 * фактический расчёт не разойдутся, а лист 04 разрешает AggregateRating
 * только при наличии такой страницы.
 *
 * Пояснения к критериям берутся из локали, а не из комментариев в JSON:
 * комментарии там служебные и на русском.
 */

import { document_, pageHead, faqBlock, factsTable, steps, weightStack, proseSections, esc, get, icon } from './_lib/layout.js';
import { pageH1, properLabel, resolveAuthor } from '../lib/labels.js';
import { urlJoin } from '../lib/util.js';

export function render(ctx, page) {
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);

  const body = page.generatedFrom === 'criteria'
    ? methodology(ctx)
    : staticBody(page.key, ctx);

  const faq = body.faq ? faqBlock(body.faq, ctx) : { html: '', node: null };

  const main = `
${pageHead(ctx, { h1, answer: body.lede ?? null, author: page.key === 'responsible-gambling' || page.key === '404' ? null : author })}
<div class="prose">${body.html}</div>
${faq.html}
`;

  return document_(ctx, page, { main, jsonLd: [faq.node], h1 });
}

/** /so-testen-wir/ — человекочитаемая версия criteria.json. */
function methodology(ctx) {
  const { criteria, locale, brands } = ctx;
  const active = brands.filter((b) => b.status === 'active');
  const provisional = active.filter((b) => get(b, 'payout.provisional'));
  const why = locale.criteriaWhy ?? {};
  const m = locale.methodology ?? {};
  const maxWeight = Math.max(...criteria.criteria.map((c) => c.weight));

  const html = `
${steps(locale.guide?.howWeTest, ctx)}

${provisional.length ? `<div class="callout">
<p><strong>${esc(m.pendingLabel)}</strong> ${provisional.length} ${esc(m.pendingBody)}</p>
</div>` : ''}

<section class="section">
<h2>${esc(m.weightsHeading)}</h2>
${weightStack(criteria, ctx, locale.guide?.weightsCaption)}
<div class="table-scroll" data-table-scroll>
<table class="table--facts" style="--table-min:34rem" data-sortable>
<thead><tr>
<th scope="col" data-sort="text">${esc(m.colCriterion)}</th>
<th scope="col" data-sort="number" data-sort-default="desc">${esc(m.colWeight)}</th>
<th scope="col" data-sort="none">${esc(m.colWhy)}</th>
</tr></thead>
<tbody>
${criteria.criteria.map((c) => `<tr data-row>
<th scope="row" data-value="${esc(locale.criteria[c.id] ?? c.id)}">${esc(locale.criteria[c.id] ?? c.id)}</th>
<td class="num weight" data-label="${esc(m.colWeight)}" data-value="${c.weight}"><b>${c.weight} %</b><i style="--pct:${Math.round((c.weight / maxWeight) * 100)}%"></i></td>
<td data-label="${esc(m.colWhy)}">${esc(why[c.id] ?? '')}</td>
</tr>`).join('\n')}
</tbody></table></div>
</section>

<section class="section">
<h2>${esc(m.rulesHeading)}</h2>
<p>${esc(m.rulesIntro)}</p>
${criteria.criteria.map((c) => `
<details>
<summary>${esc(locale.criteria[c.id] ?? c.id)}: ${c.weight} %</summary>
<ul>
${c.rules.map((rule) => `<li><strong>${esc(locale.ruleLabels?.[rule.id] ?? rule.id)}</strong> (${rule.share} % ${esc(m.ofCriterion)}): ${esc(describeRule(rule, locale, m))}</li>`).join('\n')}
</ul>
</details>`).join('\n')}
</section>

<section class="section">
<h2>${esc(m.notScoredHeading)}</h2>
<p>${esc(m.notScoredBody1)}</p>
<p>${esc(m.notScoredBody2)}</p>
</section>

<section class="section">
<h2>${esc(m.missingHeading)}</h2>
<p>${esc(m.missingBody)}</p>
</section>
`;

  return { lede: m.lede, html, faq: m.faq ?? [] };
}

/** Значок по инструменту. Тип действия, а не украшение: замок, часы, стоп. */
const TOOL_ICONS = {
  'deposit-limit': 'card',
  'loss-limit': 'alert',
  'time-limit': 'clock',
  'reality-check': 'info',
  'time-out': 'clock',
  'self-exclusion': 'shield',
  'national-register': 'shield',
};

/**
 * Инструменты самоограничения и кто их даёт.
 *
 * До этого страница объясняла лимиты словами и на этом заканчивалась. Что
 * из перечисленного реально есть у площадок из наших списков, человек мог
 * узнать только открыв каждую. Таблица собирается из того же поля
 * security.responsibleTools, по которому считается критерий доверия, — то
 * есть из проверенных данных, а не из обещаний оператора.
 *
 * Ссылок здесь нет ни одной: лист 02 запрещает на этой странице офферы и
 * CTA, и линтер проверяет это отдельным правилом.
 */
function toolsTable(ctx) {
  const { locale, brands } = ctx;
  const t = locale.toolsTable;
  if (!t) return '';

  const active = brands.filter((b) => b.status === 'active');
  const order = Object.keys(t.what ?? {});
  const used = new Set(active.flatMap((b) => get(b, 'security.responsibleTools') ?? []));
  const tools = [...order.filter((tool) => used.has(tool)), ...[...used].filter((tool) => !order.includes(tool))];
  if (!tools.length) return '';

  const rows = tools.map((tool) => {
    const own = active.filter((b) => (get(b, 'security.responsibleTools') ?? []).includes(tool));
    const licensed = own.filter((b) => get(b, 'license.localLicensed'));

    return {
      value: properLabel(tool, locale),
      // Значок в акцентном цвете. Семь строк подряд одним серым читались как
      // список условий из договора, а это единственная страница сайта, куда
      // человек приходит не выбирать казино.
      html: `<span class="tool">${icon(TOOL_ICONS[tool] ?? 'shield', { size: 16 })}${esc(properLabel(tool, locale))}</span>`,
      cells: [
        { value: null, html: esc(t.what?.[tool] ?? ''), className: 'facts-what' },
        { value: own.length, html: String(own.length) },
        { value: licensed.length, html: String(licensed.length) },
      ],
    };
  });

  return `<section class="section">
<h2>${esc(t.heading)}</h2>
<p>${esc(t.intro)}</p>
${factsTable(ctx, {
    id: 'protection-tools',
    headCol: 'tool',
    headLabel: t.colTool,
    minWidth: '46rem',
    columns: [
      { col: 'what', label: t.colWhat, sort: 'none' },
      { col: 'brands', label: t.colBrands, sort: 'number', dir: 'desc' },
      { col: 'licensed', label: t.colLicensed, sort: 'number', dir: 'desc' },
    ],
    rows,
  })}
</section>`;
}

/**
 * Что подтверждено у источника, а что нет.
 *
 * Страница редакционных принципов до этого состояла из обещаний: «проверяем
 * у источника», «не додумываем». Проверить эти обещания читателю было
 * нечем. Таблица считает их прямо по данным: каждый датасет бренда несёт
 * dataNotes.unverified — список полей, которые при последней сверке
 * подтвердить не удалось. Здесь они складываются.
 *
 * Порядок строк — по числу непроверенного, сверху то, где дырок больше
 * всего. Прятать это в конец было бы ровно тем, за что мы ругаем чужие
 * обзорники.
 */
function sourcesTable(ctx) {
  const { locale, brands } = ctx;
  const t = locale.sourcesTable;
  if (!t) return '';

  const active = brands.filter((b) => b.status === 'active');
  if (!active.length) return '';

  const open = new Map();
  for (const brand of active) {
    for (const field of get(brand, 'dataNotes.unverified') ?? []) {
      open.set(field, (open.get(field) ?? 0) + 1);
    }
  }

  // Поля, которые печатаются в таблицах и подтверждены у всех: без них
  // сводка выглядела бы так, будто проверено вообще ничего.
  for (const field of ['payout.medianHours', 'license.authority', 'payments']) {
    if (!open.has(field)) open.set(field, 0);
  }

  const rows = [...open.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field, missing]) => {
      const label = t.fields?.[field] ?? field;
      const checked = active.length - missing;
      // Цвет по смыслу: подтверждено у всех — зелёное, есть дырки — янтарное.
      // Красного нет намеренно: непроверенное поле это не ошибка, а работа,
      // которую мы ещё не сделали и о которой честно пишем.
      return {
        value: label,
        html: esc(label),
        cells: [
          { value: checked, className: `num tally ${missing ? '' : 'is-full'}`, html: String(checked) },
          { value: missing, className: `num tally ${missing ? 'is-gap' : ''}`, html: String(missing) },
        ],
      };
    });

  return `<section class="section">
<h2>${esc(t.heading)}</h2>
<p>${esc(String(t.intro).replace('{count}', active.length))}</p>
${factsTable(ctx, {
    id: 'data-provenance',
    headCol: 'field',
    headLabel: t.colField,
    minWidth: '38rem',
    columns: [
      { col: 'checked', label: t.colChecked, sort: 'number', dir: 'desc' },
      { col: 'open', label: t.colOpen, sort: 'number', dir: 'desc' },
    ],
    rows,
  })}
<p class="facts-foot">${esc(t.foot)}</p>
</section>`;
}

/** Правило в человеческом виде: поля, пороги, баллы. */
function describeRule(rule, locale, m) {
  const unit = rule.unitKey ? (locale.units[rule.unitKey.replace('unit.', '')] ?? '') : '';

  if (rule.type === 'bool') {
    return `${m.yesGives} ${rule.trueValue}, ${m.noGives} ${rule.falseValue}.`;
  }
  if (rule.type === 'match') {
    return Object.entries(rule.map).map(([k, v]) => `${k}: ${v}`).join(' · ');
  }
  const band = (b) => `${b.lte != null ? `${m.upTo} ${b.lte}${unit}` : `${m.from} ${b.gte}${unit}`}: ${b.points}`;
  return `${rule.bands.map(band).join(' · ')} · ${m.otherwise} ${rule.else}.`;
}

/** Остальные служебные страницы. */
function staticBody(key, ctx) {
  const { locale, site } = ctx;
  const c = locale.compliance ?? {};
  const p = locale.pages?.[key];

  if (key === 'responsible-gambling') {
    return {
      lede: p.lede,
      html: `
${steps(locale.guide?.protect, ctx)}

${toolsTable(ctx)}

${proseSections(locale.pageContent?.responsibleGambling)}

<section class="section">
<h2>${esc(p.oasisHeading)}</h2>
<p>${esc(c.selfExclusionNote ?? '')}</p>
${c.selfExclusionUrl ? `<p><a href="${esc(c.selfExclusionUrl)}" rel="nofollow noopener" target="_blank">${esc(locale.footer.selfExclusionLink)}</a></p>` : ''}
<p>${esc(p.oasisWarning)}</p>
</section>

<section class="section">
<h2>${esc(p.helpHeading)}</h2>
${c.helplines?.length ? `<div class="callout callout--help">
<dl class="kv">
${c.helplines.map((h) => `<dt>${icon('phone', { size: 15 })}${h.url ? `<a href="${esc(h.url)}" rel="nofollow noopener" target="_blank">${esc(h.name)}</a>` : esc(h.name)}</dt>
<dd>${h.phone ? `<strong>${esc(h.phone)}</strong>` : ''}${h.note ? `<br><small>${esc(h.note)}</small>` : ''}</dd>`).join('')}
</dl>
</div>` : ''}
</section>

<p><small>${esc(p.noOffersNote)}</small></p>`,
      faq: locale.pageFaq?.responsibleGambling ?? null,
    };
  }

  if (key === 'editorial-policy') {
    // Прежние четыре коротких раздела из pages.editorial-policy сняты: их
    // содержание целиком перешло в pageContent.editorialPolicy, а две версии
    // одного и того же на одной странице — это дословный повтор, который
    // требования к контенту запрещают отдельным пунктом.
    return {
      lede: p.lede,
      html: `
${steps(locale.guide?.policy, ctx)}
${sourcesTable(ctx)}
${proseSections(locale.pageContent?.editorialPolicy)}`,
      faq: locale.pageFaq?.editorialPolicy ?? null,
    };
  }

  if (key === '404') {
    return {
      lede: p.lede,
      html: `<ul class="chips">
<li><a href="${urlJoin()}">${esc(locale.pageLabels.home)}</a></li>
<li><a href="${esc(ctx.staticUrls.compare)}">${esc(locale.pageLabels.compare)}</a></li>
<li><a href="${esc(ctx.staticUrls['how-we-test'])}">${esc(locale.pageLabels['how-we-test'])}</a></li>
</ul>`,
      faq: null,
    };
  }

  // Impressum и Datenschutz: каркас с явной пометкой, что реквизиты нужны от заказчика.
  return {
    lede: p?.lede ?? null,
    html: `${(p?.sections ?? []).map((s) => `<section class="section"><h2>${esc(s.heading)}</h2>${s.body.map((b) => `<p>${esc(b)}</p>`).join('')}</section>`).join('\n')}
<p><small>${esc(site.domain)}</small></p>`,
    faq: null,
  };
}
