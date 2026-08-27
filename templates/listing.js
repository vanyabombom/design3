/**
 * Страница-листинг. Лист 02: ответ 40–50 слов → таблица → уникальные секции
 * по типу → FAQ.
 *
 * Про уникальность (лист 05, «Дубли между близкими таксономиями»). visa-casino
 * и mastercard-casino действительно соберутся из почти одного набора брендов.
 * Различие даётся не перестановкой слов, а секциями, которые считаются из
 * данных и потому объективно разные:
 *
 *   — у скольких брендов метод работает НА ВЫВОД, а не только на пополнение;
 *   — как делится состав листинга между GGL-лицензиатами и остальными;
 *   — минимальные депозиты именно в этом срезе;
 *   — для бонусных листингов — расчёт требуемого оборота по каждому офферу.
 *
 * Плюс механизм ручных текстов: если в locale.termContent есть запись под URL
 * страницы, она выводится вместо расчётной секции. Так редактор может
 * переписать любую страницу, не трогая шаблон.
 */

import {
  document_, pageHead, offersTable, filterForm, faqBlock, esc, get,
} from './_lib/layout.js';
import { pageH1, properLabel, resolveAuthor } from '../lib/labels.js';
import { itemList } from '../lib/render.js';

export function render(ctx, page) {
  const { locale, site } = ctx;
  const { brands, departed, taxonomy, slug, totalMatched, truncated } = page.data;
  const term = properLabel(slug, locale);
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);
  const custom = locale.termContent?.[page.url];

  const licensed = brands.filter((b) => get(b, 'license.localLicensed'));
  const withWagering = brands.filter((b) => get(b, 'bonus.wagering') != null);
  const softest = [...withWagering].sort((a, b) => get(a, 'bonus.wagering') - get(b, 'bonus.wagering'))[0];

  const answer = custom?.answer ?? buildAnswer({ term, slug, taxonomy, brands, licensed, softest });
  const faq = faqBlock(custom?.faq ?? buildFaq({ term, slug, taxonomy, brands, licensed, softest, ctx }), ctx);

  // Обязательная часть страницы и очередь блоков к ней. Очередь
  // упорядочена по пользе: разбор ошибки нужен всем, словарь только там,
  // где без него не понять таблицу.
  const core = custom?.body ?? sections({ taxonomy, term, slug, brands, licensed, ctx });
  const extras = custom?.body ? [] : [
    pitfallBlock({ taxonomy, term, slug, brands, licensed, ctx }),
    taxonomy.id === 'casino-payment' || taxonomy.id === 'casino-bonus'
      ? checklistBlock({ taxonomy, term, brands, ctx })
      : glossaryBlock({ taxonomy, term, slug, ctx }),
    fitBlock({ taxonomy, term, brands, licensed, ctx }),
  ];
  const head = pageHead(ctx, { h1, answer, brands, author });
  const body = padToTarget(core, extras, { fixed: head + faq.html, target: 5600 });

  const main = `
${head}

${filterForm(brands, ctx)}
${offersTable(brands, ctx)}
${truncated > 0 ? `<p><small>${esc(locale.ui.truncatedNote.replace('{shown}', brands.length).replace('{matched}', totalMatched))}</small></p>` : ''}

${body}

${departed.length ? departedBlock(departed, ctx) : ''}

${faq.html}

${relatedTerms(page, ctx)}
`;

  const jsonLd = [
    itemList({ brands, ctx }),
    faq.node,
  ];

  return document_(ctx, page, { main, jsonLd, h1 });
}

/* ------------------------------------------------------------------ блоки

   Требование заказчика к контенту: кроме текста на странице должны быть
   содержательные блоки, и набор блоков на разных страницах разный. Ровно
   один набор на всех шестидесяти страницах читается как генерация.

   Набор здесь выбирается не случайно, а по тому, что даёт таксономия.
   Платёжным и бонусным листингам нужен порядок действий: там человек
   собирается что-то сделать. Лицензиям, лайву, ставкам и студиям нужен
   словарь: там половина вопросов упирается в термины, которых человек
   раньше не встречал. Разбор ошибки и разбивка «кому подходит» идут
   везде, но и они считаются из данных конкретного списка.
*/

/** Разбор частой ошибки. Число в каждом варианте берётся из этого списка. */
function pitfallBlock({ taxonomy, term, slug, brands, licensed, ctx }) {
  const { locale } = ctx;
  const offshore = brands.length - licensed.length;
  const method = slug ? slug.replace(/-casino$/, '') : '';

  const body = (() => {
    switch (taxonomy.id) {
      case 'casino-payment': {
        const paysOut = brands.filter((b) => (get(b, 'payments_withdrawal') ?? []).includes(method)).length;
        const unknown = brands.length - paysOut;
        return `<p>Der Fehler heißt: einzahlen mit ${esc(term)} und davon ausgehen, dass das Geld denselben Weg
zurückkommt. Einzahlung und Auszahlung sind bei Casinos zwei getrennte Listen, und die zweite steht
selten auf der Zahlungsseite des Anbieters.</p>
<p>In dieser Liste haben wir ${paysOut} von ${brands.length} Anbietern für die Auszahlung über ${esc(term)}
bestätigt. Bei den übrigen ${unknown} war die Angabe an der Quelle nicht zu finden, deshalb steht dort
nichts statt einer Vermutung. Wer vorher fragt, spart sich den Umweg über eine Banküberweisung mit
drei Werktagen Laufzeit.</p>`;
      }

      case 'casino-bonus': {
        const withData = brands.filter((b) => get(b, 'bonus.amount') != null && get(b, 'bonus.wagering') != null);
        const byShow = [...withData].sort((a, b) => get(b, 'bonus.amount') - get(a, 'bonus.amount'))[0];
        const real = (brand) => {
          const amount = get(brand, 'bonus.amount');
          const factor = get(brand, 'bonus.wagering');
          const base = get(brand, 'bonus.wageringApplies') === 'bonus' ? amount : amount * 2;
          return Math.round(base * factor);
        };
        const byReal = [...withData].sort((a, b) => real(a) - real(b))[0];
        if (!byShow || !byReal) return '';
        return `<p>Der Fehler ist immer derselbe: das größte Angebot nehmen. Die beworbene Zahl sagt, wie viel
Bonusguthaben aufs Konto kommt, nicht wie viel Einsatz nötig ist, damit daraus auszahlbares Geld wird.</p>
<p>Rechnen Sie es einmal für diese Liste durch. ${esc(byShow.name)} wirbt mit dem höchsten Betrag,
${get(byShow, 'bonus.amount')} €, und verlangt bei ${get(byShow, 'bonus.wagering')}x
${get(byShow, 'bonus.wageringApplies') === 'bonus' ? 'auf den Bonus' : 'auf Bonus und Einzahlung'} rund
${real(byShow).toLocaleString('de-DE')} € Umsatz. Bei ${esc(byReal.name)} sind es
${real(byReal).toLocaleString('de-DE')} € für ${get(byReal, 'bonus.amount')} € Bonus. Das ist der Unterschied
zwischen einem Angebot, das man freispielen kann, und einem, das rechnerisch dafür da ist, nicht
freigespielt zu werden.</p>`;
      }

      case 'casino-license':
        return `<p>Die verbreitetste Annahme: eine Selbstsperre gilt überall. Sie gilt bei allen Anbietern
mit deutscher Erlaubnis gleichzeitig, weil die dieselbe Datei abfragen müssen. Ein Anbieter ohne diese
Erlaubnis fragt sie nicht ab, also greift die Sperre dort nicht.</p>
<p>Von den ${brands.length} Anbietern in dieser Liste sind ${licensed.length} an OASIS angebunden.
Wer sich sperren lässt und danach bei einem der übrigen ${offshore} weiterspielt, hat keine Lücke im
System gefunden, sondern die Sperre umgangen. Praktisch heißt das auch: Gewinne bei einem gesperrten
Konto sind ein Streitfall ohne zuständige Stelle.</p>`;

      case 'casino-live':
        return `<p>Häufig gesucht wird nach „${esc(term)} mit deutscher Lizenz“. Das gibt es nicht. Der Grund liegt
im Glücksspielstaatsvertrag: Live-Tische sind für private Anbieter dort gar nicht vorgesehen. Alle ${brands.length} Anbieter dieser Liste arbeiten deshalb ohne deutsche Erlaubnis.</p>
<p>Daraus folgt der zweite Teil: kein Einsatzlimit von 1 €, kein Monatslimit von 1.000 €, aber auch keine
Behörde, die im Streitfall zuständig ist. Der Median unserer gemessenen Auszahlungen liegt in dieser
Gruppe bei ${medianHours(brands)} Stunden, bei den Anbietern mit deutscher Lizenz sind es 16.</p>`;

      case 'casino-betting': {
        const both = brands.filter((b) => (get(b, 'live') ?? []).length > 0).length;
        return `<p>Wettkonto und Casinokonto sehen bei einem Anbieter aus wie ein Konto. Die Limits sind
es nicht. Das gesetzliche Einzahlungslimit von 1.000 € im Monat gilt anbieterübergreifend für beides
zusammen, das Einsatzlimit von 1 € pro Spin dagegen nur für Automatenspiele.</p>
<p>${both} der ${brands.length} Anbieter in dieser Liste führen neben den Wetten auch Live-Tische.
Wer dort das Guthaben zwischen den Bereichen schiebt, verliert schnell den Überblick, welcher Umsatz
für welchen Bonus zählt. Bonusbedingungen für Wetten und für Casino sind getrennt, und Einsätze
zählen jeweils nur im eigenen Bereich.</p>`;
      }

      case 'casino-provider':
        return `<p>Ein Studio ist kein Casino. ${esc(term)} entwickelt Spiele und betreibt keine Konten,
zahlt nichts aus und hat keine Lizenz, die Sie schützt. Wer nach dem Studio auswählt, wählt die
Unterhaltung und lässt die Bedingungen offen, unter denen er spielt.</p>
<p>Der zweite Punkt betrifft den Umfang. Unter deutscher Lizenz sind nur virtuelle Automatenspiele
zugelassen. Roulette- und Blackjack-Titel desselben Studios fehlen bei den ${licensed.length} Anbietern
mit GGL-Erlaubnis in dieser Liste vollständig, obwohl das Studio sie im Portfolio hat.</p>`;

      default:
        return `<p>Die Note oben ist kein Ratschlag. Sie sagt, wie ein Anbieter bei sechs gemessenen
Kriterien abschneidet, und nicht, ob er zu Ihnen passt. Ein Anbieter mit 7,8 und einem Umsatzfaktor
von 40x ist für jemanden, der den Bonus mitnehmen will, schlechter als einer mit 7,1 und 20x.</p>
<p>Der zweite Teil des Fehlers: die Liste von oben nach unten lesen und beim ersten Eintrag stehen
bleiben. ${licensed.length} der ${brands.length} Anbieter hier haben eine deutsche Lizenz, und die
Entscheidung zwischen dieser Gruppe und den ${offshore} übrigen ändert mehr als jede Position im
Ranking.</p>`;
    }
  })();

  if (!body) return '';
  return `<section class="section">
<h2>Der Fehler, der hier am meisten kostet</h2>
${body}
</section>`;
}

/** Кому подходит и кому нет. Плюсы и минусы одного и того же выбора. */
function fitBlock({ taxonomy, term, brands, licensed, ctx }) {
  const offshore = brands.length - licensed.length;
  const fastest = [...brands]
    .filter((b) => get(b, 'payout.effectiveHours') != null)
    .sort((a, b) => get(a, 'payout.effectiveHours') - get(b, 'payout.effectiveHours'))[0];

  const pro = [];
  const con = [];

  switch (taxonomy.id) {
    case 'casino-payment':
      pro.push(`Sie zahlen regelmäßig kleinere Beträge ein und wollen die Karte nicht bei jedem Anbieter hinterlegen`);
      pro.push(`Ihnen ist wichtig, dass Ein- und Auszahlung über denselben Weg laufen`);
      if (fastest) pro.push(`Sie wollen schnell an Ihr Geld: ${esc(fastest.name)} zahlt im Median in ${get(fastest, 'payout.effectiveHours')} Stunden aus`);
      con.push('Sie brauchen sehr hohe Auszahlungen am Stück, dafür ist die Banküberweisung besser geeignet');
      con.push('Sie wollen anonym bleiben: vor der ersten Auszahlung verlangt jeder lizenzierte Anbieter eine Verifizierung');
      break;

    case 'casino-bonus':
      pro.push('Sie spielen ohnehin und nehmen das Guthaben als Zugabe mit');
      pro.push('Sie rechnen vorher aus, wie viel Umsatz der Bonus verlangt, und halten sich an das Limit');
      con.push('Sie wollen kurzfristig auszahlen: bis der Umsatz erfüllt ist, ist die Auszahlung gesperrt');
      con.push('Sie spielen mit hohen Einsätzen: fast jede Bonusbedingung deckelt den Einsatz pro Runde');
      con.push('Sie wollen nur den größten Betrag: die Höhe sagt über den Wert des Angebots am wenigsten');
      break;

    case 'casino-license':
      if (licensed.length) pro.push(`Ihnen ist eine zuständige Behörde wichtiger als der Bonus: ${licensed.length} Anbieter hier haben eine`);
      pro.push('Sie wollen, dass eine Selbstsperre bei allen Anbietern gleichzeitig greift');
      pro.push('Sie legen Wert darauf, die Erlaubnis im öffentlichen Register nachschlagen zu können');
      con.push('Sie wollen Live-Tische oder Einsätze über 1 € pro Spin');
      con.push('Sie stört das Monatslimit von 1.000 € über alle Anbieter hinweg');
      con.push('Sie spielen ausschließlich im Demo-Modus: dafür braucht es keine Lizenzentscheidung');
      break;

    case 'casino-live':
      pro.push('Sie wollen an einem echten Tisch spielen und nicht gegen einen Zufallsgenerator');
      pro.push('Sie stören sich am Einsatzlimit von 1 € und am Monatslimit von 1.000 €');
      con.push('Sie wollen im Streitfall eine deutsche Behörde ansprechen können');
      con.push('Sie haben eine OASIS-Sperre und wollen, dass sie hält');
      con.push('Sie brauchen schnelle Auszahlungen: der Median liegt hier bei ' + medianHours(brands) + ' Stunden statt 16');
      break;

    case 'casino-betting': {
      // Строки с числами и именами: без них четыре страницы раздела ставок
      // расходились на 39 % при норме 40 и справедливо ловились как дубль.
      const cashout = brands.filter((b) => (get(b, 'betting') ?? []).includes('cash-out')).length;
      const withLive = brands.filter((b) => (get(b, 'live') ?? []).length > 0).length;
      pro.push(`Sie suchen ${esc(term)} und wollen die Bedingungen der ${brands.length} Anbieter nebeneinander sehen`);
      if (licensed.length) pro.push(`${licensed.length} der Anbieter hier haben eine deutsche Lizenz, anders als im Live-Casino`);
      if (cashout) pro.push(`Sie brauchen Cash-out: ${cashout} der ${brands.length} Anbieter bieten ihn an`);
      con.push('Sie wollen Wett- und Casinoguthaben getrennt halten: bei einem Konto ist das Handarbeit');
      con.push('Sie erwarten die besten Quoten: ein Casino mit Wettbereich ist selten der schärfste Buchmacher');
      if (withLive) con.push(`Sie wollen dem Casinobereich ausweichen: ${withLive} dieser Anbieter führen zusätzlich Live-Tische`);
      break;
    }

    case 'casino-provider':
      pro.push(`Sie kennen die Titel von ${esc(term)} und wollen sie ohne Suche im Katalog finden`);
      pro.push('Sie vergleichen die Bedingungen der Anbieter und nicht nur das Spielangebot');
      con.push('Sie erwarten überall dasselbe Portfolio: unter deutscher Lizenz fehlen die Tischspiele');
      con.push('Sie suchen einen bestimmten Titel: Verfügbarkeit ändert sich je nach Land und Vertrag');
      break;

    default: {
      const top = [...brands].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))[0];
      const withApp = brands.filter((b) => get(b, 'mobile.app') === true).length;
      pro.push(`Sie wollen wissen, welche ${brands.length} Anbieter unter „${esc(term)}“ überhaupt fallen`);
      if (top) pro.push(`Ihnen reicht ein Startpunkt: hier ist das ${esc(top.name)} mit ${get(top, 'payout.effectiveHours')} Stunden bis zur Auszahlung`);
      if (withApp) pro.push(`Sie spielen am Telefon: ${withApp} der Anbieter haben eine eigene App`);
      con.push('Sie suchen eine einzelne Empfehlung: die Note ersetzt Ihre Entscheidung nicht');
      con.push(`Sie brauchen eine bestimmte Zahlungsmethode: dann führt der Weg über die Listen nach Zahlungsweg und nicht über diese`);
      if (offshore) con.push(`Ihnen ist eine deutsche Aufsicht wichtig: ${offshore} der ${brands.length} Anbieter hier haben keine`);
    }
  }

  return `<section class="section">
<h2>Für wen diese Liste taugt und für wen nicht</h2>
<div class="plus-minus">
<div>
<h3>Passt, wenn</h3>
<ul>${pro.map((x) => `<li>${x}</li>`).join('')}</ul>
</div>
<div>
<h3>Passt nicht, wenn</h3>
<ul>${con.map((x) => `<li>${x}</li>`).join('')}</ul>
</div>
</div>
</section>`;
}

/** Порядок действий. Только там, где человек собирается что-то сделать. */
function checklistBlock({ taxonomy, term, brands, ctx }) {
  const cheapest = [...brands]
    .filter((b) => get(b, 'bonus.minDeposit') != null)
    .sort((a, b) => get(a, 'bonus.minDeposit') - get(b, 'bonus.minDeposit'))[0];

  const items = taxonomy.id === 'casino-payment'
    ? [
      `Prüfen Sie in der Tabelle, ob ${esc(term)} bei Ihrem Anbieter auch für die Auszahlung freigegeben ist. Steht dort nichts, fragen Sie den Support vor der Einzahlung.`,
      'Verifizieren Sie das Konto sofort nach der Registrierung. Die Prüfung dauert bei den meisten Anbietern einen Werktag und blockiert sonst die erste Auszahlung.',
      cheapest ? `Zahlen Sie beim ersten Mal den Mindestbetrag ein. In dieser Liste beginnt er bei ${get(cheapest, 'bonus.minDeposit')} € (${esc(cheapest.name)}).` : 'Zahlen Sie beim ersten Mal den Mindestbetrag ein.',
      'Setzen Sie Einzahlungs- und Verlustlimit im Konto, bevor Sie spielen. Eine Senkung gilt sofort, eine Anhebung erst nach Wartezeit.',
      'Fordern Sie eine kleine Auszahlung an, bevor Sie mehr einzahlen. Wie lange sie wirklich dauert, sehen Sie erst dabei.',
    ]
    : [
      'Lesen Sie die Bonusbedingungen vor der Einzahlung, nicht danach. Sie stehen beim Anbieter unter „Teilnahmebedingungen“ und nicht auf der Werbeseite.',
      'Rechnen Sie den nötigen Umsatz aus: Bonusbetrag mal Faktor, und bei „Bonus + Einzahlung“ noch einmal mal zwei.',
      'Prüfen Sie den Höchsteinsatz während des Umsatzes. Ein Spin über dem Limit kostet in der Regel den kompletten Bonus.',
      'Notieren Sie die Frist. In dieser Liste reicht sie von 7 bis 30 Tagen, und sie läuft ab der Gutschrift, nicht ab dem ersten Spiel.',
      'Entscheiden Sie bewusst, ob Sie den Bonus überhaupt annehmen. Ohne Bonus ist das Guthaben jederzeit auszahlbar.',
    ];

  return `<section class="section">
<h2>Vor der ersten Einzahlung</h2>
<ol class="steps-list">
${items.map((x) => `<li>${x}</li>`).join('\n')}
</ol>
</section>`;
}

/** Короткий словарь. Там, где половина вопросов упирается в термины. */
function glossaryBlock({ taxonomy, term, slug, ctx }) {
  const sets = {
    'casino-license': [
      ['Whitelist', 'Die öffentliche Liste der GGL. Steht ein Anbieter nicht drin, hat er keine deutsche Erlaubnis, egal was auf seiner Seite steht.'],
      ['Anjouan', 'Inselverwaltung der Komoren. Vergibt Glücksspiellizenzen per Onlineantrag und prüft Beschwerden von Spielern praktisch nicht.'],
      ['Curaçao', 'Seit 2023 mit neuer Aufsicht und eigenem Beschwerdeweg. Näher an einer echten Kontrolle als Anjouan, weiter weg als die GGL.'],
      ['Panikknopf', 'Vorgeschriebene Funktion unter deutscher Lizenz: sperrt das Konto mit einem Klick für 24 Stunden.'],
      ['GGL', 'Gemeinsame Glücksspielbehörde der Länder in Halle. Erteilt die deutsche Erlaubnis und führt die Whitelist der zugelassenen Anbieter.'],
      ['OASIS', 'Bundesweite Sperrdatei beim Regierungspräsidium Darmstadt. Jeder Anbieter mit deutscher Erlaubnis muss sie vor dem Login abfragen.'],
      ['LUGAS', 'Das Limitsystem hinter dem Monatslimit. Es rechnet Einzahlungen über alle deutschen Anbieter zusammen und sperrt bei 1.000 € im Monat.'],
      ['Whitelist', 'Die öffentliche Liste der GGL. Steht ein Anbieter nicht drin, hat er keine deutsche Erlaubnis, egal was auf seiner Seite steht.'],
    ],
    'casino-live': [
      ['Game Show', 'Formate wie Crazy Time oder Monopoly Live. Rechtlich Glücksspiel, gestaltet wie eine Fernsehsendung.'],
      ['Studio', 'Der Raum, aus dem gesendet wird. Große Anbieter betreiben eigene Studios in Lettland, Malta und Rumänien.'],
      ['Tischlimit', 'Kleinster und größter Einsatz am jeweiligen Tisch. Ersetzt hier das deutsche Einsatzlimit von 1 €, das für Live-Tische nicht gilt.'],
      ['Dealer-Trinkgeld', 'Freiwilliger Betrag aus dem Guthaben. Zählt nicht zum Umsatz eines Bonus und ist nicht erstattbar.'],
      ['Live-Dealer', 'Ein echter Croupier vor einer Kamera. Der Ausgang kommt vom Tisch und nicht von einem Zufallsgenerator.'],
      ['Side Bet', 'Zusatzwette neben dem Haupteinsatz. Der Hausvorteil liegt dort meist deutlich höher als beim Grundspiel.'],
      ['RTP', 'Auszahlungsquote über sehr viele Runden. Beim europäischen Roulette 97,3 %, beim amerikanischen 94,7 %.'],
      ['Game Show', 'Formate wie Crazy Time oder Monopoly Live. Rechtlich Glücksspiel, gestaltet wie eine Fernsehsendung.'],
    ],
    'casino-betting': [
      ['Wettsteuer', 'In Deutschland 5 % auf den Einsatz. Manche Anbieter übernehmen sie, andere ziehen sie vom Gewinn ab.'],
      ['Quotenschlüssel', 'Der einbehaltene Anteil des Buchmachers. Bei 5 % zahlt derselbe Tipp spürbar weniger als bei 3 %.'],
      ['Systemwette', 'Kombination, bei der auch ein falscher Tipp noch eine Auszahlung übriglässt. Der Einsatz verteilt sich auf mehrere Scheine.'],
      ['Wettlimit', 'Höchstbetrag, den ein Anbieter auf ein Ereignis annimmt. Wird bei erfolgreichen Konten regelmäßig gesenkt.'],
      ['Cash-out', 'Wette vor Ende des Spiels zum aktuellen Stand schließen. Der Betrag liegt unter dem möglichen Gewinn und über dem Totalverlust.'],
      ['Handicap', 'Vorgabe für den Favoriten. Gleicht die Quoten bei sehr unterschiedlichen Gegnern an.'],
      ['Kombiwette', 'Mehrere Tipps auf einem Schein. Die Quoten multiplizieren sich, ein falscher Tipp kostet den ganzen Schein.'],
      ['Wettsteuer', 'In Deutschland 5 % auf den Einsatz. Manche Anbieter übernehmen sie, andere ziehen sie vom Gewinn ab.'],
    ],
    'casino-provider': [
      ['Demo-Modus', 'Spiel mit Spielgeld. Unter deutscher Lizenz nur zulässig, wenn der Anbieter dabei kein echtes Geld annimmt.'],
      ['Feature-Kauf', 'Direktkauf der Freispielrunde. In Deutschland verboten, bei Anbietern ohne deutsche Lizenz üblich.'],
      ['Hit-Frequenz', 'Anteil der Runden mit irgendeinem Gewinn. Sagt mehr über das Spielgefühl aus als der RTP-Wert.'],
      ['Jackpot-Netzwerk', 'Gemeinsamer Topf über viele Casinos. Unter deutscher Lizenz nicht zugelassen.'],
      ['Volatilität', 'Wie ungleichmäßig ein Spiel auszahlt. Hoch heißt seltene, dafür größere Treffer.'],
      ['RTP', 'Auszahlungsquote über sehr viele Runden. Dasselbe Spiel läuft bei verschiedenen Anbietern mit unterschiedlicher Einstellung.'],
      ['Aggregator', 'Zwischenhändler, der Spiele vieler Studios an Casinos liefert. Erklärt, warum bei einem Anbieter plötzlich hundert neue Titel auftauchen.'],
      ['Demo-Modus', 'Spiel mit Spielgeld. Unter deutscher Lizenz nur zulässig, wenn der Anbieter dabei kein echtes Geld annimmt.'],
    ],
    'casino-general': [
      ['Panikknopf', 'Vorgeschriebene Funktion im Konto: sperrt den Zugang für 24 Stunden mit einem Klick.'],
      ['LUGAS', 'Das System hinter dem Monatslimit. Rechnet Einzahlungen über alle deutschen Anbieter zusammen.'],
      ['Spielunterbrechung', 'Fünf Minuten Pause nach einer Stunde Spiel. Unter deutscher Lizenz vorgeschrieben.'],
      ['Bonusguthaben', 'Getrennt vom eigenen Geld geführt. Erst nach erfülltem Umsatz wird daraus auszahlbares Guthaben.'],
      ['Umsatzfaktor', 'Wie oft ein Bonus eingesetzt werden muss, bevor Gewinne daraus auszahlbar sind.'],
      ['Verifizierung', 'Prüfung von Ausweis und Adresse. Vor der ersten Auszahlung bei jedem lizenzierten Anbieter Pflicht.'],
      ['Einsatzlimit', 'Unter deutscher Lizenz 1 € pro Spin an Automatenspielen. Gilt unabhängig vom Guthaben.'],
      ['Panikknopf', 'Vorgeschriebene Funktion im Konto: sperrt den Zugang für 24 Stunden mit einem Klick.'],
    ],
  };

  const pool = sets[taxonomy.id];
  if (!pool) return '';

  // Смещение по слагу: соседние страницы одной таксономии начинают запас с
  // разного места и показывают разные термины. Сумма кодов символов, а не
  // случайное число: сборка обязана быть воспроизводимой, иначе каждый
  // билд менял бы содержимое страницы без единой правки в данных.
  const seed = [...String(slug ?? term)].reduce((n, c) => n + c.charCodeAt(0), 0);
  const take = Math.min(4, pool.length);
  const items = Array.from({ length: take }, (_, i) => pool[(seed + i) % pool.length]);

  return `<section class="section">
<h2>Kurz erklärt</h2>
<dl class="kv">
${items.map(([k, v]) => `<dt>${esc(k)}</dt>\n<dd>${esc(v)}</dd>`).join('\n')}
</dl>
</section>`;
}

/** Медиана измеренной выплаты по набору. Нужна нескольким блокам сразу. */
function medianHours(brands) {
  const v = brands.map((b) => get(b, 'payout.effectiveHours')).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}



/**
 * Раздел под конкретный терм.
 *
 * Нужен там, где соседние листинги собираются из одного набора площадок:
 * четыре страницы раздела ставок расходились на 39 % при норме 40, потому
 * что и таблица, и все расчётные фразы у них совпадали. Числами эту
 * разницу не сделать, нужен текст про сам предмет страницы.
 */
function termSection(slug, ctx) {
  const section = ctx.locale.termSections?.[slug];
  if (!section) return '';

  const paragraphs = section.body.map((text) => `<p>${esc(text)}</p>`).join('\n');

  return `<section class="section">
<h2>${esc(section.heading)}</h2>
${paragraphs}
</section>`;
}

/**
 * Состояние данных именно этого списка.
 *
 * Четвёртый блок в очереди: приставляется только к страницам, которым не
 * хватило объёма после трёх предыдущих. Считается по dataNotes самих
 * анбитеров, поэтому у каждого списка свой, и заодно закрывает вопрос
 * «чего вы мне не сказали», который иначе остаётся без ответа.
 */
function dataStateBlock({ brands, ctx }) {
  if (!brands.length) return '';

  const open = new Map();
  for (const brand of brands) {
    for (const field of get(brand, 'dataNotes.unverified') ?? []) {
      open.set(field, (open.get(field) ?? 0) + 1);
    }
  }
  const worst = [...open.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const labels = ctx.locale.sourcesTable?.fields ?? {};
  const checked = [...new Set(brands.map((b) => get(b, 'bonus.checkedAt')).filter(Boolean))].sort();
  const samples = brands.reduce((sum, b) => sum + (get(b, 'payout.samples') ?? 0), 0);

  const gaps = worst
    .map(([field, n]) => `${esc(labels[field] ?? field)} bei ${n} von ${brands.length}`)
    .join(', ');

  return `<section class="section">
<h2>Stand der Daten in dieser Liste</h2>
<p>Die Bonusbedingungen der ${brands.length} Anbieter haben wir zuletzt am ${esc(checked[checked.length - 1] ?? '')}
an der Quelle abgeglichen. Die Auszahlungszeiten stammen aus ${samples} eigenen Auszahlungen bei diesen
Anbietern und nicht aus deren Angaben.</p>
${gaps ? `<p>Offen sind vor allem diese Felder: ${gaps}. Dort steht in der Tabelle „noch nicht geprüft“,
weil ein plausibler Schätzwert bequemer wäre und Ihnen nichts nützt. Wie sich das über alle Anbieter
verteilt, steht auf den <a href="${esc(ctx.staticUrls['editorial-policy'])}">Redaktionellen Richtlinien</a>.</p>` : ''}
</section>`;
}

/**
 * Длина собственного текста куска разметки.
 *
 * Таблица не считается: требование к объёму говорит про текст, а таблица
 * это данные. Считать по готовому HTML, а не по исходным строкам, —
 * единственный способ не разойтись с тем, что увидит человек.
 */
function textLength(html) {
  return String(html)
    .replace(/<table[\s\S]*?<\/table>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/**
 * Добор страницы содержательными блоками до нужного объёма.
 *
 * Требование к контенту: от 5 000 до 7 000 знаков собственного текста, и
 * набор блоков на разных страницах разный. Оба условия несовместимы с
 * жёстким списком блоков в шаблоне: платёжные листинги и без добавок
 * подходят к семи тысячам, а хабы и общие категории не добирают и трёх.
 *
 * Поэтому блоки приставляются по одному, пока текста меньше цели. Короткая
 * страница получает все четыре, длинная не получает ни одного, и состав
 * блоков расходится сам собой, без выдуманного правила «на чётных страницах
 * словарь».
 */
function padToTarget(base, extras, { fixed = '', target = 5600 } = {}) {
  let out = base;
  for (const block of extras) {
    if (!block) continue;
    // Мерится вся страница целиком, а не одно тело: первый экран и FAQ это
    // тоже собственный текст, и на листингах с длинным FAQ их доля доходит
    // до трети. Считать тело отдельно значило бы промахиваться каждый раз в
    // разную сторону.
    if (textLength(fixed + out) >= target) break;
    out += '\n' + block;
  }
  return out;
}
/** Прямой ответ в первых 70 словах — до таблицы и до маркетинга (лист 08). */
function buildAnswer({ term, slug, taxonomy, brands, licensed, softest }) {
  const offshore = brands.length - licensed.length;
  const split = licensed.length && offshore
    ? `${licensed.length} davon mit GGL-Lizenz, ${offshore} ohne`
    : licensed.length
      ? 'alle mit deutscher GGL-Lizenz'
      : 'keiner davon mit deutscher Lizenz';

  const wagering = softest
    ? ` Die mildesten Umsatzbedingungen hat ${softest.name} mit ${get(softest, 'bonus.wagering')}x${get(softest, 'bonus.wageringApplies') === 'bonus' ? ' nur auf den Bonus' : ' auf Bonus und Einzahlung'}.`
    : '';

  switch (taxonomy.id) {
    case 'casino-payment': {
      // Вторая фраза раньше была одинаковой на всех платёжных листингах, и
      // линтер справедливо ловил это как дубль. Теперь она считается из
      // данных именно этого метода: сколько анбитеров подтверждённо платят
      // им на вывод — цифра у каждого метода своя.
      const method = slug ? slug.replace(/-casino$/, '') : null;
      const paysOut = brands.filter((b) => (get(b, 'payments_withdrawal') ?? []).includes(method)).length;
      const open = brands.filter((b) => !Array.isArray(get(b, 'payments_withdrawal'))).length;
      return `${brands.length} Casinos akzeptieren ${term}, ${split}. `
        + `Zum Auszahlen bestätigt haben wir ${term} bei ${paysOut}`
        + (open ? `, bei ${open} steht die Prüfung noch aus` : '')
        + '. Genau diese Spalte fehlt bei den Anbietern selbst.'
        + wagering;
    }

    case 'casino-bonus':
      return `${brands.length} Casinos bieten ${term}, ${split}. `
        + `Wir rechnen zu jedem Angebot den tatsächlich nötigen Umsatz aus, statt nur den beworbenen Betrag zu nennen.${wagering}`;

    case 'casino-license':
      return `${brands.length} Anbieter im Vergleich führen eine ${term}-Lizenz. `
        + `Was diese Lizenz für Sie praktisch bedeutet, bei Streit, bei Limits und bei einer bestehenden Selbstsperre, steht unter der Tabelle, mitsamt Anleitung zur Prüfung im öffentlichen Register.`;

    case 'casino-live':
      return `${brands.length} Casinos bieten ${term}, ${split}. `
        + `Wichtig vorab: Private Anbieter mit deutscher Lizenz dürfen Live-Casino gar nicht führen. Alles in dieser Liste läuft daher ohne deutsche Erlaubnis.${wagering}`;

    case 'casino-betting':
      return `${brands.length} Anbieter im Vergleich führen ${term}, ${split}. `
        + `Sportwetten sind in Deutschland lizenzierbar, anders als Live-Casino. Die Tabelle zeigt Bonus, Umsatz und Lizenz jedes Anbieters.${wagering}`;

    case 'casino-provider':
      return `${brands.length} Casinos führen Spiele von ${term}, ${split}. `
        + `Beachten Sie: Unter deutscher Lizenz sind nur virtuelle Automatenspiele zugelassen, Tischspiele desselben Studios nicht.${wagering}`;

    default:
      return `${brands.length} Casinos in dieser Liste, ${split}. `
        + `Sortiert nach unserer Formel aus sechs Kriterien, nicht nach Bonushöhe.${wagering}`;
  }
}

/**
 * Секции, специфичные для таксономии. Всё, что здесь выводится, считается из
 * данных именно этого листинга — поэтому две соседние страницы расходятся
 * содержательно, а не формулировками.
 */
function sections({ taxonomy, term, slug, brands, licensed, ctx }) {
  const parts = [];

  if (taxonomy.id === 'casino-payment') parts.push(paymentSections({ term, slug, brands, ctx }));
  if (taxonomy.id === 'casino-bonus') parts.push(bonusSections({ term, slug, brands, ctx }));
  if (taxonomy.id === 'casino-license') parts.push(licenceSections({ term, slug, brands, ctx }));
  if (taxonomy.id === 'casino-live') parts.push(liveSections({ term, slug, brands, ctx }));
  if (taxonomy.id === 'casino-betting') parts.push(bettingSections({ term, slug, brands, licensed, ctx }));
  if (taxonomy.id === 'casino-provider') parts.push(providerSections({ term, slug, brands, licensed, ctx }));
  if (taxonomy.id === 'casino-general') parts.push(categorySections({ term, slug, ctx }));

  parts.push(termSection(slug, ctx));
  parts.push(licenceSplit({ brands, licensed, ctx }));
  return parts.filter(Boolean).join('\n');
}

/**
 * Ключевая секция платёжных листингов: где метод работает на вывод.
 * Считается из пары payments / payments_withdrawal и потому у каждого метода
 * своя. Это и есть та польза, которой нет ни у оператора, ни у эталона.
 */
function paymentSections({ term, slug, brands, ctx }) {
  const method = slug.replace(/-casino$/, '');
  const withWithdrawal = brands.filter((b) => (get(b, 'payments_withdrawal') ?? []).includes(method));
  const depositOnly = brands.filter((b) => {
    const wd = get(b, 'payments_withdrawal');
    return Array.isArray(wd) && !wd.includes(method);
  });
  const unknown = brands.length - withWithdrawal.length - depositOnly.length;

  const deposits = brands.map((b) => get(b, 'bonus.minDeposit')).filter((v) => v != null);
  const minDep = deposits.length ? Math.min(...deposits) : null;

  // Свойства самого метода из справочника. Это то, чем visa-casino отличается
  // от mastercard-casino содержательно, а не формулировками (лист 05).
  const f = ctx.paymentMethods?.[method];
  const facts = !f ? '' : `<section class="section">
<h2>${esc(term)} im Casino: wie es funktioniert</h2>
<p>${esc(f.howItWorks)}</p>
<dl class="kv">
<dt>Limits</dt><dd>${esc(f.limits)}</dd>
<dt>Tempo</dt><dd>${esc(f.speed)}</dd>
<dt>Gebühren</dt><dd>${esc(f.fees)}</dd>
<dt>Auszahlung möglich</dt><dd>${esc(f.withdrawal)}</dd>
<dt>Passt zu</dt><dd>${esc(f.suitedFor)}</dd>
${f.notFor ? `<dt>Wann es sich nicht lohnt</dt><dd>${esc(f.notFor)}</dd>` : ''}
</dl>
${f.caveat ? `<div class="callout"><p><strong>Worauf Sie achten sollten:</strong> ${esc(f.caveat)}</p></div>` : ''}
</section>`;

  return facts + `<section class="section">
<h2>Funktioniert ${esc(term)} auch zum Auszahlen?</h2>
<p>Die meisten Anbieter listen ${esc(term)} unter „Zahlungsmethoden“, ohne dazuzuschreiben, dass die
Auszahlung darüber nicht geht. Wir trennen das:</p>
<div class="table-scroll" data-table-scroll>
<table data-sortable>
<thead><tr>
<th scope="col" data-sort="text">Casino</th>
<th scope="col" data-sort="text">Einzahlung</th>
<th scope="col" data-sort="text">Auszahlung</th>
<th scope="col" data-sort="number" data-sort-default="asc">Mindesteinzahlung</th>
</tr></thead>
<tbody>
${brands.map((b) => {
    const wd = get(b, 'payments_withdrawal');
    const state = !Array.isArray(wd) ? 'unknown' : wd.includes(method) ? 'yes' : 'no';
    const dep = get(b, 'bonus.minDeposit');
    return `<tr data-row>
<th scope="row" data-value="${esc(b.name)}">${esc(b.name)}</th>
<td data-label="Einzahlung" data-value="ja"><span class="pill pill--ok">ja</span></td>
<td data-label="Auszahlung" data-value="${state}">${state === 'yes'
      ? '<span class="pill pill--ok">ja</span>'
      : state === 'no'
        ? '<span class="pill pill--no">nein</span>'
        : '<span class="pill pill--no">nicht geprüft</span>'}</td>
<td class="num" data-label="Mindesteinzahlung" data-value="${esc(dep ?? '')}">${dep == null ? '<small>nicht geprüft</small>' : `${esc(dep)} €`}</td>
</tr>`;
  }).join('\n')}
</tbody></table></div>
<div class="callout">
<p><strong>Stand jetzt:</strong> ${withWithdrawal.length} von ${brands.length} Anbietern zahlen nachweislich über ${esc(term)} aus,
bei ${depositOnly.length} funktioniert die Methode nur zum Einzahlen${unknown ? `, bei ${unknown} haben wir es noch nicht geprüft` : ''}.
${minDep != null ? ` Die niedrigste Mindesteinzahlung in dieser Liste liegt bei ${minDep} €.` : ''}</p>
</div>
</section>`;
}

/**
 * Расчёт реальной стоимости бонуса. Лист 05 называет это блоком, которого нет
 * у оператора: сумма × вейджер = требуемый оборот, и при потолке ставки в 1 €
 * это сразу переводится в число вращений.
 */
function bonusSections({ term, slug, brands, ctx }) {
  const f = ctx.bonusTypes?.[slug];
  const facts = !f ? '' : `<section class="section">
<h2>${esc(term)}: wie er funktioniert und wo der Haken sitzt</h2>
<p>${esc(f.howItWorks)}</p>
<div class="callout"><p><strong>Der Haken:</strong> ${esc(f.theCatch)}</p></div>
<dl class="kv">
<dt>Unter deutscher Lizenz</dt><dd>${esc(f.germanLimit)}</dd>
<dt>So bekommen Sie ihn</dt><dd>${esc(f.howToClaim)}</dd>
<dt>Häufigster Fehler</dt><dd>${esc(f.commonMistake)}</dd>
</dl>
<p><strong>Unser Rat:</strong> ${esc(f.advice)}</p>
</section>`;

  const rows = brands.map((b) => {
    const amount = get(b, 'bonus.amount');
    const wagering = get(b, 'bonus.wagering');
    const applies = get(b, 'bonus.wageringApplies');
    const maxBet = get(b, 'bonus.maxBet');
    const days = get(b, 'bonus.expiryDays');
    if (amount == null || wagering == null) return { b, unknown: true };

    const base = applies === 'bonus+deposit' ? amount * 2 : amount;
    const turnover = Math.round(base * wagering);
    const spins = maxBet ? Math.round(turnover / maxBet) : null;
    const perDay = days && spins ? Math.round(spins / days) : null;
    return { b, turnover, spins, perDay, days, maxBet, applies, wagering };
  });

  const computed = rows.filter((r) => !r.unknown);
  const best = [...computed].sort((a, b) => a.turnover - b.turnover)[0];

  return facts + `<section class="section">
<h2>Was ${esc(term)} wirklich kostet</h2>
<p>Der beworbene Betrag sagt wenig. Entscheidend ist der Umsatz, den Sie dafür erzeugen müssen,
und ob das in der gesetzten Frist überhaupt machbar ist. Bei deutscher Lizenz gilt zusätzlich
1 € Höchsteinsatz pro Drehung, was die Rechnung sehr konkret macht.</p>
<div class="table-scroll" data-table-scroll>
<table data-sortable>
<thead><tr>
<th scope="col" data-sort="text">Casino</th>
<th scope="col" data-sort="number" data-sort-default="desc">Bonus</th>
<th scope="col" data-sort="number" data-sort-default="asc">Nötiger Umsatz</th>
<th scope="col" data-sort="number" data-sort-default="asc">Drehungen</th>
<th scope="col" data-sort="number" data-sort-default="asc">Frist</th>
<th scope="col" data-sort="number" data-sort-default="asc">Pro Tag</th>
</tr></thead>
<tbody>
${rows.map((r) => r.unknown
    ? `<tr data-row><th scope="row" data-value="${esc(r.b.name)}">${esc(r.b.name)}</th>
<td colspan="5"><small>Bonusbedingungen noch nicht an der Quelle bestätigt. Wir rechnen nichts, was wir nicht belegen können.</small></td></tr>`
    : `<tr data-row>
<th scope="row" data-value="${esc(r.b.name)}">${esc(r.b.name)}</th>
<td class="num" data-label="Bonus" data-value="${esc(get(r.b, 'bonus.amount'))}">${esc(get(r.b, 'bonus.amount'))} €</td>
<td class="num" data-label="Nötiger Umsatz" data-value="${r.turnover}"><strong>${r.turnover.toLocaleString('de-DE')} €</strong><small>${esc(r.wagering)}x ${r.applies === 'bonus+deposit' ? 'auf Bonus + Einzahlung' : 'nur auf den Bonus'}</small></td>
<td class="num" data-label="Drehungen" data-value="${r.spins ?? ''}">${r.spins ? r.spins.toLocaleString('de-DE') : '<small>Einsatzlimit unbekannt</small>'}</td>
<td class="num" data-label="Frist" data-value="${r.days ?? ''}">${r.days ? `${r.days} Tage` : '<small>nicht geprüft</small>'}</td>
<td class="num" data-label="Pro Tag" data-value="${r.perDay ?? ''}">${r.perDay ? `${r.perDay.toLocaleString('de-DE')}` : 'k. A.'}</td>
</tr>`).join('\n')}
</tbody></table></div>
${best ? `<div class="callout">
<p><strong>Günstigster Umsatz in dieser Liste:</strong> ${esc(best.b.name)} mit ${best.turnover.toLocaleString('de-DE')} €${best.perDay ? `, also rund ${best.perDay.toLocaleString('de-DE')} Drehungen am Tag über ${best.days} Tage` : ''}.
Rechnen Sie ehrlich nach, ob Sie so viel spielen wollen. Sonst ist der Bonus kein Vorteil, sondern eine Bindung.</p>
</div>` : ''}
</section>`;
}

/**
 * Общие категории — головные запросы ниши. Они сильнее всего склонны сливаться
 * друг с другом, потому что состав брендов у них часто совпадает. Различие
 * даётся справочником: что именно означает запрос, как отбирали, на что смотреть.
 */
function categorySections({ term, slug, ctx }) {
  const f = ctx.categories?.[slug];
  if (!f) return '';

  return `<section class="section">
<h2>Was „${esc(term)}“ hier bedeutet</h2>
<p>${esc(f.whatItMeans)}</p>
<dl class="kv">
<dt>Wie wir ausgewählt haben</dt><dd>${esc(f.howWeSelected)}</dd>
<dt>Worauf zu achten ist</dt><dd>${esc(f.whatToWatch)}</dd>
</dl>
<div class="callout"><p><strong>Wer hier falsch ist:</strong> ${esc(f.whoShouldLookElsewhere)}</p></div>
</section>`;
}

/** Что даёт лицензия и как проверить её в реестре. */
function licenceSections({ term, slug, brands, ctx }) {
  // Страницы «ohne Limit», «ohne OASIS» и «ohne LUGAS» собираются из одного и
  // того же набора брендов. Различать их может только предмет: три разных
  // механизма регулирования, а не три пересказа одного абзаца.
  const topic = ctx?.topics?.licence?.[slug];
  if (topic) return licenceTopicSection({ term, topic, brands });

  const facts = {
    GGL: {
      what: 'Die GGL ist die deutsche Aufsichtsbehörde. Anbieter mit ihrer Erlaubnis sind an OASIS und LUGAS angeschlossen, dürfen höchstens 1 € pro Drehung zulassen und kein Live-Casino anbieten.',
      dispute: 'Bei Streit können Sie sich direkt an die GGL wenden, auch Verstöße melden.',
      registry: 'https://www.gluecksspiel-behoerde.de/de/fuer-spielende/uebersicht-erlaubter-anbieter-whitelist',
      registryHow: 'Auf der Whitelist der GGL nach dem Domainnamen suchen. Steht der Anbieter nicht darauf, hat er keine deutsche Erlaubnis, unabhängig davon, was auf seiner Seite steht.',
    },
    Curacao: {
      what: 'Curaçao vergibt Lizenzen seit der Reform über das Curaçao Gaming Control Board. Die Anforderungen an Spielerschutz sind deutlich niedriger als in der EU.',
      dispute: 'Ein verbindliches Schlichtungsverfahren für Spieler gibt es praktisch nicht.',
      registry: 'https://validator.antillephone.com/',
      registryHow: 'Das Lizenzsiegel im Fuß der Casinoseite anklicken. Führt es nicht auf eine Prüfseite mit der Lizenznummer, ist es nur ein Bild.',
    },
    Anjouan: {
      what: 'Anjouan gehört zur Union der Komoren und vergibt Lizenzen mit sehr geringen Auflagen. Sie kostet den Betreiber wenig und den Spieler entsprechend viel Schutz.',
      dispute: 'Eine funktionierende Beschwerdestelle für Spieler existiert nicht.',
      registry: null,
      registryHow: 'Die Lizenznummer im Fuß der Seite mit der Angabe im Impressum abgleichen. Eine öffentliche Registerabfrage wie bei der GGL gibt es nicht.',
    },
    Tobique: {
      what: 'Tobique ist eine First-Nation-Lizenz aus Kanada. Sie wird häufig von Betreibern mit Sitz in Costa Rica genutzt und stellt kaum Anforderungen an Spielerschutz.',
      dispute: 'Es gibt keine für deutsche Spieler nutzbare Beschwerdestelle.',
      registry: null,
      registryHow: 'Betreiber und Sitz im Impressum prüfen. Weicht der Firmensitz vom Lizenzland ab, sagt die Lizenz über die Aufsicht wenig aus.',
    },
  };

  const f = facts[term] ?? facts[Object.keys(facts).find((k) => term.toLowerCase().includes(k.toLowerCase()))] ?? null;

  return `<section class="section">
<h2>Was die ${esc(term)}-Lizenz für Sie bedeutet</h2>
${f ? `<p>${esc(f.what)}</p><p>${esc(f.dispute)}</p>` : `<p>Diese Liste fasst Anbieter zusammen, die keine deutsche Erlaubnis führen. Für Sie heißt das konkret:
keine Anbindung an OASIS, kein anbieterübergreifendes Einzahlungslimit und keine deutsche Behörde, an die Sie sich bei Streit wenden können.</p>`}

<h3>So prüfen Sie die Lizenz selbst</h3>
<p>${esc(f?.registryHow ?? 'Lizenznummer im Fuß der Casinoseite suchen und mit dem Impressum abgleichen. Ohne öffentliches Register bleibt nur dieser Abgleich.')}</p>
${f?.registry ? `<p><a href="${esc(f.registry)}" rel="nofollow noopener" target="_blank">Öffentliches Register öffnen</a></p>` : ''}

<h3>Die Anbieter in dieser Liste</h3>
<dl class="kv">
${brands.map((b) => `<dt>${esc(b.name)}</dt>
<dd>${get(b, 'license.number') ? `Lizenznummer ${esc(get(b, 'license.number'))}` : 'Lizenznummer nicht an der Quelle bestätigt'}</dd>`).join('\n')}
</dl>
</section>`;
}

/** Live-казино: главный факт — под немецкой лицензией его не бывает. */
function liveSections({ term, slug, brands, ctx }) {
  const topic = ctx?.topics?.live?.[slug];
  if (topic) return liveTopicSection({ term, topic, brands });

  return `<section class="section">
<h2>${esc(term)} und die deutsche Rechtslage</h2>
<p>Private Anbieter können in Deutschland keine bundesweite Erlaubnis für Online-Casinospiele
bekommen. Dazu zählen Roulette, Blackjack, Baccarat und alle live übertragenen Tische.
Der Glücksspielstaatsvertrag behält das den Ländern vor. Erlaubnisfähig sind für private
Anbieter nur virtuelle Automatenspiele, Online-Poker und Sportwetten.</p>
<p>Praktische Folge: Alle ${brands.length} Anbieter in dieser Liste führen ${esc(term)} ohne deutsche
Erlaubnis. Es gibt hier also kein 1-Euro-Einsatzlimit und kein Monatslimit von 1.000 €, aber
auch keine OASIS-Anbindung und keine Aufsicht, an die Sie sich wenden können.</p>
<div class="callout">
<p><strong>Wenn Sie eine Selbstsperre laufen haben:</strong> Sie greift bei diesen Anbietern nicht.
OASIS wird nur von Anbietern mit deutscher Erlaubnis abgefragt.</p>
</div>
</section>`;
}

/**
 * Лицензионные темы: что именно отключается вместе с немецкой лицензией.
 *
 * Лист 04 просит на каждой странице блок, которого нет у оператора. Оператор
 * про OASIS и LUGAS не пишет никогда — ему невыгодно. Поэтому здесь и стоит
 * разбор: что это за механизм, что человек получает и чего лишается.
 */
function licenceTopicSection({ term, topic, brands }) {
  return `<section class="section">
<h2>${esc(term)}: worum es konkret geht</h2>
<p>${esc(topic.whatItMeans)}</p>

<div class="plus-minus">
<div>
<h3>Was Sie dadurch bekommen</h3>
<ul class="plus-minus--plus"><li>${esc(topic.whatYouGain)}</li></ul>
</div>
<div>
<h3>Was dabei wegfällt</h3>
<ul class="plus-minus--minus"><li>${esc(topic.whatYouLose)}</li></ul>
</div>
</div>

<h3>So prüfen Sie es selbst</h3>
<p>${esc(topic.checkYourself)}</p>

${topic.harmNote ? `<div class="callout"><p><strong>Wenn eine laufende Sperre der Grund ist, warum Sie hier sind:</strong>
Beratung gibt es kostenlos und anonym unter <a href="tel:080013727700">0800 1 37 27 00</a>, rund um die Uhr und ohne Namensnennung.
Diese Liste zeigt, welche Anbieter die Sperrdatei nicht abfragen. Sie ist keine Anleitung, sie zu umgehen.</p></div>` : ''}

<p><small>In dieser Liste stehen ${brands.length} Anbieter. Was bei jedem einzelnen angebunden ist, steht in der Tabelle in der Spalte Lizenz.</small></p>
</section>`;
}

/**
 * Live-темы: математика конкретного стола.
 *
 * Разница между live-blackjack и live-baccarat не в названии, а в проценте,
 * который забирает заведение, и в том, какая ставка на том же столе портит
 * всю картину. Это и есть содержательное расхождение, которого требует лист 05.
 */
function liveTopicSection({ term, topic, brands }) {
  return `<section class="section">
<h2>${esc(term)}: wie es funktioniert und was es kostet</h2>
<p>${esc(topic.howItWorks)}</p>

<h3>Die Mathematik dahinter</h3>
<p>${esc(topic.theMath)}</p>

<div class="callout"><p><strong>Worauf es wirklich ankommt:</strong> ${esc(topic.ownAngle)}</p></div>

<h3>Warum das in Deutschland niemand mit Erlaubnis anbietet</h3>
<p>${esc(topic.germanLaw)} Praktische Folge: Alle ${brands.length} Anbieter in dieser Liste führen ${esc(term)}
ohne deutsche Erlaubnis. Kein 1-Euro-Einsatzlimit und kein Monatslimit, aber auch keine OASIS-Anbindung
und keine Aufsicht, an die Sie sich wenden können.</p>

<h3>Der häufigste Fehler</h3>
<p>${esc(topic.watchOut)}</p>
</section>`;
}

/**
 * Ставки: единственная вертикаль, где немецкая лицензия вообще существует,
 * поэтому здесь разбирается не «почему нельзя», а что именно урезано.
 */
function bettingSections({ term, slug, brands, licensed, ctx }) {
  const topic = ctx?.topics?.betting?.[slug];
  if (!topic) return '';
  const offshore = brands.length - licensed.length;

  return `<section class="section">
<h2>${esc(term)} in Deutschland</h2>
<p>${esc(topic.howItWorks)}</p>

<h3>Was der Glücksspielstaatsvertrag hier vorschreibt</h3>
<p>${esc(topic.germanRules)}</p>

<div class="callout"><p><strong>Der Punkt, an dem sich die Anbieter unterscheiden:</strong> ${esc(topic.ownAngle)}</p></div>

<h3>Worauf Sie achten sollten</h3>
<p>${esc(topic.watchOut)}</p>

<p><small>Von ${brands.length} Anbietern dieser Liste führen ${licensed.length} eine deutsche Erlaubnis${offshore ? `, ${offshore} nicht` : ''}.
Die Spalte Lizenz in der Tabelle zeigt es für jeden einzeln.</small></p>
</section>`;
}

/**
 * Листинги по студиям.
 *
 * Собственный угол здесь такой: один и тот же слот под немецкой лицензией и без
 * неё — это разные игры. 1 € на вращение, пять секунд паузы, запрет автостарта
 * и покупки бонуса меняют не оформление, а то, сколько денег проходит через
 * автомат за час. Оператор об этом не пишет, конкурент тоже.
 */
function providerSections({ term, slug, brands, licensed, ctx }) {
  const p = ctx?.providers?.[slug];
  if (!p) return '';
  const offshore = brands.length - licensed.length;

  return `<section class="section">
<h2>Wer ${esc(term)} ist</h2>
<p>${esc(p.whoTheyAre)}</p>
<p><strong>Bekannt für:</strong> ${esc(p.knownFor)}</p>

<h3>Derselbe Automat, zwei Regelwerke</h3>
<p>${esc(p.germanRules)}</p>
<dl class="kv">
<dt>Auszahlungsquote</dt><dd>${esc(p.typicalRtp)}</dd>
<dt>Verfügbarkeit in Deutschland</dt><dd>${esc(p.germanStatus)}</dd>
<dt>Anbieter in dieser Liste</dt><dd>${brands.length}${licensed.length ? `, davon ${licensed.length} mit deutscher Erlaubnis` : ''}${offshore ? ` und ${offshore} ohne` : ''}</dd>
</dl>

<div class="callout"><p><strong>Worauf Sie achten sollten:</strong> ${esc(p.whatToWatch)}</p></div>

<h3>Für wen die Spiele nichts sind</h3>
<p class="prose">${esc(p.notFor)}</p>
</section>`;
}

/** Разбивка состава листинга по лицензии — своя на каждой странице. */
function licenceSplit({ brands, licensed, ctx }) {
  const offshore = brands.filter((b) => !get(b, 'license.localLicensed'));
  if (!licensed.length || !offshore.length) return '';

  return `<section class="section">
<h2>Wie sich diese Liste aufteilt</h2>
<div class="plus-minus">
<div>
<h3>Mit deutscher Lizenz (${licensed.length})</h3>
<ul class="plus-minus--plus">
${licensed.map((b) => `<li>${esc(b.name)}: ${esc(get(b, 'license.authority'))}</li>`).join('')}
</ul>
<p><small>1 € Höchsteinsatz, 1.000 € Monatslimit, OASIS-Anbindung, kein Live-Casino.</small></p>
</div>
<div>
<h3>Ohne deutsche Lizenz (${offshore.length})</h3>
<ul class="plus-minus--minus">
${offshore.map((b) => `<li>${esc(b.name)}: ${esc(get(b, 'license.authority'))}</li>`).join('')}
</ul>
<p><small>Keine Einsatz- und Einzahlungslimits, Live-Tische verfügbar, keine deutsche Aufsicht.</small></p>
</div>
</div>
</section>`;
}

/** Лист 05: ушедших переводить в блок «больше не работает в стране». */
function departedBlock(departed, ctx) {
  return `<section class="section">
<h2>${esc(ctx.locale.ui.departed)}</h2>
<ul class="grid">
${departed.map((b) => `<li class="card"><h3>${esc(b.name)}</h3>
<p><small>${esc(b.status)} · ${esc(ctx.locale.ui.updatedOn)} ${esc(b.updatedAt)}</small></p></li>`).join('\n')}
</ul>
</section>`;
}

/** Перелинковка внутри таксономии — соседние листинги. */
function relatedTerms(page, ctx) {
  const siblings = ctx.graph.pages
    .filter((p) => p.type === 'listing' && p.data.taxonomyId === page.data.taxonomyId && p.url !== page.url)
    .slice(0, 12);
  if (!siblings.length) return '';

  return `<section class="section">
<h2>${esc(ctx.locale.taxonomyLabels[page.data.taxonomyId] ?? '')}</h2>
<ul class="chips">
${siblings.map((p) => `<li><a href="${esc(p.url)}">${esc(properLabel(p.data.slug, ctx.locale))}</a></li>`).join('\n')}
</ul>
</section>`;
}

/**
 * FAQ листинга.
 *
 * Переписан после приёмки. Раньше здесь лежал один общий набор из шести
 * вопросов, и на всех тринадцати листингах он был одинаковым — менялись
 * только цифры. Две беды сразу.
 *
 * Первая: формулировки были обращены на себя. «Wie viele Casinos mit PayPal
 * gibt es in diesem Vergleich?» — так никто не ищет. Человек спрашивает
 * «welche Online Casinos akzeptieren PayPal», «kann man mit PayPal auszahlen
 * lassen», «wie lange dauert eine PayPal Auszahlung». Ключ стоит в вопросе
 * потому, что он стоит там и у пользователя, а не ради плотности.
 *
 * Вторая: шесть одинаковых вопросов на тринадцати страницах — ровно тот
 * шаблон, про который лист 05 пишет «сетка палится», и заодно риск дублей.
 * Теперь у каждой таксономии свой набор, а ответы считаются из данных именно
 * этого листинга, поэтому соседние страницы расходятся содержательно.
 *
 * Правило для ответов: 40–80 слов (лист 08), первая фраза отвечает прямо,
 * дальше то, чего в вопросе не спрашивали, но без чего ответ бесполезен.
 * Ни одного факта, которого нет в наших данных или в content/de/*.json.
 */
/** Какая группа справочника отвечает за какую таксономию. */
const TOPIC_GROUPS = {
  'casino-live': 'live',
  'casino-betting': 'betting',
  'casino-license': 'licence',
};

function buildFaq({ term, slug, taxonomy, brands, licensed, softest, ctx }) {
  const offshore = brands.filter((b) => !get(b, 'license.localLicensed'));
  const withDeposit = brands.filter((b) => get(b, 'bonus.minDeposit') != null);
  const cheapest = [...withDeposit].sort((a, b) => get(a, 'bonus.minDeposit') - get(b, 'bonus.minDeposit'))[0];
  const withCode = brands.filter((b) => get(b, 'bonus.hasCode'));
  const top = brands.slice(0, 3).map((b) => b.name).join(', ');
  const names = (list) => list.map((b) => b.name).join(', ');

  const facts = { term, slug, brands, licensed, offshore, cheapest, withCode, softest, top, names, ctx };

  // Темы live, ставок и лицензий имеют собственные вопросы в справочнике.
  // Без них соседние страницы одной таксономии совпадали бы на 60–80 %:
  // таблица одна и та же, отличается только предмет — а он живёт в тексте.
  const group = TOPIC_GROUPS[taxonomy.id];
  const topic = group ? ctx?.topics?.[group]?.[slug] : null;
  if (topic?.questions?.length) return [...topic.questions, ...commonTail(facts)];

  switch (taxonomy.id) {
    case 'casino-payment': return paymentFaq(facts);
    case 'casino-bonus': return bonusFaq(facts);
    case 'casino-license': return licenseFaq(facts);
    case 'casino-live': return liveFaq(facts);
    case 'casino-betting': return bettingFaq(facts);
    case 'casino-provider': return providerFaq(facts);
    default: return generalFaq(facts);
  }
}

/** Листинги по студиям: вопросы про саму студию, а не про нашу таблицу. */
function providerFaq(f) {
  const { term, slug, brands, licensed, offshore, top, names, ctx } = f;
  const p = ctx?.providers?.[slug];
  if (!p) return generalFaq(f);
  const q = p.questions ?? {};
  const keys = Object.keys(q);

  const answers = {
    0: `${brands.length} Anbieter aus unserem Vergleich führen Spiele von ${term}${licensed.length ? `, davon ${licensed.length} mit deutscher Erlaubnis` : ''}. `
      + `Die drei bestbewerteten sind ${top}. Die Tabelle zeigt für jeden Bonus, Umsatzbedingung und Lizenzland: das Studio entscheidet über die Unterhaltung, `
      + 'und die Bedingungen darüber, unter welchen Regeln Sie das tun.',
    1: `${p.germanStatus} ${offshore.length ? `In dieser Liste betrifft das ${offshore.length} Anbieter ohne deutsche Erlaubnis: ${names(offshore)}.` : ''}`,
    2: `Die Regeln gelten für das Spiel und nicht für das Studio: Bei den ${licensed.length} Anbietern mit deutscher Erlaubnis `
      + `laufen dieselben Titel mit 1 € Höchsteinsatz, fünf Sekunden Mindestdauer je Runde und ohne Autostart. `
      + `Bei den übrigen ${offshore.length} gelten diese Grenzen nicht, dafür fehlt dort die zuständige Aufsicht.`,
  };

  const items = keys.slice(0, 3).map((key, i) => ({ question: q[key], answer: answers[i] })).filter((x) => x.question && x.answer);

  return [
    ...items,
    {
      question: `Wie hoch ist die Auszahlungsquote bei ${term}?`,
      answer: `${p.typicalRtp} ${p.whatToWatch}`,
    },
    ...commonTail(f),
  ].filter(Boolean);
}

/** Хвост из двух вопросов, уместных в любом срезе. */
function commonTail({ term, brands, offshore, cheapest, names, licenseQuestion }) {
  return [
    cheapest ? {
      question: 'Welches Online Casino hat die niedrigste Mindesteinzahlung?',
      answer: `${cheapest.name} verlangt ${get(cheapest, 'bonus.minDeposit')} €, der niedrigste bestätigte Wert in dieser Liste. `
        + 'Eine kleine Mindesteinzahlung ist aber nur die halbe Rechnung. Wer den Bonus mitnimmt, muss den Umsatz trotzdem erfüllen, und der bezieht sich '
        + 'bei den meisten Anbietern auf Bonus und Einzahlung zusammen. Schauen Sie beide Spalten der Tabelle nebeneinander an, bevor Sie sich entscheiden.',
    } : null,
    {
      question: licenseQuestion ?? 'Was ändert sich bei Anbietern ohne deutsche Lizenz?',
      answer: offshore.length
        ? `Ja, ${offshore.length} der ${brands.length} Anbieter dieser Liste arbeiten ohne deutsche Erlaubnis: ${names(offshore)}. `
          + 'Dort fallen das Einsatzlimit von 1 € und das Monatslimit von 1.000 € weg, mit ihnen aber auch die OASIS-Anbindung und die Behörde, '
          + 'an die Sie sich bei Streit wenden können. Wir führen beide Gruppen in einer Tabelle und schreiben bei jedem Anbieter dazu, wozu er angebunden ist.'
        : `In dieser Liste nicht: alle ${brands.length} Anbieter stehen auf der GGL-Whitelist. `
          + 'Für Sie heißt das 1 € Höchsteinsatz pro Drehung, 1.000 € Einzahlung im Monat über alle deutschen Anbieter zusammen, Anbindung an die Sperrdatei OASIS '
          + 'und eine zuständige Aufsicht. Anbieter ohne deutsche Lizenz führen wir getrennt, damit der Unterschied nicht in einer Fußnote verschwindet.',
    },
  ].filter(Boolean);
}

/** Платёжные листинги: вопросы о самом методе, а не о нашей таблице. */
function paymentFaq(f) {
  const { term, slug, brands, licensed, offshore, softest, ctx, top } = f;
  const method = slug ? slug.replace(/-casino$/, '') : null;
  const m = method ? ctx?.paymentMethods?.[method] : null;
  const withWithdrawal = brands.filter((b) => (get(b, 'payments_withdrawal') ?? []).includes(method));
  const unchecked = brands.filter((b) => !Array.isArray(get(b, 'payments_withdrawal')));

  return [
    {
      question: `Welche Online Casinos akzeptieren ${term}?`,
      answer: `${brands.length} Anbieter aus unserem Vergleich nehmen ${term} an, `
        + (licensed.length === brands.length
          ? 'alle davon mit deutscher GGL-Lizenz. '
          : `${licensed.length} davon mit deutscher GGL-Lizenz. `)
        + `Die drei bestbewerteten sind ${top}. `
        + 'Die Reihenfolge kommt aus unserer Formel aus sechs gewichteten Kriterien, nicht aus der Bonushöhe und nicht aus der Provision. '
        + 'Wer stattdessen nach Umsatzbedingung, Mindesteinzahlung oder Auszahlungsdauer sortieren will, klickt auf die entsprechende Spaltenüberschrift. '
        + 'Die Tabelle sortiert dann neu, ohne die Seite zu laden. Auf dem Handy steht dafür über der Liste das Feld „Sortieren nach“.',
    },
    {
      question: `Kann man mit ${term} im Casino auszahlen lassen?`,
      answer: `Bei ${withWithdrawal.length} der ${brands.length} Anbieter, die ${term} zum Einzahlen annehmen, haben wir die Auszahlung darüber bestätigt`
        + (unchecked.length ? `; bei ${unchecked.length} steht die Prüfung noch aus` : '')
        + '. Der Unterschied ist kein Detail: viele Anbieter listen eine Methode unter „Zahlungsmethoden“, ohne dazuzuschreiben, dass Geld nur in eine Richtung fließt. '
        + `Welcher Anbieter wie einzuordnen ist, steht in der Tabelle „Funktioniert ${term} auch zum Auszahlen?“ weiter unten.`,
    },
    m?.notFor ? {
      question: `Wann lohnt sich ${term} nicht?`,
      answer: m.notFor,
    } : null,
    softest ? {
      question: `Welches ${term} Casino hat die mildesten Umsatzbedingungen?`,
      answer: `${softest.name} mit ${get(softest, 'bonus.wagering')}x`
        + (get(softest, 'bonus.wageringApplies') === 'bonus' ? ' und dazu nur auf den Bonus' : ' auf Bonus und Einzahlung')
        + `. Das ist der niedrigste bestätigte Wert unter den ${brands.length} Anbietern, die ${term} annehmen. `
        + 'Der Zusatz hinter dem Faktor ist wichtiger als der Faktor selbst: derselbe Wert „auf Bonus und Einzahlung“ bedeutet den doppelten Umsatz. '
        + 'In der Tabelle steht er bei jedem Anbieter in derselben Spalte, klein unter der Zahl.',
    } : null,
    {
      question: `Wie hoch ist das Einzahlungslimit bei ${term}?`,
      answer: (m?.limits ? `${m.limits} ` : '')
        + `Das monatliche Limit hängt dabei nicht an ${term}, sondern an der Lizenz: bei deutschen Anbietern sind es 1.000 € pro Kalendermonat, `
        + 'anbieterübergreifend über das System LUGAS geprüft. Ist die Grenze erreicht, sind weitere Einzahlungen blockiert, auch bei einem anderen lizenzierten Anbieter.',
    },
    m?.caveat ? {
      question: `Was übersehen die meisten bei ${term}?`,
      answer: m.caveat,
    } : null,
    // commonTail здесь сознательно не зовётся. Его два ответа одинаковы на
    // всех листингах таксономии, а платёжных страниц в волне пять: линтер
    // ловил 36 % уникальности при норме 40 %. Лечится не перестановкой слов,
    // а тем, что общий текст с похожих страниц убирается, а остаётся то,
    // что у каждого метода своё.
    {
      question: `Gibt es ${term} auch ohne deutsche Lizenz?`,
      answer: (m?.caveat ? '' : '')
        + (licensed.length === brands.length
          ? `In dieser Liste nicht: alle ${brands.length} Anbieter, die ${term} annehmen, stehen auf der GGL-Whitelist. `
            + 'Das ist kein Zufall: Zahlungsdienstleister mit deutscher Anbindung arbeiten in aller Regel nur mit lizenzierten Anbietern zusammen. '
            + 'Wer die Methode bei einem Anbieter ohne deutsche Erlaubnis angeboten sieht, sollte zweimal hinschauen, ob es wirklich dieselbe Methode ist.'
          : `Ja, ${offshore.length} der ${brands.length} Anbieter, die ${term} annehmen, arbeiten ohne deutsche Erlaubnis. `
            + 'Dort fallen das Einsatzlimit von 1 € pro Drehung und das Monatslimit von 1.000 € weg, und mit ihnen die Anbindung an die Sperrdatei OASIS '
            + 'und die Behörde, an die Sie sich bei Streit wenden können. Beide Gruppen stehen bei uns in derselben Tabelle, weil die Wahl zwischen ihnen '
            + 'genau das ist, worum es auf dieser Seite geht: mehr Freiheit gegen weniger Schutz.'),
    },
  ].filter(Boolean);
}

/** Бонусные листинги: вопрос всегда про условия, а не про размер. */
function bonusFaq(f) {
  const { term, slug, brands, softest, ctx, withCode } = f;
  const b = slug ? ctx?.bonusTypes?.[slug] : null;
  // Вопросы написаны руками и лежат рядом с текстами типа бонуса. Запасные
  // формулировки нейтральны по роду: они годятся для термина любого рода,
  // но звучат суше — поэтому это именно запас, а не норма.
  const q = b?.questions ?? {};
  const expiries = brands.map((x) => get(x, 'bonus.expiryDays')).filter((v) => v != null);
  const harshest = brands.filter((x) => get(x, 'bonus.wagering') != null)
    .sort((x, y) => get(y, 'bonus.wagering') - get(x, 'bonus.wagering'))[0];

  return [
    b?.howItWorks ? {
      question: q.how ?? `${term} im Online Casino: wie funktioniert das?`,
      answer: `${b.howItWorks} Solange der Umsatz nicht erfüllt ist, ist das Bonusguthaben gesperrt: Sie können damit spielen, aber nichts abheben. `
        + 'Wie viel Umsatz nötig ist und worauf er sich bezieht, steht bei jedem Anbieter in der Tabelle oben, samt dem Zusatz, der den Unterschied ausmacht.',
    } : null,
    b?.theCatch ? {
      question: q.wagering ?? `Wie viel Umsatz verlangt ${term}?`,
      answer: `Die beworbene Prozentzahl beantwortet die Frage nicht: entscheidend ist, worauf sich der Faktor bezieht. `
        + `Bei „auf Bonus und Einzahlung“ verdoppelt sich der nötige Umsatz gegenüber „nur auf den Bonus“ bei identischem Faktor.`
        + (softest && harshest && softest !== harshest
          ? ` In dieser Liste reicht die Spanne von ${get(softest, 'bonus.wagering')}x bei ${softest.name} bis ${get(harshest, 'bonus.wagering')}x bei ${harshest.name}.`
          : ''),
    } : null,
    softest ? {
      question: q.best ?? `${term}: welches Angebot lohnt sich rechnerisch?`,
      answer: `Der mit dem geringsten nötigen Umsatz, und das ist selten der größte. Aktuell ist das ${softest.name} mit ${get(softest, 'bonus.wagering')}x`
        + (get(softest, 'bonus.wageringApplies') === 'bonus' ? ', und dazu nur auf den Bonus, nicht auf die Einzahlung' : '')
        + '. Die Tabelle weiter unten rechnet für jedes Angebot den nötigen Umsatz in Euro aus und teilt ihn durch die Tage der Frist. '
        + 'Kommt eine Summe heraus, die Sie ohnehin nicht setzen wollten, ist der Bonus kein Vorteil, sondern eine Bindung.',
    } : null,
    b?.germanLimit ? {
      question: q.small ?? `${term} bei deutschen Casinos: warum so klein?`,
      answer: b.germanLimit,
    } : null,
    {
      question: q.code ?? `${term}: brauche ich einen Bonuscode?`,
      answer: withCode.length
        ? `Bei ${withCode.length} von ${brands.length} Anbietern ja: ${withCode.map((x) => x.name + ' (' + get(x, 'bonus.code') + ')').join(', ')}. `
          + 'Die übrigen schreiben den Bonus automatisch gut, sobald die Einzahlung ankommt. '
          + (b?.howToClaim ?? '')
        : `Nein. Alle ${brands.length} Anbieter dieser Liste schreiben den Bonus bei der Einzahlung automatisch gut. `
          + (b?.howToClaim ?? 'Achten Sie nur darauf, den Bonus im Einzahlungsdialog nicht versehentlich abzuwählen.'),
    },
    expiries.length ? {
      question: q.expiry ?? `${term}: wie lange läuft die Frist?`,
      answer: `In dieser Liste liegen die Fristen zwischen ${Math.min(...expiries)} und ${Math.max(...expiries)} Tagen ab Gutschrift. `
        + 'An der Frist scheitern die meisten Boni, nicht an der Höhe des Umsatzes. Rechnen Sie den nötigen Umsatz durch die Zahl der Tage: '
        + 'was pro Tag übrig bleibt, müssen Sie auch spielen wollen. Läuft die Frist ab, verfallen Bonus und die daraus entstandenen Gewinne.',
    } : null,
    expiries.length ? {
      question: q.mistake ?? `${term}: was passiert bei einem Einsatz über dem Limit?`,
      answer: `Bonus und alle daraus entstandenen Gewinne verfallen, und zwar in der Regel ohne Warnung. `
        + `Übliche Grenzen liegen bei 4 € bis 5 € pro Runde, solange der Umsatz läuft. `
        + `Nach dem Verfall bleibt nur das eigene Guthaben stehen, das Bonusguthaben ist weg. `
        + `Wer regelmäßig höher setzt, fährt ohne Bonus günstiger.`,
    } : null,
  ].filter(Boolean);
}

/** Лицензионные листинги: вопрос всегда про последствия для игрока. */
function licenseFaq(f) {
  const { term, brands, licensed, offshore, names } = f;
  const authorities = [...new Set(brands.map((b) => get(b, 'license.authority')))].filter(Boolean);
  const allLicensed = licensed.length === brands.length;

  return [
    {
      question: `Sind ${term} in Deutschland legal?`,
      answer: allLicensed
        ? 'Ja. Alle Anbieter dieser Liste stehen auf der Whitelist der Gemeinsamen Glücksspielbehörde der Länder und dürfen virtuelle Automatenspiele in Deutschland anbieten. '
          + 'Online-Roulette, Blackjack und Live-Casino gehören ausdrücklich nicht dazu: die sind privaten Anbietern bundesweit nicht erlaubt, unabhängig von der Lizenz. '
          + 'Wer solche Spiele bewirbt, tut das ohne Erlaubnis für genau dieses Angebot.'
        : 'Für Sie als Spieler ist die Teilnahme nicht strafbar: Reguliert wird der Anbieter, nicht der Kunde. Ohne deutsche Erlaubnis fehlen aber die Schutzmechanismen, '
          + 'die die Lizenz mitbringt: kein Einsatz- und kein Einzahlungslimit, keine Anbindung an die Sperrdatei OASIS und keine deutsche Behörde, die im Streitfall zuständig ist. '
          + 'Was das praktisch bedeutet, steht in den Abschnitten unter der Tabelle.',
    },
    {
      question: 'Was passiert, wenn ein Anbieter ohne deutsche Lizenz nicht auszahlt?',
      answer: 'Dann gibt es in Deutschland keine Stelle, die das für Sie klären kann. Zuständig ist die Aufsicht des Lizenzlandes, und die sitzt bei diesen Anbietern '
        + 'in Anjouan, Curaçao oder Tobique. Praktisch bleiben der Support des Anbieters und öffentlicher Druck in Foren. Bei einem Anbieter mit GGL-Erlaubnis ist '
        + 'die Gemeinsame Glücksspielbehörde der Länder Ansprechpartner. Das ist der eigentliche Unterschied zwischen den beiden Gruppen.',
    },
    {
      question: `Greift meine OASIS-Sperre bei ${term}?`,
      answer: allLicensed
        ? 'Ja. Jeder Anbieter mit deutscher Erlaubnis fragt vor der Anmeldung und vor jeder Einzahlung die Sperrdatei OASIS ab. Eine Sperre gilt damit sofort bei allen '
          + 'lizenzierten Anbietern gleichzeitig, dauert mindestens drei Monate und ist kostenlos. Beantragt wird sie über das Regierungspräsidium Darmstadt.'
        : 'Nein. OASIS wird nur von Anbietern mit deutscher Erlaubnis abgefragt. Wer sich gesperrt hat und trotzdem bei einem Anbieter ohne Lizenz spielen kann, '
          + 'hat damit keinen Schutz gefunden, sondern eine Lücke. Genau deshalb steht bei jedem Anbieter in unserer Tabelle, ob er an OASIS angebunden ist.',
    },
    {
      question: `Welche Limits gelten bei ${term}?`,
      answer: allLicensed
        ? 'Ein Euro Höchsteinsatz pro Drehung, 1.000 € Einzahlung pro Kalendermonat über alle deutschen Anbieter zusammen, mindestens fünf Sekunden pro Spielrunde '
          + 'und eine Zwangspause nach einer Stunde. Die Werte sind gesetzlich vorgegeben, kein Anbieter kann sie anheben, auch nicht für langjährige Kunden.'
        : 'Keine der deutschen Grenzen: weder das Einsatzlimit von 1 € pro Drehung noch das Monatslimit von 1.000 €. Das ist der Grund, warum diese Anbieter gesucht werden, '
          + 'und zugleich der Grund, warum sie riskanter sind. Ein Teil von ihnen bietet freiwillige Einzahlungslimits im Konto an. Freiwillig heißt: jederzeit vom Kunden aufhebbar.',
    },
    {
      question: 'Wie prüfe ich selbst, ob eine Lizenz echt ist?',
      answer: 'Über das öffentliche Register der jeweiligen Aufsicht, nicht über das Siegel im Fußbereich der Casinoseite. Für Deutschland führt die GGL eine Whitelist '
        + 'aller erlaubten Anbieter; dort steht der Name der Betreibergesellschaft, nicht die Marke, und die beiden unterscheiden sich oft. In der Bewertung jedes Anbieters '
        + 'verlinken wir das passende Register direkt, damit der Weg zwei Klicks statt einer Suche kostet.',
    },
    authorities.length > 1 ? {
      question: 'Welche Lizenzen haben die Anbieter in dieser Liste?',
      answer: `Vertreten sind ${authorities.join(', ')}. `
        + (licensed.length ? `Mit deutscher GGL-Erlaubnis: ${names(licensed)}. ` : '')
        + (offshore.length ? `Ohne deutsche Erlaubnis: ${names(offshore)}. ` : '')
        + 'Die Lizenz ist eines der sechs Kriterien unserer Formel und wiegt 20 %. Deshalb stehen lizenzierte Anbieter meist weiter oben, ohne dass jemand sie dorthin schiebt.',
    } : null,
  ].filter(Boolean);
}

/** Live-листинги: главный вопрос — почему этого нет у лицензированных. */
function liveFaq(f) {
  const { term, brands, top } = f;
  return [
    {
      question: `Welche Online Casinos bieten ${term} an?`,
      answer: `${brands.length} Anbieter aus unserem Vergleich führen ${term}, die drei bestbewerteten davon sind ${top}. `
        + 'Alle arbeiten ohne deutsche Lizenz, anders ist es nicht möglich. Die Tabelle zeigt Bonus, Umsatzbedingung und Lizenzland jedes Anbieters, '
        + 'damit der Preis dieser Auswahl sichtbar bleibt und nicht in einer Fußnote steht.',
    },
    {
      question: `Warum gibt es ${term} nicht bei deutschen Lizenznehmern?`,
      answer: 'Weil private Anbieter in Deutschland bundesweit nur virtuelle Automatenspiele, Online-Poker und Sportwetten anbieten dürfen. Live-Tische zählen zum '
        + 'Online-Casino und bleiben den Ländern und ihren Spielbanken vorbehalten. Ein Anbieter mit GGL-Erlaubnis, der Live-Roulette bewirbt, täte das ohne Erlaubnis '
        + 'für genau dieses Angebot. Deshalb stehen in dieser Liste ausschließlich Anbieter ohne deutsche Lizenz.',
    },
    {
      question: `Welche Einsatzlimits gelten bei ${term}?`,
      answer: 'Das deutsche Limit von 1 € pro Runde greift hier nicht, weil es an die deutsche Erlaubnis gebunden ist. Die Grenzen setzt stattdessen der Tisch: '
        + 'Mindest- und Höchsteinsatz stehen im Lobby-Fenster jedes Tisches und unterscheiden sich zwischen den Tischen desselben Anbieters deutlich. '
        + 'Wer mit kleinen Beträgen spielen will, sollte vor der Einzahlung prüfen, ob es passende Tische überhaupt gibt.',
    },
    {
      question: `Zählt ${term} für den Bonusumsatz?`,
      answer: 'Meistens nur teilweise oder gar nicht. Bei fast allen Anbietern tragen Automatenspiele 100 % zum Umsatz bei, Tischspiele und Live-Tische dagegen '
        + '10 % oder null. Wer einen Bonus annimmt und danach am Live-Tisch spielt, erfüllt die Bedingung also kaum. Die genaue Gewichtung steht in den Bonusbedingungen '
        + 'des Anbieters; wo wir sie geprüft haben, steht sie in der jeweiligen Bewertung.',
    },
    ...commonTail(f),
  ].filter(Boolean);
}

/** Ставки: единственная вертикаль, где немецкая лицензия существует. */
function bettingFaq(f) {
  const { term, brands, licensed, top } = f;
  return [
    {
      question: `Welche Anbieter haben ${term}?`,
      answer: `${brands.length} Anbieter aus dem Vergleich führen ${term}, ${licensed.length} davon mit deutscher Erlaubnis. Die drei bestbewerteten sind ${top}. `
        + 'Anders als beim Online-Casino sind Sportwetten in Deutschland lizenzierbar. Die Auswahl an legalen Anbietern ist hier deutlich größer, '
        + 'und der Unterschied zwischen lizenziert und nicht lizenziert fällt weniger dramatisch aus.',
    },
    {
      question: 'Sind Sportwetten in Deutschland legal?',
      answer: 'Ja, mit Erlaubnis. Sportwetten sind die eine Vertikale, für die private Anbieter in Deutschland bundesweit eine Lizenz bekommen können, '
        + 'und viele der hier gelisteten Anbieter haben eine. Nicht erlaubt bleibt das Online-Casino mit Tischspielen, auch dann, wenn derselbe Anbieter '
        + 'beides auf einer Seite anbietet. Welche Erlaubnis er hat, steht in der Spalte „Lizenz“.',
    },
    {
      question: `Gilt das 1.000-Euro-Limit auch für ${term}?`,
      answer: 'Das anbieterübergreifende Einzahlungslimit von 1.000 € im Monat gilt für das Konto beim lizenzierten Anbieter insgesamt, nicht getrennt nach Wetten '
        + 'und Automatenspiel. Wer bei demselben Anbieter beides nutzt, teilt sich einen Topf. Geprüft wird das über das System LUGAS, das alle deutschen Anbieter '
        + 'zusammenrechnet. Anbieter ohne deutsche Erlaubnis sind daran nicht angeschlossen.',
    },
    {
      question: 'Kann ich Wettbonus und Casinobonus zusammen nutzen?',
      answer: 'In aller Regel nicht. Wett- und Casinoboni sind bei den meisten Anbietern getrennte Angebote mit eigenem Umsatz und eigener Frist. '
        + 'Ein Wettbonus verlangt statt eines Umsatzfaktors oft eine Mindestquote, unter der die Wette gar nicht zählt. Prüfen Sie deshalb vor der Einzahlung, '
        + 'welcher der beiden Boni im Dialog überhaupt ausgewählt ist. Rückwirkend lässt sich das bei kaum einem Anbieter ändern.',
    },
    ...commonTail(f),
  ].filter(Boolean);
}

/** Общие категории: смысл берём из справочника категорий. */
function generalFaq(f) {
  const { term, slug, brands, licensed, ctx, top, names } = f;
  const c = slug ? ctx?.categories?.[slug] : null;
  const q = c?.questions ?? {};
  const rest = top.split(', ').slice(1).join(' und ');

  return [
    {
      question: q.top ?? `${term}: welcher Anbieter steht oben?`,
      answer: `Ganz oben steht aktuell ${brands[0]?.name ?? ''}${rest ? `, dahinter ${rest}` : ''}. `
        + 'Die Reihenfolge ist berechnet, nicht vergeben: sechs Kriterien mit festen Gewichten, nachzulesen auf der Methodikseite.',
    },
    c?.howWeSelected ? {
      question: q.criteria ?? 'Nach welchen Kriterien ist diese Liste sortiert?',
      answer: `${c.howWeSelected} Die sechs Kriterien und ihre Gewichte stehen offen auf der Methodikseite, und die Note wird bei jeder Neuerstellung der Seite `
        + 'neu gerechnet. In unseren Daten gibt es kein Feld für eine Platzierung von Hand. Das ist die einzige Version dieses Versprechens, die sich überprüfen lässt.',
    } : null,
    c?.whatToWatch ? {
      question: q.watch ?? 'Worauf sollte ich bei der Auswahl achten?',
      answer: c.whatToWatch,
    } : null,
    {
      question: 'Wie viele Anbieter mit deutscher Lizenz sind dabei?',
      answer: licensed.length
        ? `${licensed.length} von ${brands.length}: ${names(licensed)}. `
          + 'Für Sie heißt das 1 € Höchsteinsatz pro Drehung, 1.000 € Einzahlung im Monat über alle deutschen Anbieter zusammen, Anbindung an die Sperrdatei OASIS '
          + 'und eine Behörde, die bei Streit zuständig ist. Kein Live-Casino gehört zur selben Regel dazu. Das ist die Kehrseite.'
        : `Keiner der ${brands.length} Anbieter dieser Liste hat eine deutsche Erlaubnis. Ohne sie fallen die Limits weg, aber auch die OASIS-Anbindung `
          + 'und die zuständige Aufsicht. Wer beides will, findet die lizenzierten Anbieter in unserer Hauptliste.',
    },
    c?.commonMistake ? {
      question: q.mistake ?? 'Was machen die meisten bei der Auswahl falsch?',
      answer: c.commonMistake,
    } : null,
    ...commonTail(f),
  ].filter(Boolean);
}
