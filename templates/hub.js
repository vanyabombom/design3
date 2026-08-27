/**
 * Хаб раздела — точка входа в таксономию.
 *
 * Раньше здесь лежала сетка карточек со ссылками на листинги и отдельным
 * блоком «Категории без своей страницы» — пятнадцать серых плашек без чисел
 * и без ссылок. С приёмки пришло замечание, что хаб при этом ничего не
 * сравнивает: он перечисляет, куда пойти дальше, и на этом заканчивается.
 *
 * Теперь обе части — одна таблица. Строка это категория, ссылка стоит там,
 * где страница есть, и рядом с каждой категорией стоят её числа. Тонкие
 * термы попадают в ту же таблицу с пометкой: чисел они не лишены, лишены
 * они только собственного адреса.
 *
 * Колонки у семи разделов разные. Общий набор («сколько анбитеров, сколько
 * с лицензией») превратил бы разделы в семь копий одной таблицы, а вопрос
 * у человека на /zahlungen/ и на /quoten/ разный: там про сроки и минимум,
 * здесь про лайв и кэшаут. Наборы описаны в specFor().
 */

import { document_, pageHead, faqBlock, factsTable, brandLogoLink, esc, get } from './_lib/layout.js';
import { pageH1, properLabel, resolveAuthor, formatScore, scoreBand } from '../lib/labels.js';

export function render(ctx, page) {
  const { locale } = ctx;
  const { terms, thinTerms, taxonomyId } = page.data;
  const h1 = pageH1(page, ctx);
  const author = resolveAuthor(page, ctx);
  const all = [...new Map(terms.flatMap((t) => t.brands).map((b) => [b.slug, b])).values()];
  const licensed = all.filter(isLicensed);
  const label = locale.taxonomyLabels[taxonomyId] ?? '';
  const ht = locale.hubTable;

  // Раздел лицензий считает не по своим спискам, а по всему составу сайта.
  // Его четыре списка — это площадки без немецкой лицензии, и фраза «0 mit
  // deutscher GGL-Lizenz» стояла прямо над таблицей, где у GGL написано 10.
  const everyone = ctx.brands.filter((b) => b.status === 'active');
  const everyoneLicensed = everyone.filter(isLicensed);

  const answer = page.key === 'licenses'
    ? `${everyone.length} geprüfte Anbieter verteilen sich auf vier Aufsichtsbehörden: `
      + `${everyoneLicensed.length} mit deutscher GGL-Lizenz, ${everyone.length - everyoneLicensed.length} ohne. `
      + `Unten stehen die ${terms.length} Listen zu den Anbietern ohne deutsche Lizenz, mit Logo und Note zu jedem einzelnen.`
    : terms.length
    ? `${terms.length} Listen nach ${label}, zusammen ${all.length} Anbieter, `
      + `${licensed.length} mit deutscher GGL-Lizenz, ${all.length - licensed.length} ohne. `
      + `Jede Liste ist nach unserer Formel aus sechs Kriterien sortiert, nicht nach Bonushöhe.`
    : `Hier gibt es noch keine Listen. Eine Kategorie bekommt erst dann eine eigene Seite, wenn `
      + `mindestens ${ctx.taxonomies.thresholds.minBrandsForOwnUrl} Anbieter mit von uns geprüften Daten hineinfallen. `
      + `Eine Liste aus unbestätigten Angaben wäre schlechter als keine.`;

  const faq = faqBlock(buildFaq({ terms, all, licensed, hubKey: page.key, ctx }), ctx);
  const table = hubTable({ ctx, hubKey: page.key, terms, thinTerms, all });

  const main = `
${pageHead(ctx, { h1, answer, brands: all, author })}

${table ? `<section class="section">
<h2>${esc(ht.heading[page.key] ?? '')}</h2>
<p>${esc(ht.intro[page.key] ?? '')}</p>
${table.html}
${table.thin ? `<p class="facts-foot">${esc(fillMin(ht.thinNote, ctx))}</p>` : ''}
</section>` : ''}

${page.key === 'licenses' && terms.length ? `<section class="section">
<h2>${esc(locale.ui.moreLists ?? 'Listen in diesem Bereich')}</h2>
<ul class="grid">
${terms.map((term) => {
    const lic = term.brands.filter(isLicensed).length;
    // Состав списка прямо в карточке. Четыре карточки, отличавшиеся только
    // заголовком и повторявшие «8 Anbieter · keiner mit deutscher Lizenz»,
    // не отвечали на вопрос «а какие именно» — за ним нужно было открыть
    // каждую из четырёх и сравнить в голове.
    //
    // Имя строки — логотип, не текст (с приёмки). aria-label остаётся на
    // самой ссылке через brandLogoLink, поэтому у строки без картинки файла
    // не пропадает доступное имя: заменяет его монограмма с тем же атрибутом.
    const ranked = [...term.brands].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
    return `<li class="card">
<h3><a href="${esc(term.url)}">${esc(properLabel(term.slug, locale))}</a></h3>
<p><small>${term.brands.length} Anbieter${lic ? ` · ${lic} mit GGL-Lizenz` : ' · keiner mit deutscher Lizenz'}</small></p>
${ranked.length ? `<ol class="card__list">
${ranked.map((b) => `<li>${brandLogoLink(b, ctx, { size: 24 })}<small>${esc(formatScore(b.score?.total, ctx))}</small></li>`).join('\n')}
</ol>` : ''}
</li>`;
  }).join('\n')}
</ul>
</section>` : ''}

${hubSections(ctx, page.key)}

${faq.html}
`;

  return document_(ctx, page, { main, jsonLd: [faq.node], h1 });
}


/**
 * Текстовые разделы хаба.
 *
 * Пишутся руками по каждому разделу и лежат в локали: у семи хабов нет
 * ничего общего, кроме структуры, и общий текст на всех семи требования
 * к контенту запрещают прямым текстом. Числа сюда не зашиваются — всё,
 * что считается, стоит в таблице выше.
 */
function hubSections(ctx, hubKey) {
  const content = ctx.locale.hubContent?.[hubKey];
  const sections = content?.sections ?? [];
  if (!sections.length) return '';

  const paragraphs = (body) => body.map((text) => `<p>${esc(text)}</p>`).join('\n');

  const text = sections.map((section) => `<section class="section">
<h2>${esc(section.heading)}</h2>
${paragraphs(section.body)}
</section>`).join('\n');

  return text + (content.fit ? fitBlock(content.fit) : '');
}

/**
 * «Кому подходит и кому нет» для раздела.
 *
 * Требование к контенту просит на странице содержательные блоки помимо
 * текста, и у хабов их было два: таблица и FAQ. Разбивка на две колонки
 * отвечает на вопрос, которого нет ни в таблице, ни в тексте, — стоит ли
 * вообще начинать с этого раздела.
 */
function fitBlock(fit) {
  const list = (items) => items.map((item) => `<li>${esc(item)}</li>`).join('');

  return `
<section class="section">
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

const isLicensed = (brand) => Boolean(get(brand, 'license.localLicensed'));
const fillMin = (text, ctx) => String(text ?? '').replace('{min}', ctx.taxonomies.thresholds.minBrandsForOwnUrl ?? 5);

/* --------------------------------------------------------------- агрегаты */

const nums = (brands, path) => brands.map((b) => get(b, path)).filter((v) => typeof v === 'number');
const minOf = (brands, path) => { const v = nums(brands, path); return v.length ? Math.min(...v) : null; };
const maxOf = (brands, path) => { const v = nums(brands, path); return v.length ? Math.max(...v) : null; };
const countOf = (brands, test) => brands.filter(test).length;
const hasIn = (path, value) => (brand) => (get(brand, path) ?? []).includes(value);

/**
 * Медиана, а не среднее: одна площадка с недельной выплатой сдвигает среднее
 * и перестаёт говорить о типичном сроке.
 */
function medianOf(brands, path) {
  const v = nums(brands, path).sort((a, b) => a - b);
  if (!v.length) return null;
  const middle = v.length >> 1;
  return v.length % 2 ? v[middle] : Math.round((v[middle - 1] + v[middle]) / 2);
}

/** Имена площадок в порядке нашей оценки: лучшие первыми. */
function brandNames(brands) {
  return [...brands]
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
    .map((b) => b.name)
    .join(', ');
}

function latestOf(brands, path) {
  const v = brands.map((b) => get(b, path)).filter(Boolean).sort();
  return v.length ? v[v.length - 1] : null;
}

/* ---------------------------------------------------------------- колонки */

/**
 * Наборы колонок по разделам.
 *
 * Правило отбора одно: колонка остаётся, если её значения по строкам
 * расходятся. Колонка, где на всех строках стоит одно и то же, занимает
 * ширину и не отвечает ни на один вопрос. Осознанное исключение одно —
 * «mit GGL-Lizenz» в разделе живых игр: там ноль в каждой строке и есть
 * ответ, потому что немецкая лицензия живые столы не покрывает.
 */
function specFor(hubKey, ctx) {
  const c = ctx.locale.hubTable.col;
  const u = ctx.locale.units;
  const na = `<span class="score--na">${esc(ctx.locale.table.notChecked)}</span>`;

  const value = (n, html) => (n == null ? { value: null, html: na } : { value: n, html });
  const count = (col, label, fn) => ({
    col,
    label,
    dir: 'desc',
    cell: (bs) => { const n = fn(bs); return { value: n, html: String(n) }; },
  });
  const unitCol = (col, label, fn, unit, dir) => ({
    col,
    label,
    dir,
    cell: (bs) => { const n = fn(bs); return value(n, `${n} ${esc(unit)}`); },
  });
  // Медиана, а не лучшая оценка. Лучшая на любом сколько-нибудь длинном
  // списке — это одно и то же казино с вершины общего рейтинга: в разделе
  // ставок 8,0 стояли подряд во всех девяти строках. Медиана отвечает на
  // тот вопрос, ради которого в колонку смотрят, — «а вообще какие тут
  // площадки».
  const scoreCol = () => ({
    col: 'score-median',
    label: c.scoreMedian,
    dir: 'desc',
    cell: (bs) => {
      const v = nums(bs, 'score.total').sort((a, b) => a - b);
      if (!v.length) return value(null, '');
      const middle = v.length >> 1;
      const n = v.length % 2 ? v[middle] : (v[middle - 1] + v[middle]) / 2;
      return {
        value: n,
        className: `num score ${scoreBand(n)}`,
        html: `<b>${esc(formatScore(n, ctx))}</b><i style="--pct:${Math.round((n / (ctx.criteria.scale ?? 10)) * 100)}%"></i>`,
      };
    },
  });
  const licensedCol = () => count('licensed', c.licensed, (bs) => countOf(bs, isLicensed));

  // Колонка с числом анбитеров называет их поимённо.
  //
  // Замечание с приёмки: «чтобы юзеру не надо было лишний раз жать, а всё
  // было видно сразу». До этого строка сообщала «8» и отправляла за именами
  // в листинг — то есть за ответом на первый же вопрос, который возникает
  // при взгляде на таблицу. Имена идут в порядке нашей оценки, лучшие
  // первыми, поэтому список читается и без клика.
  const brandsCol = (label) => ({
    col: 'brands',
    label,
    dir: 'desc',
    cell: (bs) => ({
      value: bs.length,
      className: 'num facts-who',
      html: `${bs.length}${bs.length ? `<small>${esc(brandNames(bs))}</small>` : ''}`,
    }),
  });
  const payoutMedianCol = () => unitCol('payout-median', c.payoutMedian, (bs) => medianOf(bs, 'payout.effectiveHours'), u.hours, 'asc');
  const liveCol = () => count('live-tables', c.liveTables, (bs) => countOf(bs, (b) => (get(b, 'live') ?? []).length > 0));

  const specs = {
    payments: {
      headCol: 'payment',
      headLabel: c.payment,
      minWidth: '52rem',
      columns: [
        brandsCol(c.brands),
        licensedCol(),
        unitCol('min-deposit', c.minDepositFrom, (bs) => minOf(bs, 'bonus.minDeposit'), u.currency, 'asc'),
        payoutMedianCol(),
        unitCol('payout-fast', c.payoutFastest, (bs) => minOf(bs, 'payout.effectiveHours'), u.hours, 'asc'),
      ],
    },
    bonuses: {
      headCol: 'bonus-type',
      headLabel: c.bonusType,
      minWidth: '52rem',
      // Медиана суммы, а не только максимум. Максимум по бонусам на любом
      // длинном списке — это одно и то же предложение на 4 000 €, и в
      // «Willkommensbonus» и во «Freispiele» стояло одинаковое число, хотя
      // площадки разные. Медиана эти две строки разводит: 150 € против 500 €.
      columns: [
        brandsCol(c.brands),
        licensedCol(),
        unitCol('bonus-median', c.bonusMedian, (bs) => medianOf(bs, 'bonus.amount'), u.currency, 'desc'),
        unitCol('bonus-max', c.bonusMax, (bs) => maxOf(bs, 'bonus.amount'), u.currency, 'desc'),
        unitCol('wagering-median', c.wageringMedian, (bs) => medianOf(bs, 'bonus.wagering'), u.times, 'asc'),
        unitCol('expiry', c.expiryShortest, (bs) => minOf(bs, 'bonus.expiryDays'), u.days, 'asc'),
      ],
    },
    current: {
      headCol: 'list',
      headLabel: c.list,
      minWidth: '50rem',
      columns: [
        brandsCol(c.brands),
        licensedCol(),
        scoreCol(),
        payoutMedianCol(),
        {
          col: 'checked',
          label: c.checkedLast,
          sort: 'date',
          dir: 'desc',
          cell: (bs) => {
            const d = latestOf(bs, 'updatedAt');
            return d ? { value: d, html: `<time datetime="${esc(d)}">${esc(d)}</time>` } : { value: null, html: na };
          },
        },
      ],
    },
    // licenses: своей строки в specFor() больше нет. Таблица «GGL, Anjouan,
    // Curaçao, Tobique» ушла с приёмки — карточки под ней уже показывают
    // ровно тот же состав, только поимённо и с логотипом, а не агрегатом
    // по четырём надзорам. specFor('licenses', ...) теперь вернёт undefined,
    // и hubTable() сама отдаст null: ветку show-if-table в render() трогать
    // не пришлось.
    providers: {
      headCol: 'provider',
      headLabel: c.provider,
      minWidth: '52rem',
      columns: [
        brandsCol(c.casinos),
        licensedCol(),
        liveCol(),
        {
          col: 'games-max',
          label: c.gamesMax,
          dir: 'desc',
          cell: (bs) => {
            const n = maxOf(bs, 'games.total');
            return value(n, n == null ? '' : esc(n.toLocaleString(ctx.locale.code ?? 'de')));
          },
        },
        scoreCol(),
      ],
    },
    live: {
      headCol: 'live-game',
      headLabel: c.liveGame,
      minWidth: '50rem',
      // «Mit eigener App» здесь стояло нулём во всех строках: живые столы
      // предлагают только площадки без немецкой лицензии, а приложений у них
      // нет ни у одной. Вместо неё — сколько живых столов в среднем держит
      // казино из этой строки: восемь у одних, два у других.
      columns: [
        brandsCol(c.casinos),
        licensedCol(),
        count('tables-per-casino', c.tablesPerCasino, (bs) => medianOf(bs, 'live.length') ?? 0),
        payoutMedianCol(),
        scoreCol(),
      ],
    },
    odds: {
      headCol: 'market',
      headLabel: c.market,
      minWidth: '50rem',
      columns: [
        brandsCol(c.brands),
        licensedCol(),
        count('in-play', c.inPlay, (bs) => countOf(bs, hasIn('betting', 'in-play'))),
        count('own-app', c.ownApp, (bs) => countOf(bs, (b) => get(b, 'mobile.app') === true)),
        scoreCol(),
      ],
    },
  };

  return specs[hubKey] ?? null;
}

/* ----------------------------------------------------------------- строки */

/**
 * Сборка таблицы раздела.
 *
 * Порядок строк: сначала категории со своей страницей, потом остальные,
 * внутри каждой группы по числу анбитеров. Так первыми идут те, по которым
 * есть куда перейти, а сортировку по любой колонке человек включает сам.
 *
 * У лицензий своей записи в specFor() больше нет — эта таблица сравнивала
 * четыре надзора агрегатом («GGL: 10, Anjouan: 4, ...»), а с приёмки
 * попросили состав поимённо. Он и так был ниже, карточками, — именно они
 * теперь единственное представление раздела.
 */
function hubTable({ ctx, hubKey, terms, thinTerms, all }) {
  const spec = specFor(hubKey, ctx);
  if (!spec) return null;

  const rows = termRows(terms, thinTerms, ctx);
  if (!rows.length) return null;

  const columns = spec.columns.map(({ col, label, sort, dir }) => ({ col, label, sort: sort ?? 'number', dir }));
  const built = rows.map((row) => ({
    ...row,
    cells: spec.columns.map((column) => column.cell(row.brands)),
  }));

  return {
    html: factsTable(ctx, {
      id: `hub-${hubKey}`,
      headCol: spec.headCol,
      headLabel: spec.headLabel,
      minWidth: spec.minWidth,
      columns,
      rows: built,
    }),
    thin: rows.some((row) => !row.linked && hubKey !== 'licenses'),
  };
}

function termRows(terms, thinTerms, ctx) {
  const { locale } = ctx;
  const byBrands = (a, b) => b.brands.length - a.brands.length;

  const linked = [...terms].sort(byBrands).map((term) => ({
    value: properLabel(term.slug, locale),
    html: `<a href="${esc(term.url)}">${esc(properLabel(term.slug, locale))}</a>`,
    brands: term.brands,
    linked: true,
  }));

  // Тонкие термы без единого анбитера в таблицу не идут: строка из нулей
  // ничего не сообщает, а таких категорий в платежах больше половины списка.
  //
  // Остальные ведут в общий каталог с готовым фильтром. С приёмки: «не все
  // операторы перекидывают на таблицы с казино». Своей страницы у них нет и
  // не будет — порог в пять анбитеров стоит не зря, — но ответ на вопрос
  // «какие казино держат Hacksaw Gaming» человек должен получать одним
  // нажатием, а не переписыванием восьми имён из ячейки в фильтр.
  const catalogue = ctx.graph?.pages?.find((page) => page.type === 'brand-index')?.url;

  const plain = thinTerms
    .filter((term) => term.brands.length)
    .sort(byBrands)
    .map((term) => {
      const label = properLabel(term.slug, locale);
      return {
        value: label,
        html: catalogue
          ? `<a href="${esc(catalogue)}?term=${encodeURIComponent(term.slug)}">${esc(label)}</a>`
          : esc(label),
        note: locale.hubTable.noPage,
        brands: term.brands,
      };
    });

  return foldIdentical([...linked, ...plain], ctx);
}

/**
 * Схлопывание строк с одинаковым составом.
 *
 * В таксономии есть термы, которые ловят один и тот же набор площадок:
 * «Bonus Code», «New Codes», «Bonus Funds» и «Bonus Offer» — это все
 * восемнадцать анбитеров, а Mastercard принимают ровно те же, что и Visa.
 * Каждая такая пара давала строку с теми же шестью числами, и таблица из
 * тринадцати строк, где семь совпадают до цифры, читается как ошибка
 * расчёта.
 *
 * Строки склеиваются, а не выбрасываются: название категории само по себе
 * информация («Mastercard берут все, кто берёт Visa»), и подпись под именем
 * строки её сохраняет.
 *
 * Схлопываются только строки без своей страницы. Две категории с одинаковым
 * составом, но с двумя адресами, остаются двумя строками: склеить их значило
 * бы убрать из таблицы ссылку на живой листинг, а вход на него с хаба
 * единственный.
 */
function foldIdentical(rows, ctx) {
  const t = ctx.locale.hubTable;
  const keyOf = (row) => row.brands.map((b) => b.slug).sort().join('|');
  const byKey = new Map();
  const out = [];

  for (const row of rows) {
    const key = keyOf(row);
    const target = byKey.get(key);

    if (target && !row.linked) {
      target.folded.push(row.value);
      continue;
    }

    const entry = { ...row, folded: [] };
    out.push(entry);
    if (!target) byKey.set(key, entry);
  }

  // Две категории со своими страницами и одинаковым составом остаются двумя
  // строками, и числа в них совпадают до цифры: «Sportwetten», «Fußballwetten»
  // и «Live-Wetten» — это одни и те же восемь площадок. Без подписи три
  // одинаковые строки подряд читаются как сбой расчёта, поэтому строка сама
  // говорит, с кем она совпадает.
  const twins = new Map();
  for (const row of out) {
    const key = keyOf(row);
    if (!twins.has(key)) twins.set(key, []);
    twins.get(key).push(row.value);
  }

  return out.map((row) => {
    const notes = [];
    if (row.note) notes.push(row.note);

    const siblings = (twins.get(keyOf(row)) ?? []).filter((name) => name !== row.value);
    if (siblings.length) notes.push(String(t.sameSelection).replace('{list}', siblings.join(', ')));
    if (row.folded.length) notes.push(String(t.alsoCovers).replace('{list}', row.folded.join(', ')));

    return notes.length ? { ...row, note: notes.join(' · ') } : row;
  });
}

/**
 * FAQ раздела.
 *
 * Вопросы приходят из локали и написаны руками по каждому разделу: у семи
 * хабов нет ничего общего кроме структуры, и один набор на всех читался как
 * шаблон — плюс он был обращён на нас самих («как у вас устроены категории»),
 * а не на то, зачем человек пришёл.
 *
 * Один вопрос остаётся расчётным: он про состав именно этого раздела и потому
 * на каждом хабе даёт свои цифры. Больше расчётных не нужно — устройство
 * каталога объясняется на странице методики, а не в каждом разделе заново.
 */
function buildFaq({ terms, all, licensed, hubKey, ctx }) {
  const written = ctx.locale.hubFaq?.[hubKey] ?? [];
  const offshore = all.length - licensed.length;
  const biggest = [...terms].sort((a, b) => b.brands.length - a.brands.length)[0];

  const computed = all.length ? {
    question: 'Wie viele Anbieter stehen in diesem Bereich?',
    answer: `${all.length} Anbieter über ${terms.length} Listen, ${licensed.length} mit deutscher Lizenz, ${offshore} ohne. `
      + (biggest ? `Die längste Liste ist ${properLabel(biggest.slug, ctx.locale)} mit ${biggest.brands.length} Anbietern. ` : '')
      + 'Ein Anbieter erscheint in mehreren Listen, wenn er die jeweiligen Kriterien erfüllt. Wer PayPal und Skrill annimmt, steht in beiden. '
      + 'Das ist kein Doppeleintrag, sondern dieselbe Karteikarte aus einem anderen Blickwinkel.',
  } : {
    question: 'Warum steht hier noch keine Liste?',
    answer: `Weil keine Kategorie die Mindestzahl von ${ctx.taxonomies.thresholds.minBrandsForOwnUrl} Anbietern mit geprüften Daten erreicht. `
      + 'Eine Seite mit zwei Optionen hilft beim Vergleichen nicht, deshalb erscheinen solche Kategorien als Abschnitt statt als eigener Adresse. '
      + 'Wir veröffentlichen eine Liste, wenn die Fakten dahinter an der Quelle bestätigt sind, nicht vorher.',
  };

  return [...written, computed];
}
