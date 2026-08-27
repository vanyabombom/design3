/**
 * Страница редакции. Лист 02: «Профили с ролями и опытом».
 * Лист 09 проверяет автора отдельной строкой, и техническое имя вместо
 * настоящего — провал приёмки.
 */

import { document_, pageHead, factsTable, proseSections, faqBlock, esc, standNote } from './_lib/layout.js';
import { pageH1, resolveAuthor } from '../lib/labels.js';

export function render(ctx, page) {
  const { authors, locale, criteria } = ctx;
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);
  const pending = authors.authors.filter((a) => a.placeholder);
  const faq = faqBlock(locale.pageFaq?.authors, ctx);
  const de = (text) => locale.authorRoles?.[text] ?? text;

  const main = `
${pageHead(ctx, {
    h1,
    answer: 'Wer hier schreibt und prüft, wofür jede Person zuständig ist und seit wann. '
      + 'Jede Liste nennt ihren Autor über der Tabelle, und der Name führt hierher.',
    author,
  })}

${pending.length ? standNote(`${pending.length} von ${authors.authors.length} Profilen sind Platzhalter. Vor Veröffentlichung werden echte Namen, Rollen, Erfahrung und Fotos ergänzt.`) : ''}

<section class="section">
<ul class="grid">
${authors.authors.map((a, index) => `<li class="card card--person" id="${esc(a.slug)}">
<h2><span class="avatar" data-tone="${index % 3}" aria-hidden="true">${esc(monogram(a.name))}</span>${esc(a.name)}</h2>
<p><strong>${esc(de(a.role))}</strong>${a.since ? ` · seit ${esc(a.since)}` : ''}</p>
${a.expertise?.length ? `<ul class="chips">${a.expertise.map((e) => `<li><span>${esc(de(e))}</span></li>`).join('')}</ul>` : ''}
${a.bio ? `<p>${esc(a.bio)}</p>` : ''}
</li>`).join('\n')}
</ul>
</section>

${authorsTable(ctx, de)}

<section class="section">
<h2>Wie die Redaktion arbeitet</h2>
<p>Auszahlungen misst die Zahlungsredaktion, Bonusbedingungen rechnet die Bonusanalyse nach,
die Chefredaktion gibt frei. Die Noten selbst schreibt niemand: sie werden aus der Methodik
berechnet, die offen auf <a href="${esc(ctx.staticUrls['how-we-test'])}">${esc(locale.ui.methodology)}</a>
steht. Über die Bonusbedingungen laufen davon ${criteria.criteria.find((c) => c.id === 'bonus')?.weight ?? 20} %.</p>
</section>
${proseSections(locale.pageContent?.authors)}

${faq.html}
`;

  const jsonLd = [{
    '@type': 'Organization',
    name: locale.site.publisher,
    url: ctx.site.domain,
    employee: authors.authors.map((a) => ({
      '@type': 'Person',
      name: a.name,
      jobTitle: a.role,
      url: `${ctx.site.domain}${page.url}#${a.slug}`,
    })),
  }];

  return document_(ctx, page, { main, jsonLd: [...jsonLd, faq.node], h1 });
}

/**
 * Инициалы для монограммы.
 *
 * Фотографий у нас пока нет и до замены профилей не будет. Три одинаково
 * серые карточки подряд при этом читались как заглушка, хотя люди за ними
 * разные. Монограмма своим тоном на каждую карточку — это не украшение:
 * она даёт карточке лицо и держит связь с подписью «Autor: ...» на других
 * страницах, где стоит то же имя.
 */
function monogram(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/**
 * Кто за что отвечает, в числах.
 *
 * Карточки выше рассказывают, кто эти люди. На вопрос «а сколько работы за
 * каждым и когда её трогали в последний раз» они не отвечают, а на странице
 * редакции спрашивают именно это. Числа берутся из поля author у брендов —
 * из того же места, откуда подпись под каждой таблицей.
 */
function authorsTable(ctx, de) {
  const { authors, brands, locale } = ctx;
  const t = locale.authorsTable;
  if (!t || !authors.authors.length) return '';

  const rows = authors.authors.map((a) => {
    const own = brands.filter((b) => b.author === a.slug);
    const dates = own.map((b) => b.updatedAt).filter(Boolean).sort();
    const last = dates.length ? dates[dates.length - 1] : null;

    return {
      value: a.name,
      html: `<a href="#${esc(a.slug)}">${esc(a.name)}</a>`,
      cells: [
        { value: de(a.role), html: esc(de(a.role)), className: '' },
        { value: a.since ?? null, html: a.since ? esc(a.since) : '' },
        { value: own.length, html: String(own.length) },
        { value: last, html: last ? `<time datetime="${esc(last)}">${esc(last)}</time>` : '' },
      ],
    };
  });

  return `<section class="section">
<h2>${esc(t.heading)}</h2>
<p>${esc(t.intro)}</p>
${factsTable(ctx, {
    id: 'authors-load',
    headCol: 'author',
    headLabel: t.colAuthor,
    minWidth: '40rem',
    columns: [
      { col: 'role', label: t.colRole, sort: 'text' },
      { col: 'since', label: t.colSince, sort: 'number', dir: 'asc' },
      { col: 'brands', label: t.colBrands, sort: 'number', dir: 'desc' },
      { col: 'updated', label: t.colUpdated, sort: 'date', dir: 'desc' },
    ],
    rows,
  })}
</section>`;
}
