/**
 * Карточка бренда: подробный разбор одного казино.
 *
 * Была убрана вместе с редизайном таблиц сравнения — тогда решили, что вся
 * нужная информация умещается в строку и в раскрытие способов оплаты.
 * Вернулась по прямой правке: таблица сравнения остаётся сводкой на одну
 * строку, а здесь — то, что в строку не умещается: как складывается оценка
 * по каждому из шести критериев, что стоит за суммой бонуса в реальном
 * обороте, полный список способов оплаты на ввод и на вывод отдельно,
 * лицензия и инструменты защиты, плюсы и минусы, похожие казино.
 *
 * Лист 02: вердикт 60 слов → оценка по критериям с весами → бонус и условия →
 * платежи → игры → лицензия → плюсы и минусы → кому не подходит →
 * похожие казино → FAQ.
 */

import {
  document_, pageHead, faqBlock, factsTable, esc, get, icon,
  affiliateLink, logoOrMark, paymentIcon,
} from './_lib/layout.js';
import { pageH1, properLabel, resolveAuthor, formatScore, scoreBand } from '../lib/labels.js';
import { review } from '../lib/render.js';
import { urlJoin } from '../lib/util.js';

export function render(ctx, page) {
  const { locale, site, criteria } = ctx;
  const { brand, terms, similar } = page.data;
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);
  const u = locale.units;
  const ggl = get(brand, 'license.localLicensed');
  const scale = brand.score?.scale ?? criteria.scale;

  const faq = faqBlock(buildFaq(brand, ctx), ctx);
  const only = depositOnly(brand);
  const t = turnover(brand);
  // Deutsche Tausendertrennung fürs Auge: "3.000 €" statt "3000 €", dieselbe
  // Schreibweise, die toLocaleString('de-DE') schon in der Umsatz-Rechnung
  // unten liefert.
  const fmt = (n) => Number(n).toLocaleString('de-DE');

  const extra = [
    brand.score?.total != null
      ? `<strong>${esc(formatScore(brand.score.total, ctx))}</strong> ${esc(locale.ui.outOf)} ${esc(scale)}`
      : null,
    `${esc(get(brand, 'license.authority'))}`
      + (ggl ? ` <span class="pill pill--ok">${esc(locale.table.germanLicence)}</span>` : ' <span class="pill pill--no">ohne deutsche Lizenz</span>'),
  ].filter(Boolean);

  const main = `
${pageHead(ctx, {
    h1,
    answer: brand.verdict,
    brands: [brand],
    author,
    extra,
    badge: `<span class="hero__mark">${logoOrMark(brand, site, { size: 40 })}</span>`,
  })}

${brand.status !== 'active' ? `<div class="callout">
<p><strong>${esc(locale.ui.departed)}.</strong> Status: ${esc(brand.status)}, zuletzt geprüft am ${esc(brand.updatedAt)}.
Diese Bewertung bleibt online, weil die Frage „Was ist mit diesem Anbieter passiert?“ eine Antwort verdient.</p>
</div>` : ''}

${brand.affiliate?.active ? `<p>${affiliateLink({ brand, site, label: locale.ui.visitCasino, className: 'cta cta--lg', iconHtml: ' →' })}</p>` : ''}

<section class="section">
<h2>Wie die Note ${esc(formatScore(brand.score?.total, ctx))} zustande kommt</h2>
${scoreBreakdown(brand, ctx)}
<p><small>Gewichte und Punkteregeln stehen offen auf <a href="${esc(ctx.staticUrls['how-we-test'])}">${esc(locale.ui.methodology)}</a>.
Die Note wird bei jedem Neuaufbau der Seite neu berechnet und nirgends gespeichert.</small></p>
</section>

<section class="section">
<h2>Bonus und Bedingungen</h2>
<dl class="kv">
<dt>Angebot</dt><dd>${get(brand, 'bonus.matchPct') ? `${esc(get(brand, 'bonus.matchPct'))} % bis ${fmt(get(brand, 'bonus.amount'))} ${esc(u.currency)}` : esc(locale.table.notChecked)}${get(brand, 'bonus.freeSpins') ? ` + ${esc(get(brand, 'bonus.freeSpins'))} ${esc(locale.table.freeSpins)}` : ''}</dd>
<dt>Umsatz</dt><dd>${get(brand, 'bonus.wagering') == null ? esc(locale.table.notChecked) : `${esc(get(brand, 'bonus.wagering'))}${esc(u.times)} ${esc(locale.table.appliesTo[get(brand, 'bonus.wageringApplies')] ?? '')}`}</dd>
<dt>Mindesteinzahlung</dt><dd>${get(brand, 'bonus.minDeposit') == null ? esc(locale.table.notChecked) : `${esc(get(brand, 'bonus.minDeposit'))} ${esc(u.currency)}`}</dd>
<dt>Höchsteinsatz</dt><dd>${get(brand, 'bonus.maxBet') == null ? esc(locale.table.notChecked) : `${esc(get(brand, 'bonus.maxBet'))} ${esc(u.currency)} pro Drehung${ggl ? ' (gesetzlich vorgeschrieben)' : ''}`}</dd>
<dt>Frist</dt><dd>${get(brand, 'bonus.expiryDays') == null ? esc(locale.table.notChecked) : `${esc(get(brand, 'bonus.expiryDays'))} ${esc(u.days)}`}</dd>
${get(brand, 'bonus.maxCashout') ? `<dt>Gewinndeckel</dt><dd>${fmt(get(brand, 'bonus.maxCashout'))} ${esc(u.currency)}</dd>` : ''}
${get(brand, 'bonus.hasCode') && get(brand, 'bonus.code') ? `<dt>Code</dt><dd><code>${esc(get(brand, 'bonus.code'))}</code></dd>` : ''}
<dt>${esc(locale.ui.checkedOn)}</dt><dd><time datetime="${esc(get(brand, 'bonus.checkedAt'))}" data-checked>${esc(get(brand, 'bonus.checkedAt'))}</time></dd>
</dl>
${t ? `<div class="callout">
<p><strong>Was das rechnerisch bedeutet:</strong> Um den vollen Bonus freizuspielen, sind
<strong>${t.turnover.toLocaleString('de-DE')} ${esc(u.currency)}</strong> Umsatz nötig.
${t.spins ? `Bei ${esc(get(brand, 'bonus.maxBet'))} ${esc(u.currency)} Höchsteinsatz sind das rund ${t.spins.toLocaleString('de-DE')} Drehungen` : 'Wie viele Drehungen das sind, hängt vom Höchsteinsatz ab, den wir noch nicht bestätigt haben'}${t.perDay ? `, verteilt auf ${esc(get(brand, 'bonus.expiryDays'))} Tage also etwa ${t.perDay.toLocaleString('de-DE')} pro Tag` : ''}.</p>
</div>` : ''}
</section>

<section class="section">
<h2>Zahlungswege</h2>
${paymentChips(get(brand, 'payments') ?? [], `Einzahlung (${(get(brand, 'payments') ?? []).length})`, ctx)}
${Array.isArray(get(brand, 'payments_withdrawal'))
    ? paymentChips(get(brand, 'payments_withdrawal'), `Auszahlung (${get(brand, 'payments_withdrawal').length})`, ctx)
    : `<p><small>Welche Methoden zum Auszahlen freigeschaltet sind, haben wir noch nicht an der Quelle geprüft.</small></p>`}
${only.length ? `<div class="callout"><p><strong>Nur zum Einzahlen:</strong> ${only.map((m) => esc(properLabel(m, locale))).join(', ')}.
Über diese Wege kommt kein Geld zurück, das erfährt man sonst erst an der Kasse.</p></div>` : ''}
<dl class="kv">
<dt>Auszahlungsdauer</dt><dd>${get(brand, 'payout.effectiveHours') == null
    ? esc(locale.table.notChecked)
    : `${esc(get(brand, 'payout.effectiveHours'))} ${esc(u.hours)} <small>${get(brand, 'payout.isMeasured') ? esc(locale.table.measured) : esc(locale.table.perOperator)}</small>`}</dd>
${get(brand, 'fees.withdrawalPct') ? `<dt>Auszahlungsgebühr</dt><dd>${esc(get(brand, 'fees.withdrawalPct'))} ${esc(u.percent)}</dd>` : ''}
${get(brand, 'limits.minWithdrawal') ? `<dt>Mindestauszahlung</dt><dd>${esc(get(brand, 'limits.minWithdrawal'))} ${esc(u.currency)}</dd>` : ''}
${get(brand, 'limits.maxWithdrawalPerMonth') ? `<dt>Auszahlungslimit</dt><dd>${fmt(get(brand, 'limits.maxWithdrawalPerMonth'))} ${esc(u.currency)} pro Monat</dd>` : ''}
<dt>Einzahlungslimit</dt><dd>${get(brand, 'limits.monthlyDepositCap') ? `${fmt(get(brand, 'limits.monthlyDepositCap'))} ${esc(u.currency)} pro Monat, anbieterübergreifend über LUGAS` : 'kein Limit, der Anbieter ist nicht an LUGAS angeschlossen'}</dd>
</dl>
${get(brand, 'payout.note') ? `<p>${esc(get(brand, 'payout.note'))}</p>` : ''}
</section>

<section class="section">
<h2>Spiele</h2>
${get(brand, 'games.total')
    ? `<p>${fmt(get(brand, 'games.total'))} Spiele${get(brand, 'games.slots') ? `, davon ${fmt(get(brand, 'games.slots'))} Automaten` : ''}${get(brand, 'games.tables') === 0 ? ', keine Tischspiele' : get(brand, 'games.tables') ? `, ${fmt(get(brand, 'games.tables'))} Tischspiele` : ''}.</p>`
    : '<p><small>Den Umfang des Spielangebots haben wir noch nicht an der Quelle gezählt.</small></p>'}
${(get(brand, 'live') ?? []).length
    ? `<p><strong>Live-Tische:</strong> ${(get(brand, 'live') ?? []).map((l) => esc(properLabel(l, locale))).join(', ')}.</p>`
    : `<p><strong>Kein Live-Casino.</strong> ${ggl
      ? 'Das ist keine Entscheidung des Anbieters: Private Anbieter mit deutscher Erlaubnis dürfen Live-Tische, Roulette und Blackjack online nicht führen.'
      : 'Der Anbieter führt keine Live-Tische.'}</p>`}
${(get(brand, 'betting') ?? []).length ? `<p><strong>Sportwetten:</strong> ${(get(brand, 'betting') ?? []).map((b) => esc(properLabel(b, locale))).join(', ')}.</p>` : ''}
</section>

<section class="section">
<h2>Lizenz und Spielerschutz</h2>
<dl class="kv">
<dt>Lizenz</dt><dd>${esc(get(brand, 'license.authority'))}${get(brand, 'license.number') ? `, Nummer ${esc(get(brand, 'license.number'))}` : ''}</dd>
<dt>Deutsche Erlaubnis</dt><dd>${ggl ? 'ja, auf der GGL-Whitelist geführt' : 'nein'}</dd>
<dt>Schutzfunktionen</dt><dd>${(get(brand, 'security.responsibleTools') ?? []).length
    ? (get(brand, 'security.responsibleTools') ?? []).map((tool) => esc(properLabel(tool, locale))).join(', ')
    : esc(locale.table.notChecked)}</dd>
<dt>Zwei-Faktor-Anmeldung</dt><dd>${get(brand, 'security.twoFactor') ? 'ja' : 'nein'}</dd>
</dl>
${get(brand, 'license.registryUrl') ? `<p><a class="tap-link" href="${esc(get(brand, 'license.registryUrl'))}" rel="nofollow noopener" target="_blank">Lizenz im öffentlichen Register prüfen</a></p>` : ''}
${!ggl ? `<div class="callout"><p><strong>Ohne deutsche Erlaubnis heißt konkret:</strong> keine OASIS-Anbindung, eine bestehende
Selbstsperre greift hier nicht. Kein anbieterübergreifendes Einzahlungslimit. Und keine deutsche Behörde,
die im Streitfall für Sie zuständig wäre.</p></div>` : ''}
</section>

<section class="section">
<h2>Vorteile und Nachteile</h2>
<div class="plus-minus">
<div>
<h3>${esc(locale.ui.pros)}</h3>
<ul class="plus-minus--plus">${(brand.pros ?? []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
</div>
<div>
<h3>${esc(locale.ui.cons)}</h3>
<ul class="plus-minus--minus">${(brand.cons ?? []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
</div>
</div>
</section>

${brand.notFor ? `<section class="section">
<h2>${esc(locale.ui.notFor)}</h2>
<p>${esc(brand.notFor)}</p>
</section>` : ''}

${terms.length ? `<section class="section">
<h2>${esc(locale.ui.alsoListedIn)}</h2>
<ul class="chips">
${terms.map((entry) => `<li><a href="${esc(entry.url)}">${esc(properLabel(entry.slug, locale))} · Platz ${entry.position}</a></li>`).join('\n')}
</ul>
</section>` : ''}

${similar.length ? `<section class="section">
<h2>${esc(locale.ui.similar)}</h2>
<ul class="grid">
${similar.map((s) => {
    const other = ctx.brands.find((b) => b.slug === s.slug);
    if (!other) return '';
    return `<li class="card">
<h3><a href="${esc(brandUrl(other, locale))}">${esc(other.name)}</a></h3>
<p><strong>${esc(formatScore(other.score?.total, ctx))}</strong> ${esc(locale.ui.outOf)} ${esc(other.score?.scale ?? scale)} · ${esc(get(other, 'license.authority'))}</p>
<p><small>Steht in ${s.sharedTerms} derselben Listen</small></p>
</li>`;
  }).join('\n')}
</ul>
</section>` : ''}

${faq.html}

<p><small>${esc(locale.ui.author)}: <a href="${esc(author.url)}" rel="author">${esc(author.name)}</a>, ${esc(locale.authorRoles?.[author.role] ?? author.role)} ·
<time datetime="${esc(brand.publishedAt)}">${esc(locale.ui.publishedOn)} ${esc(brand.publishedAt)}</time> ·
<time datetime="${esc(brand.updatedAt)}">${esc(locale.ui.updatedOn)} ${esc(brand.updatedAt)}</time></small></p>
`;

  const jsonLd = [
    site.seo.schema.review && brand.status === 'active' && brand.score?.total != null
      ? review({
        brand,
        url: page.url,
        domain: site.domain,
        author,
        methodologyUrl: ctx.staticUrls['how-we-test'],
        scale,
      })
      : null,
    faq.node,
  ];

  return document_(ctx, page, { main, jsonLd, h1 });
}

/** Адрес карточки другого бренда — тем же способом, каким его строит граф. */
function brandUrl(brand, locale) {
  return urlJoin(locale.brandBase ?? 'casino', brand.slug);
}

/**
 * Разбор оценки по критериям. Та же factsTable, что и в остальных таблицах
 * сайта: сортировка и мобильная раскладка приходят бесплатно, без второй
 * копии CSS ради одной страницы.
 */
function scoreBreakdown(brand, ctx) {
  const { locale, criteria } = ctx;
  const breakdown = brand.score?.breakdown ?? [];
  if (!breakdown.length) return '';

  const maxWeight = Math.max(...breakdown.map((c) => c.weight));
  const na = `<span class="score--na">${esc(locale.table.notChecked)}</span>`;

  const rows = breakdown.map((c) => {
    const label = locale.criteria[c.id] ?? c.id;
    const scoreCell = c.skipped
      ? { value: null, className: 'num', html: na }
      : {
        value: c.score,
        className: `num score ${scoreBand(c.score)}`,
        html: `<b>${esc(formatScore(c.score, ctx))}</b><i style="--pct:${Math.round(((c.score ?? 0) / (criteria.scale ?? 10)) * 100)}%"></i>`,
      };
    const basisText = c.skipped
      ? (locale.ui.criterionSkipped ?? '')
      : c.rules.filter((r) => !r.skipped).map((r) => `${locale.ruleLabels?.[r.id] ?? r.id}: ${r.points}`).join(' · ');

    return {
      value: label,
      html: esc(label),
      cells: [
        { value: c.weight, className: 'num weight', html: `<b>${c.weight} %</b><i style="--pct:${Math.round((c.weight / maxWeight) * 100)}%"></i>` },
        scoreCell,
        { value: null, className: 'facts-what', html: esc(basisText) },
      ],
    };
  });

  return factsTable(ctx, {
    id: 'score-breakdown',
    headCol: 'criterion',
    headLabel: 'Kriterium',
    minWidth: '40rem',
    columns: [
      { col: 'weight', label: 'Gewicht', sort: 'number', dir: 'desc' },
      { col: 'score', label: 'Punkte', sort: 'number', dir: 'desc' },
      { col: 'basis', label: 'Was dahinter steckt', sort: 'none' },
    ],
    rows,
  });
}

/**
 * Способы оплаты значками. Настоящий логотип для каждого метода, который
 * встречается в данных, — см. lib/icons.js: тип-заглушка остаётся только
 * для метода, для которого файла действительно нет.
 */
function paymentChips(methods, heading, ctx) {
  const { locale } = ctx;
  if (!methods.length) return '';

  return `<p><strong>${esc(heading)}:</strong></p>
<ul class="chips">
${methods.map((m) => {
    const label = properLabel(m, locale);
    const url = paymentUrl(m, ctx);
    return `<li><a href="${esc(url)}">${paymentIcon(m, { size: 14, label })}${esc(label)}</a></li>`;
  }).join('')}
</ul>`;
}

/** Ссылка на листинг платёжного метода, если он собрался. */
function paymentUrl(method, ctx) {
  const page = ctx.graph.pages.find((p) => p.type === 'listing' && p.data.slug === `${method}-casino`);
  return page ? page.url : ctx.staticUrls.compare;
}

/** Требуемый оборот и число вращений. Null, если данных не хватает. */
function turnover(brand) {
  const amount = get(brand, 'bonus.amount');
  const wagering = get(brand, 'bonus.wagering');
  if (amount == null || wagering == null) return null;

  const base = get(brand, 'bonus.wageringApplies') === 'bonus+deposit' ? amount * 2 : amount;
  const total = Math.round(base * wagering);
  const maxBet = get(brand, 'bonus.maxBet');
  const days = get(brand, 'bonus.expiryDays');
  const spins = maxBet ? Math.round(total / maxBet) : null;

  return { turnover: total, spins, perDay: spins && days ? Math.round(spins / days) : null };
}

function depositOnly(brand) {
  const dep = get(brand, 'payments') ?? [];
  const wd = get(brand, 'payments_withdrawal');
  if (!Array.isArray(wd)) return [];
  return dep.filter((m) => !wd.includes(m));
}

function buildFaq(brand, ctx) {
  const { locale } = ctx;
  const u = locale.units;
  const only = depositOnly(brand);
  const t = turnover(brand);
  const ggl = get(brand, 'license.localLicensed');

  return [
    {
      question: `Ist ${brand.name} in Deutschland legal?`,
      answer: ggl
        ? `Ja. ${brand.name} steht auf der Whitelist der GGL und darf virtuelle Automatenspiele in Deutschland anbieten. `
          + `Damit gelten dort 1 € Höchsteinsatz pro Drehung, 1.000 € Einzahlungslimit im Monat und die Anbindung an die OASIS-Sperrdatei.`
        : `${brand.name} hat keine deutsche Erlaubnis, sondern eine Lizenz aus ${get(brand, 'license.authority')}. `
          + `Der Anbieter ist nicht an OASIS und nicht an das Einzahlungslimit angeschlossen, und es gibt keine deutsche Behörde, die bei Streit für Sie zuständig ist.`,
    },
    {
      question: `Wie lange dauert eine Auszahlung bei ${brand.name}?`,
      answer: get(brand, 'payout.effectiveHours') == null
        ? `Der Anbieter macht dazu keine Angabe, die wir an der Quelle bestätigen konnten, und eigene Auszahlungen haben wir hier noch nicht durchgeführt. `
          + `Wir tragen die Zahl nach, statt eine plausible einzusetzen.`
        : `${get(brand, 'payout.effectiveHours')} ${u.hours}. ${get(brand, 'payout.isMeasured')
          ? `Das ist der Median unserer eigenen ${get(brand, 'payout.samples')} Abhebungen, gegenüber ${get(brand, 'payout.claimedHours')} ${u.hours} laut Anbieter.`
          : `Das ist die Angabe des Anbieters. Eigene Messungen stehen noch aus und ersetzen diesen Wert, sobald sie vorliegen.`}`,
    },
    {
      question: `Lohnt sich der Bonus von ${brand.name}?`,
      answer: t
        ? `Rechnen Sie mit ${t.turnover.toLocaleString('de-DE')} ${u.currency} Umsatz, um den vollen Bonus freizuspielen`
          + `${t.spins ? `, das sind rund ${t.spins.toLocaleString('de-DE')} Drehungen` : ''}`
          + `${get(brand, 'bonus.expiryDays') ? ` innerhalb von ${get(brand, 'bonus.expiryDays')} Tagen` : ''}. `
          + `Entscheiden Sie danach, nicht nach der beworbenen Prozentzahl.`
        : `Die Umsatzbedingungen sind noch nicht an der Quelle bestätigt, deshalb rechnen wir hier nichts vor. `
          + `Ohne den Umsatzfaktor und den Bezug, Bonus allein oder Bonus plus Einzahlung, ist jede Rechnung geraten.`,
    },
    {
      question: `Kann ich bei ${brand.name} auf denselben Weg auszahlen, über den ich eingezahlt habe?`,
      answer: only.length
        ? `Nicht immer. ${only.map((m) => properLabel(m, locale)).join(', ')} ${only.length === 1 ? 'funktioniert' : 'funktionieren'} nur zum Einzahlen. `
          + `Auszahlungen laufen über ${(get(brand, 'payments_withdrawal') ?? []).map((m) => properLabel(m, locale)).join(', ')}.`
        : Array.isArray(get(brand, 'payments_withdrawal'))
          ? `Ja. Alle Methoden, die zum Einzahlen funktionieren, sind hier auch für Auszahlungen freigeschaltet, das ist seltener, als es sein sollte.`
          : `Welche Methoden zum Auszahlen freigeschaltet sind, haben wir noch nicht geprüft. Prüfen Sie es vor der ersten Einzahlung in der Kasse des Anbieters.`,
    },
    {
      question: `Gibt es bei ${brand.name} Live-Casino?`,
      answer: (get(brand, 'live') ?? []).length
        ? `Ja: ${(get(brand, 'live') ?? []).map((l) => properLabel(l, locale)).join(', ')}. `
          + `Das ist nur möglich, weil der Anbieter ohne deutsche Erlaubnis arbeitet, mit GGL-Lizenz wäre Live-Casino nicht zulässig.`
        : ggl
          ? `Nein, und das kann sich auch nicht ändern. Private Anbieter mit deutscher Erlaubnis dürfen weder Live-Tische noch Online-Roulette oder Blackjack führen. Erlaubt sind nur virtuelle Automatenspiele, Poker und Sportwetten.`
          : `Nein. Der Anbieter führt keine Live-Tische, obwohl er ohne deutsche Lizenz dazu berechtigt wäre.`,
    },
    {
      question: `Für wen ist ${brand.name} nichts?`,
      answer: brand.notFor || `Dazu machen wir hier keine pauschale Aussage: Prüfen Sie Bonusbedingungen und Lizenz oben gegen Ihre eigene Situation.`,
    },
  ];
}
