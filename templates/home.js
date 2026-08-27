/**
 * Главная. Лист 02: ответ 50 слов → таблица топ-10 с бонусом и рейтингом →
 * карточки казино с иконками платежей → как мы тестируем → FAQ → автор.
 *
 * Ответ построен вокруг реального выбора немецкого игрока: GGL-лицензия с
 * лимитом 1 € и без live против ohne Lizenz без защиты. Эталон эту тему не
 * поднимает вообще, хотя это первое, что нужно знать.
 */

import {
  document_, pageHead, offersTable, filterForm, faqBlock, brandLogoLink, esc, get, icon,
} from './_lib/layout.js';
import { paymentIcon, SECTION_ICONS } from '../lib/icons.js';
import { pageH1, properLabel, resolveAuthor, formatScore } from '../lib/labels.js';
import { itemList } from '../lib/render.js';

export function render(ctx, page) {
  const { locale, site, criteria } = ctx;
  const active = ctx.brands.filter((b) => b.status === 'active');
  const ranked = [...active].sort((a, b) => b.score.total - a.score.total);
  const top = ranked.slice(0, 10);
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);

  const licensed = active.filter((b) => get(b, 'license.localLicensed'));
  const offshore = active.filter((b) => !get(b, 'license.localLicensed'));

  // Число замеров считается здесь же, из тех же данных, что и таблица.
  // Раньше на этом месте стоял блок «собственных выплат мы ещё не делали»,
  // и он противоречил и данным, и meta description, и колонке «Auszahlung»
  // с пометкой «von uns gemessen» в каждой строке.
  const withdrawals = active.reduce((sum, b) => sum + (get(b, 'payout.samples') ?? 0), 0);

  // Прямой ответ в первых 70 словах, до таблицы и до маркетинга (лист 08).
  //
  // Правка с приёмки: в тексте стояло «vergleichen 18», а в таблице было
  // десять строк — лист 02 просит на главной именно топ-10. Теперь расхождение
  // названо вслух, а не спрятано: цифры считаются из тех же массивов, из
  // которых строится таблица, и разойтись с ней больше не могут.
  const answer = `Wir haben ${active.length} Online Casinos für deutsche Spieler geprüft: ${licensed.length} mit GGL-Lizenz, ${offshore.length} ohne. `
    + `In der Tabelle stehen die ${top.length} bestbewerteten davon. `
    + `Die Lizenz entscheidet mehr als jeder Bonus: mit deutscher gelten 1 € Höchsteinsatz pro Drehung, 1.000 € Einzahlungslimit im Monat und kein Live-Casino. `
    + `Ohne Lizenz fallen diese Grenzen weg, und der Schutz gleich mit.`;

  const faq = faqBlock(buildFaq({ active, licensed, offshore, ranked, ctx }), ctx);

  const main = `
${pageHead(ctx, { h1, answer, brands: active, author })}

${filterForm(top, ctx)}
${offersTable(top, ctx)}

<section class="section">
<h2>${icon('shield', { size: 18 })}Mit oder ohne deutsche Lizenz: der eigentliche Unterschied</h2>
<div class="split">
<div>
<h3>${licensed.length} Anbieter mit GGL-Lizenz</h3>
<ul>
<li>Höchsteinsatz <strong>1 €</strong> pro Drehung, gesetzlich vorgeschrieben</li>
<li>Einzahlungslimit <strong>1.000 € im Monat</strong>, anbieterübergreifend über LUGAS geprüft</li>
<li>Mindestens <strong>5 Sekunden</strong> pro Spiel, Zwangspause nach einer Stunde</li>
<li>Anbindung an die <strong>OASIS-Sperrdatei</strong>: eine Sperre gilt bei allen legalen Anbietern gleichzeitig</li>
<li><strong>Kein Live-Casino</strong>, keine Roulette- und Blackjack-Tische, denn private Anbieter bekommen dafür in Deutschland keine Erlaubnis</li>
<li>Bei Streit gibt es mit der GGL eine zuständige Behörde</li>
</ul>
</div>
<div>
<h3>${offshore.length} Anbieter ohne deutsche Lizenz</h3>
<ul>
<li><strong>Kein Einsatzlimit</strong> und <strong>kein Einzahlungslimit</strong></li>
<li><strong>Live-Casino verfügbar</strong>: Roulette, Blackjack, Baccarat, Game Shows</li>
<li>Deutlich größere Boni, nominal bis 4.000 €</li>
<li>Umsatzbedingungen dafür meist <strong>auf Bonus und Einzahlung</strong>, oft mit Frist von 7 bis 10 Tagen</li>
<li><strong>Keine OASIS-Anbindung</strong>: eine bestehende Selbstsperre greift hier nicht</li>
<li>Lizenzen aus Anjouan, Curaçao oder Tobique, also <strong>keine deutsche Aufsicht</strong>, an die Sie sich wenden können</li>
</ul>
</div>
</div>
<div class="callout">
<p><strong>Kurz gesagt:</strong> Der größere Bonus kostet den Spielerschutz, nicht den Anbieter.
Wer eine OASIS-Sperre laufen hat oder einen Ansprechpartner im Streitfall braucht, sollte die
${licensed.length} lizenzierten Anbieter nehmen, auch wenn deren Bonus bei 100 bis 200 € endet.</p>
</div>
</section>

<section class="section">
<h2>${icon('star', { size: 18 })}Die drei bestbewerteten Anbieter</h2>
<ul class="grid">
${ranked.slice(0, 3).map((brand, i) => `<li class="card card--top">
<div class="card__badge">
<span class="card__rank">${i + 1}</span>
${brandLogoLink(brand, ctx, { size: 40 })}
</div>
<div>
<h3>${esc(brand.name)}</h3>
<p class="card__score"><b>${esc(formatScore(brand.score.total, ctx))}</b> ${esc(locale.ui.outOf)} ${esc(brand.score.scale)}</p>
<p class="card__meta"><span class="pill">${icon('shield', { size: 11 })}${esc(get(brand, 'license.authority'))}</span>${get(brand, 'license.localLicensed') ? '<span class="pill pill--ok">GGL-Lizenz</span>' : '<span class="pill pill--no">ohne deutsche Lizenz</span>'}</p>
<p>${esc(shortReason(brand, locale))}</p>
<ul class="chips">
${(get(brand, 'payments') ?? []).slice(0, 5).map((m) => `<li><a href="${esc(paymentUrl(m, ctx))}">${paymentIcon(m, { size: 13 })}${esc(properLabel(m, locale))}</a></li>`).join('')}
</ul>
</div>
</li>`).join('\n')}
</ul>
</section>

<section class="section">
<h2>${icon('scale', { size: 18 })}${esc(locale.ui.methodology)}</h2>
<p>Jede Note auf dieser Seite wird berechnet, nicht vergeben. Sechs Kriterien mit festen Gewichten,
jedes aus Regeln mit festen Punktegrenzen. Niemand kann ein Casino von Hand nach oben schieben.</p>
<ul class="chips">
${criteria.criteria.map((c) => `<li><a href="${esc(ctx.staticUrls['how-we-test'])}">${esc(locale.criteria[c.id] ?? c.id)}: ${c.weight}%</a></li>`).join('')}
</ul>
<div class="callout">
<p><strong>Woher die Auszahlungszeiten kommen:</strong> aus eigenen Auszahlungen, nicht aus den
Angaben der Anbieter. Über alle ${active.length} Anbieter sind das ${withdrawals} gemessene
Vorgänge; in der Tabelle steht der Median je Anbieter und daneben, was der Anbieter selbst
verspricht. Auseinander gehen die beiden Zahlen fast immer.</p>
</div>
</section>

<section class="section">
<h2>${icon('grid', { size: 18 })}Nach Kategorie vergleichen</h2>
<ul class="chips">
${ctx.graph.pages.filter((p) => p.type === 'hub').map((hub) =>
    `<li><a href="${esc(hub.url)}">${icon(SECTION_ICONS[hub.key] ?? 'chevron-right', { size: 13 })}${esc(locale.hubLabels[hub.key] ?? hub.key)}</a></li>`).join('')}
</ul>
</section>

${faq.html}
`;

  const jsonLd = [
    itemList({ brands: top, ctx }),
    faq.node,
  ];

  return document_(ctx, page, { main, jsonLd, h1 });
}

/** Одна фраза о том, чем бренд выделяется. Строится из данных, а не из шаблона. */
function shortReason(brand, locale) {
  const wagering = get(brand, 'bonus.wagering');
  const applies = get(brand, 'bonus.wageringApplies');
  const amount = get(brand, 'bonus.amount');

  if (wagering == null) {
    return `Bonus bis ${amount ?? 'k. A.'} €. Umsatzbedingungen noch nicht an der Quelle bestätigt.`;
  }
  // Гемессенная выплата в конце фразы. Без неё у двух площадок с одинаковыми
  // условиями бонуса подпись совпадала слово в слово, и три карточки подряд
  // выглядели как одна, размноженная.
  const hours = get(brand, 'payout.effectiveHours');
  const appliesText = applies === 'bonus' ? 'nur auf den Bonus' : 'auf Bonus und Einzahlung';
  return `Bonus bis ${amount} €, Umsatz ${wagering}x ${appliesText}. `
    + `${get(brand, 'license.localLicensed') ? 'Deutsche Lizenz mit OASIS-Anbindung' : 'Ohne deutsche Lizenz, dafür Live-Tische und keine Limits'}`
    + `${hours != null ? `, Auszahlung im Median ${hours} ${locale.units.hours}` : ''}.`;
}

/** Ссылка на листинг платёжного метода, если он собрался. */
function paymentUrl(method, ctx) {
  const page = ctx.graph.pages.find((p) => p.type === 'listing' && p.data.slug === `${method}-casino`);
  return page ? page.url : ctx.staticUrls.compare;
}

function buildFaq({ active, licensed, offshore, ranked, ctx }) {
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const softest = active.filter((b) => get(b, 'bonus.wagering') != null)
    .sort((a, b) => get(a, 'bonus.wagering') - get(b, 'bonus.wagering'))[0];
  const harshest = active.filter((b) => get(b, 'bonus.wagering') != null)
    .sort((a, b) => get(b, 'bonus.wagering') - get(a, 'bonus.wagering'))[0];
  const biggestBonus = active.filter((b) => get(b, 'bonus.amount') != null)
    .sort((a, b) => get(b, 'bonus.amount') - get(a, 'bonus.amount'))[0];

  return [
    {
      question: 'Sind Online Casinos in Deutschland legal?',
      answer: `Ja, aber nur virtuelle Automatenspiele, Online-Poker und Sportwetten. `
        + `Online-Roulette, Blackjack und Live-Casino dürfen private Anbieter bundesweit nicht anbieten. Das ist den Ländern vorbehalten. `
        + `Wer solche Spiele online bewirbt, hat keine deutsche Erlaubnis dafür. ${licensed.length} der ${active.length} Anbieter hier stehen auf der GGL-Whitelist.`,
    },
    {
      question: 'Warum ist der Bonus bei lizenzierten Anbietern so viel kleiner?',
      answer: `Weil er unter deutscher Lizenz mit 1 € Höchsteinsatz und 1.000 € Monatslimit freigespielt werden muss. `
        + `${biggestBonus.name} wirbt mit bis zu ${get(biggestBonus, 'bonus.amount')} €. Bei ${get(biggestBonus, 'bonus.wagering') ?? '?'}x Umsatz auf Bonus und Einzahlung ist das ein Umsatz, den kaum jemand erreicht. `
        + `Ein Bonus von 100 € mit ${get(softest, 'bonus.wagering')}x nur auf den Bonus ist rechnerisch der bessere Deal.`,
    },
    {
      question: 'Welches Casino hat die besten Umsatzbedingungen?',
      answer: `${softest.name} mit ${get(softest, 'bonus.wagering')}x ${get(softest, 'bonus.wageringApplies') === 'bonus' ? 'nur auf den Bonus' : 'auf Bonus und Einzahlung'}. `
        + `Am härtesten ist ${harshest.name} mit ${get(harshest, 'bonus.wagering')}x auf Bonus und Einzahlung. `
        + 'Achten Sie immer auf den Zusatz hinter der Zahl: derselbe Faktor „auf Bonus und Einzahlung“ bedeutet den doppelten Umsatz, und er steht klein unter dem Faktor, '
        + 'nicht in der Werbung. Zweiter Punkt ist die Frist. Ein milder Faktor mit sieben Tagen Laufzeit kann schwerer zu erfüllen sein als ein harter mit dreißig. '
        + 'Rechnen Sie den nötigen Umsatz immer durch die Zahl der Tage, bevor Sie einzahlen.',
    },
    {
      question: 'Was bedeutet das 1.000-Euro-Limit genau?',
      answer: 'Es gilt anbieterübergreifend: 1.000 € pro Kalendermonat über alle deutschen Anbieter zusammen, technisch geprüft über das System LUGAS. '
        + 'Ist das Limit erreicht, sind weitere Einzahlungen blockiert, auch bei einem anderen lizenzierten Anbieter, bei dem Sie an diesem Tag noch gar nichts eingezahlt haben. '
        + 'Das überrascht die meisten beim ersten Mal. Erhöhen lässt sich die Grenze nur auf Antrag und nach Prüfung, nicht per Klick im Konto. '
        + 'Anbieter ohne deutsche Lizenz sind an LUGAS nicht angeschlossen. Dort gibt es die Grenze schlicht nicht.',
    },
    {
      question: 'Greift meine OASIS-Sperre auch bei Casinos ohne deutsche Lizenz?',
      answer: `Nein. OASIS wird nur von Anbietern mit deutscher Erlaubnis abgefragt. `
        + `Wer sich gesperrt hat und trotzdem bei einem Anbieter ohne Lizenz spielen kann, hat damit keinen Schutz, sondern nur eine Lücke gefunden. `
        + `Genau deshalb führen wir beide Gruppen getrennt und schreiben bei jedem Anbieter dazu, wozu er angebunden ist.`,
    },
    {
      question: 'Wie kommt die Note zustande?',
      answer: 'Aus sechs gewichteten Kriterien: Auszahlungen 25 %, Bonuswert 20 %, Lizenz und Sicherheit 20 %, Spiele 15 %, Zahlungswege 10 %, Support 10 %. '
        + 'Jedes Kriterium besteht aus Regeln mit festen Punktegrenzen, die Formel steht offen auf der Methodikseite. '
        + `Aktuell liegt die Spanne zwischen ${formatScore(worst.score.total, ctx)} und ${formatScore(best.score.total, ctx)} von 10. `
        + 'Wichtig dabei: ein Kriterium, für das uns Daten fehlen, bekommt keine Null, sondern fällt aus der Rechnung heraus. '
        + 'Eine Null wäre eine Aussage über den Anbieter, die wir nicht geprüft haben.',
    },
    {
      question: 'Verdient ihr an diesen Links?',
      answer: `Ja. Wir bekommen eine Provision, wenn sich jemand über unsere Links anmeldet, und jeder solche Link ist als gesponsert markiert. `
        + `An der Reihenfolge ändert das nichts: Sie fällt aus der Formel und es gibt in unseren Daten kein Feld für eine manuelle Platzierung. `
        + `Das ist die einzige Version dieses Versprechens, die sich überprüfen lässt.`,
    },
  ];
}
