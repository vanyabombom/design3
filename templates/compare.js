/**
 * Страница сравнения. Лист 02: «Сортируемая таблица всех брендов по 8
 * параметрам · Фильтры · Как пользоваться · FAQ».
 */

import {
  document_, pageHead, offersTable, filterForm, faqBlock, proseSections, esc, get,
} from './_lib/layout.js';
import { pageH1, resolveAuthor } from '../lib/labels.js';
import { itemList } from '../lib/render.js';

export function render(ctx, page) {
  const { locale, site, criteria } = ctx;
  const active = ctx.brands.filter((b) => b.status === 'active');
  const sorted = [...active].sort((a, b) => b.score.total - a.score.total);
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);

  const licensed = active.filter((b) => get(b, 'license.localLicensed'));
  const withWagering = active.filter((b) => get(b, 'bonus.wagering') != null);
  const softest = [...withWagering].sort((a, b) => get(a, 'bonus.wagering') - get(b, 'bonus.wagering'))[0];
  const harshest = [...withWagering].sort((a, b) => get(b, 'bonus.wagering') - get(a, 'bonus.wagering'))[0];

  const answer = `Alle ${active.length} Anbieter in einer sortierbaren Tabelle über sieben Parameter: `
    + `${licensed.length} mit deutscher GGL-Lizenz, ${active.length - licensed.length} ohne. `
    + `Sortiert wird über die Spaltenüberschriften, auf dem Handy über das Feld „Sortieren nach“. `
    + `Filtern lässt sich nach Einzahlungshöhe, Auszahlungsdauer und Lizenz. Die Note stammt aus sechs veröffentlichten Kriterien.`;

  const faq = faqBlock(buildFaq({ active, licensed, softest, harshest, ctx }), ctx);

  const main = `
${pageHead(ctx, { h1, answer, brands: active, author })}

${filterForm(sorted, ctx, { targetId: 'compare-table' })}
${offersTable(sorted, ctx, { id: 'compare-table' })}

<section class="section">
<h2>So lesen Sie diese Tabelle</h2>
<dl class="kv">
<dt>${esc(locale.table.bonus)}</dt>
<dd>Der beworbene Höchstbetrag. Er sagt für sich genommen wenig. Entscheidend ist die nächste Spalte.</dd>

<dt>${esc(locale.table.wagering)}</dt>
<dd>Der Umsatzfaktor <em>und</em> worauf er sich bezieht. Derselbe Faktor auf „Bonus + Einzahlung“
bedeutet den doppelten Umsatz gegenüber „nur auf den Bonus“. Das ist der häufigste Trugschluss beim Bonusvergleich.</dd>

<dt>${esc(locale.table.payoutSpeed)}</dt>
<dd>Oben steht der Median unserer eigenen Auszahlungen, darunter die Angabe des Anbieters zum Vergleich.
Wo die beiden Zahlen weit auseinanderliegen, ist die zweite Marketing und die erste die Realität.</dd>

<dt>${esc(locale.table.license)}</dt>
<dd>Entscheidet, ob es bei Streit eine zuständige Behörde gibt, ob eine OASIS-Sperre greift und ob
Einsatz- und Einzahlungslimits gelten. Anbieter mit GGL-Erlaubnis sind zusätzlich markiert.</dd>

<dt>${esc(locale.table.score)}</dt>
<dd>Gewichtetes Ergebnis aus sechs Kriterien: ${criteria.criteria.map((c) => `${esc(locale.criteria[c.id] ?? c.id)} ${c.weight} %`).join(', ')}.
Die vollständigen Regeln stehen auf <a href="${esc(ctx.staticUrls['how-we-test'])}">${esc(locale.ui.methodology)}</a>.</dd>
</dl>
</section>

<section class="section">
<h2>Der Unterschied, der die Tabelle erklärt</h2>
<p>Die Anbieter mit deutscher Lizenz haben durchgehend kleinere Boni und trotzdem oft die besseren Noten.
Das ist kein Zufall der Formel, sondern deren Zweck: Ein Bonus von 100 € mit ${softest ? `${get(softest, 'bonus.wagering')}x` : 'niedrigem Umsatz'} nur auf den Bonus
verlangt einen Umsatz, den man tatsächlich erreichen kann. Ein Bonus von 3.000 € mit
${harshest ? `${get(harshest, 'bonus.wagering')}x` : 'hohem Umsatz'} auf Bonus und Einzahlung verlangt einen sechsstelligen Umsatz.</p>
<p>Umgekehrt gilt: Wer Live-Roulette oder Blackjack spielen will, findet das ausschließlich bei den
Anbietern ohne deutsche Erlaubnis. Private Anbieter können dafür in Deutschland keine Lizenz bekommen.
Dafür gibt es dort weder eine OASIS-Anbindung noch eine Behörde, die im Streitfall zuständig ist.</p>
</section>

${proseSections(locale.pageContent?.compare)}

${faq.html}
`;

  const jsonLd = [
    itemList({ brands: sorted, ctx }),
    faq.node,
  ];

  return document_(ctx, page, { main, jsonLd, h1 });
}

function buildFaq({ active, licensed, softest, harshest, ctx }) {
  const u = ctx.locale.units;
  const withFees = active.filter((b) => get(b, 'fees.withdrawalPct') > 0);
  const withLive = active.filter((b) => (get(b, 'live') ?? []).length > 0);
  const capped = active.filter((b) => get(b, 'limits.monthlyDepositCap') != null);

  return [
    {
      question: 'Worauf sollte ich zuerst schauen?',
      answer: `Auf die Lizenzspalte. Sie entscheidet über Einsatzlimit, Einzahlungslimit, OASIS-Anbindung und darüber, `
        + `ob es im Streitfall eine zuständige Behörde gibt. Alles andere, also Bonus, Spielauswahl und Zahlungswege, ist danach eine Frage des Geschmacks.`,
    },
    {
      question: 'Wie groß ist der Unterschied bei den Umsatzbedingungen?',
      answer: softest && harshest
        ? `Von ${get(softest, 'bonus.wagering')}x bei ${softest.name} bis ${get(harshest, 'bonus.wagering')}x bei ${harshest.name}. `
          + `Zusammen mit der Angabe, worauf sich der Faktor bezieht, ist der reale Abstand im nötigen Umsatz noch deutlich größer als diese Zahlen vermuten lassen.`
        : `Die Umsatzbedingungen sind noch nicht für alle Anbieter an der Quelle bestätigt. Wo sie fehlen, steht in der Tabelle „noch nicht geprüft“ statt einer Schätzung.`,
    },
    {
      question: 'Verlangt einer dieser Anbieter Gebühren für die Auszahlung?',
      answer: withFees.length
        ? `Ja, ${withFees.length}: ${withFees.map((b) => `${b.name} (${get(b, 'fees.withdrawalPct')} ${u.percent})`).join(', ')}. `
          + `Bei regelmäßigen Auszahlungen kostet eine prozentuale Gebühr übers Jahr mehr, als die meisten Willkommensboni einbringen.`
        : `Nein, keiner der ${active.length} Anbieter erhebt eine prozentuale Auszahlungsgebühr. Wo eine auftaucht, nehmen wir sie in die Tabelle auf.`,
    },
    {
      question: 'Kann ich nach mehreren Spalten gleichzeitig sortieren?',
      answer: `Nein, Sortierung wirkt auf eine Spalte. Nutzen Sie stattdessen die Filter darüber: Sie lassen sich kombinieren, `
        + `also erst auf Lizenz und Einzahlungshöhe eingrenzen und das Ergebnis dann nach Auszahlungsdauer sortieren.`,
    },
    {
      question: 'Warum folgt die Note nicht der Bonushöhe?',
      answer: `Weil die Bonushöhe gar nicht in die Formel eingeht. Bewertet wird der Bonuswert über Umsatzfaktor, Mindesteinzahlung, Frist und Höchsteinsatz. `
        + `Ein Angebot über 300 % mit 50x Umsatz liegt deshalb unter einem über 100 % mit 20x, was genau dem entspricht, was beim Freispielen passiert.`,
    },
    {
      question: 'Wo finde ich Live-Casino in dieser Tabelle?',
      answer: withLive.length
        ? `Bei ${withLive.length} von ${active.length} Anbietern, und alle davon arbeiten ohne deutsche Erlaubnis. `
          + `Mit GGL-Lizenz ist Live-Casino nicht zulässig, deshalb ist die Live-Spalte faktisch identisch mit „ohne deutsche Lizenz“.`
        : `Bei keinem. Kein Anbieter dieser Tabelle führt Live-Tische.`,
    },
    {
      question: 'Gilt das Einzahlungslimit von 1.000 € bei allen?',
      answer: `Nur bei den ${capped.length} Anbietern mit deutscher Lizenz. Es gilt anbieterübergreifend über das System LUGAS: `
        + `1.000 € pro Kalendermonat über alle legalen Anbieter zusammen. Die übrigen ${active.length - capped.length} sind nicht angeschlossen und haben kein solches Limit.`,
    },
  ];
}
