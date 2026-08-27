/**
 * Индекс всех карточек. Родитель для /casino/[brand]/ — без него хлебная
 * крошка карточки указывала бы в 404, а сами карточки набирали бы входящие
 * ссылки только из листингов.
 */

import { document_, pageHead, offersTable, filterForm, proseSections, faqBlock, esc, get } from './_lib/layout.js';
import { pageH1, resolveAuthor } from '../lib/labels.js';

export function render(ctx, page) {
  const { locale } = ctx;
  const active = ctx.brands.filter((b) => b.status === 'active');
  const departed = ctx.brands.filter((b) => b.status !== 'active');
  const sorted = [...active].sort((a, b) => b.score.total - a.score.total);
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);
  const licensed = active.filter((b) => get(b, 'license.localLicensed'));
  const faq = faqBlock(locale.pageFaq?.brandIndex, ctx);

  const answer = `Alle ${active.length} Anbieter, die wir bewertet haben, davon ${licensed.length} mit deutscher `
    + `GGL-Lizenz, ${active.length - licensed.length} ohne${departed.length ? `, dazu ${departed.length} ohne aktives Angebot` : ''}. `
    + `Sortiert ist die Liste nach unserer Note. Wo eine Angabe an der Quelle nicht zu bestätigen war, steht in der Zelle „noch nicht geprüft“ statt einer Schätzung.`;

  const main = `
${pageHead(ctx, { h1, answer, brands: active, author })}

${filterForm(sorted, ctx, { targetId: 'all-brands', termFilter: true })}
${offersTable(sorted, ctx, { id: 'all-brands', termFilter: true })}

${departed.length ? `<section class="section">
<h2>${esc(locale.ui.departed)}</h2>
<p>Diese Bewertungen bleiben bewusst online: Wer wissen will, was mit einem Anbieter passiert ist,
den er genutzt hat, verdient eine Antwort von uns statt aus einem Forum.</p>
<ul class="grid">
${departed.map((b) => `<li class="card">
<h3>${esc(b.name)}</h3>
<p><small>${esc(b.status)} · ${esc(locale.ui.updatedOn)} ${esc(b.updatedAt)}</small></p>
</li>`).join('\n')}
</ul>
</section>` : ''}
${fitBlock(locale.pageFit?.brandIndex)}

${proseSections(locale.pageContent?.brandIndex)}

${faq.html}
`;

  return document_(ctx, page, { main, jsonLd: [faq.node], h1 });
}

/** «Кому подходит» для каталога: третий содержательный блок помимо таблицы и FAQ. */
function fitBlock(fit) {
  if (!fit) return '';
  const list = (items) => items.map((item) => `<li>${esc(item)}</li>`).join('');

  return `<section class="section">
<h2>${esc(fit.heading)}</h2>
<div class="plus-minus">
<div>
<h3>Ja, wenn</h3>
<ul>${list(fit.pro)}</ul>
</div>
<div>
<h3>Eher nicht, wenn</h3>
<ul>${list(fit.con)}</ul>
</div>
</div>
</section>`;
}
