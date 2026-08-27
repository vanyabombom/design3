/**
 * Подписи, заголовки и метатеги.
 *
 * Всё, что видит пользователь как текст, собирается здесь из шаблонов локали.
 * Ни один шаблон страницы не склеивает заголовки сам — иначе при смене ГЕО
 * пришлось бы искать конкатенации строк по всем шаблонам, а не править
 * один locale-файл.
 */

import { get } from './util.js';

/**
 * Слаг в человеческую подпись: 'playn-go' -> "Play'n GO", 'ukgc' -> 'UKGC'.
 * Без словаря properNouns получилось бы 'Playn Go' и 'Ukgc' — и это попало бы
 * в H1 двух десятков страниц разом.
 */
export function properLabel(slug, locale) {
  const dictionary = locale.properNouns ?? {};
  if (dictionary[slug]) return dictionary[slug];

  // Слаги листингов почти всегда оканчиваются на -casino: в подписи это лишнее,
  // потому что шаблон заголовка добавляет слово Casinos сам.
  const stripped = slug.replace(/-casino$/, '');
  if (dictionary[stripped]) return dictionary[stripped];

  return stripped
    .split('-')
    .map((word) => (dictionary[word] ?? word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Подставляет {плейсхолдеры} из набора значений. */
function fill(template, values) {
  if (!template) return '';
  return template
    .replace(/\{(\w+)\}/g, (_, key) => (values[key] != null ? String(values[key]) : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Подгонка длины title и description под норму листа 05.
 *
 * Уложить заголовок в 60–65 знаков одним шаблоном нельзя: длина термина
 * гуляет вдвое — «SEPA» против «Willkommensbonus», — и один и тот же шаблон
 * даёт то 50 знаков, то 71. Прописывать точный текст руками для каждого URL
 * на двухстах страницах не выйдет.
 *
 * Поэтому в шаблон вставляются группы взаимоисключающих окончаний:
 *
 *   "{term} Casino {geo} {year} – {count} Anbieter[[ im Test| im Vergleich| geprüft]]"
 *
 * Из группы берётся ровно одно окончание или ни одного, и выбирается то, с
 * которым строка ближе всего к максимуму, не переходя его.
 *
 * Именно взаимоисключающие, а не складывающиеся. Складывать нельзя: первая
 * версия этого механизма приклеивала хвосты друг к другу и выдавала
 * «18 Anbieter und Vergleich» и «im Test geprüft» — по длине норма,
 * по-немецки мусор. Каждый вариант написан как законченная фраза и потому
 * читается сам по себе.
 */
function fitTemplate(template, values, { min, max }) {
  if (!template) return '';

  const groups = [];
  const base = template.replace(/\[\[([^\]]*)\]\]/g, (_, body) => {
    groups.push(['', ...body.split('|')]);
    return '\u0000';
  });

  const substitute = (text) => text.replace(/\{(\w+)\}/g, (_, key) => (values[key] != null ? String(values[key]) : ''));
  const clean = (text) => text.replace(/\s{2,}/g, ' ').trim();

  if (!groups.length) return clean(substitute(base));

  const options = groups.map((group) => group.map(substitute));
  let best = null;

  const walk = (index, parts) => {
    if (index === options.length) {
      let out = clean(substitute(base).split('\u0000').reduce((acc, chunk, i) => acc + chunk + (parts[i] ?? ''), ''));
      if (out.length > max) return;
      if (!best || out.length > best.length) best = out;
      return;
    }
    for (const option of options[index]) walk(index + 1, [...parts, option]);
  };
  walk(0, []);

  // Ни один вариант не влез в максимум — отдаём голую основу: слишком
  // длинный заголовок обрежут в выдаче, а бессмысленный останется навсегда.
  return best ?? clean(substitute(base).split('\u0000').join(''));
}

/** Выбирает шаблон: сначала по таксономии, затем default. */
function pickTemplate(group, page) {
  if (typeof group === 'string') return group;
  if (!group) return null;
  const taxonomyId = page.data?.taxonomyId;
  return group[taxonomyId] ?? group.default ?? null;
}

/**
 * Сводка по набору брендов: то, из чего собираются заголовки и описания.
 *
 * Бренды с незаполненными полями исключаются из соответствующих рейтингов, а не
 * получают null и не уезжают в начало сортировки. Иначе «самым быстрым» окажется
 * тот, про кого мы просто ничего не знаем.
 */
function summarise(brands, locale) {
  const active = brands.filter((b) => b.status === 'active');
  if (!active.length) return {};

  const withPayout = active.filter((b) => get(b, 'payout.effectiveHours') != null);
  const withWagering = active.filter((b) => get(b, 'bonus.wagering') != null);

  const byPayout = [...withPayout].sort((a, b) => get(a, 'payout.effectiveHours') - get(b, 'payout.effectiveHours'));
  const byWagering = [...withWagering].sort((a, b) => get(a, 'bonus.wagering') - get(b, 'bonus.wagering'));

  const withdrawals = active.reduce((sum, b) => sum + (get(b, 'payout.samples') ?? 0), 0);

  return {
    count: active.length,
    withdrawals,
    // Флаг для выбора шаблона описания: пока замеров нет, нельзя писать
    // «столько-то выплат измерено» — это будет неправдой.
    measured: withdrawals > 0,
    licensedCount: active.filter((b) => get(b, 'license.localLicensed')).length,
    offshoreCount: active.filter((b) => !get(b, 'license.localLicensed')).length,
    fastest: byPayout[0]?.name ?? '',
    fastestHours: byPayout[0] ? get(byPayout[0], 'payout.effectiveHours') : '',
    slowest: byPayout[byPayout.length - 1]?.name ?? '',
    slowestHours: byPayout.length ? get(byPayout[byPayout.length - 1], 'payout.effectiveHours') : '',
    softest: byWagering[0]?.name ?? '',
    softestWagering: byWagering[0] ? get(byWagering[0], 'bonus.wagering') : '',
    checkedAt: latestCheckedAt(active) ?? '',
    unitHours: locale.units?.hours ?? '',
  };
}

/** Значения плейсхолдеров для конкретной страницы. */
export function templateValues(page, ctx) {
  const { site, locale } = ctx;
  const base = {
    year: site.year,
    geo: locale.geoName ?? '',
    site: locale.site?.name ?? '',
    tagline: locale.site?.tagline ?? '',
    unitHours: locale.units?.hours ?? '',
    count: '',
    term: '',
    brand: '',
    hubLabel: '',
    pageLabel: '',
    taxonomyLabel: '',
    checkedAt: '',
  };

  switch (page.type) {
    case 'home':
      return { ...base, ...summarise(ctx.brands, locale) };

    case 'hub': {
      const brands = [...new Map(page.data.terms.flatMap((t) => t.brands).map((b) => [b.slug, b])).values()];
      return {
        ...base,
        ...summarise(brands, locale),
        hubLabel: locale.hubLabels?.[page.key] ?? properLabel(page.key, locale),
        taxonomyLabel: locale.taxonomyLabels?.[page.data.taxonomyId] ?? '',
        // На хабе две разные величины, и путать их нельзя: в заголовке
        // стояло «{count} Anbieter», а подставлялось число списков —
        // «Casinos nach Zahlungsmethode – 5 Anbieter» при восемнадцати.
        count: page.data.terms.length,
        listCount: page.data.terms.length,
        brandCount: brands.length,
      };
    }

    case 'listing':
      return {
        ...base,
        ...summarise(page.data.brands, locale),
        term: properLabel(page.data.slug, locale),
        taxonomyLabel: locale.taxonomyLabels?.[page.data.taxonomyId] ?? '',
      };

    case 'brand': {
      const brand = page.data.brand;
      return {
        ...base,
        brand: brand.name,
        // Через ту же функцию, что и на странице: в описании и в тексте
        // должно стоять одно и то же число в одном и том же виде.
        score: formatScore(brand.score?.total, ctx),
        scale: brand.score?.scale,
        authority: get(brand, 'license.authority') ?? '',
        medianHours: get(brand, 'payout.effectiveHours'),
        samples: get(brand, 'payout.samples'),
        wagering: get(brand, 'bonus.wagering'),
        checkedAt: get(brand, 'payout.checkedAt') ?? '',
      };
    }

    case 'brand-index':
      return { ...base, ...summarise(page.data.brands, locale), count: page.data.brands.length };

    case 'compare':
      return { ...base, ...summarise(page.data.brands, locale) };

    default:
      return { ...base, pageLabel: locale.pageLabels?.[page.key] ?? properLabel(page.key, locale) };
  }
}

function latestCheckedAt(brands) {
  const dates = brands
    .flatMap((b) => [get(b, 'bonus.checkedAt'), get(b, 'payout.checkedAt')])
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * Заголовки и описания собираются в три приёма: сначала точное значение,
 * заданное для этого URL на этапе контента, затем шаблон таксономии, затем
 * общий запасной шаблон.
 *
 * Точные значения нужны потому, что уложить title в 60–65 знаков шаблоном
 * невозможно: длина названия метода или бренда гуляет вдвое. Шаблон даёт
 * рабочий вариант с правильными цифрами, а на этапе контента он заменяется
 * формулировкой под конкретную страницу — но заменяется в locale, не в коде.
 */
export function pageTitle(page, ctx) {
  const { locale } = ctx;
  const override = locale.termTitles?.[page.url];
  if (override) return override;

  const values = templateValues(page, ctx);
  const template = pickTemplate(locale.titleTemplates?.[page.type], page)
    ?? locale.titleTemplates?.static;
  const seo = ctx.site?.seo ?? {};
  return fitTemplate(template, values, {
    min: seo.titleMinChars ?? 60,
    max: seo.titleMaxChars ?? 65,
  });
}

export function pageH1(page, ctx) {
  const { locale } = ctx;
  const override = locale.termH1?.[page.url];
  if (override) return override;

  const values = templateValues(page, ctx);
  const template = pickTemplate(locale.h1Templates?.[page.type], page)
    ?? locale.h1Templates?.static;
  return fill(template, values);
}

/** Подпись для хлебной крошки и для пунктов навигации. */
export function crumbLabel(crumb, ctx) {
  const { locale } = ctx;

  if (crumb.type === 'home') return locale.pageLabels?.home ?? 'Home';
  if (crumb.type === 'hub') return locale.hubLabels?.[crumb.key] ?? properLabel(crumb.key, locale);
  if (crumb.type === 'listing') return properLabel(crumb.key.split('/').pop(), locale);
  if (crumb.type === 'brand') {
    const brand = ctx.brands.find((b) => b.slug === crumb.key);
    return brand?.name ?? properLabel(crumb.key, locale);
  }
  return locale.pageLabels?.[crumb.key] ?? properLabel(crumb.key, locale);
}

/**
 * Meta description. Лист 08: «с ответом, а не с приглашением» — поэтому
 * шаблоны в locale построены вокруг конкретных цифр страницы, а не вокруг
 * приглашения перейти.
 */
export function pageDescription(page, ctx) {
  const { locale } = ctx;
  const override = locale.termDescriptions?.[page.url];
  if (override) return override;

  const values = templateValues(page, ctx);
  const templates = locale.descriptionTemplates ?? {};

  // Пока собственных замеров нет, берётся вариант шаблона без ссылок на них.
  // Иначе в description попадает «0 Auszahlungen gemessen» и пустая медиана —
  // то есть прямая неправда в самом заметном месте выдачи.
  const unmeasured = values.measured === false || values.samples === 0;
  const template = (unmeasured ? templates[`${page.type}Unmeasured`] : null)
    ?? templates[page.type]
    ?? templates.static;

  const seo = ctx.site?.seo ?? {};
  return fitTemplate(template, values, {
    min: seo.descriptionMinChars ?? 140,
    max: seo.descriptionMaxChars ?? 158,
  });
}

/**
 * Автор страницы. Лист 09 проверяет его отдельной строкой.
 *
 * Раньше здесь стоял authors.authors[0], и все шестьдесят страниц подписывал
 * один и тот же человек — при трёх людях в редакции и странице «кто здесь
 * пишет», где у каждого своя специализация. С приёмки это пришло замечанием.
 *
 * Разбор идёт от частного к общему: чем страница конкретнее, тем точнее её
 * владелец. Раздел («casino-payment») сильнее ключа страницы, ключ сильнее
 * типа, а если не подошло ничего — первый в списке, чтобы страница не
 * осталась без подписи вообще.
 *
 * Само распределение живёт в data/authors.json, полем owns. Здесь ему не
 * место: кто за что отвечает — это решение редакции, а не логика сборки, и
 * меняться оно будет чаще, чем этот файл.
 */
export function resolveAuthor(page, ctx) {
  const { authors, locale } = ctx;
  const list = authors.authors ?? [];
  const owner = (target) => (target ? list.find((a) => (a.owns ?? []).includes(target)) : null);

  const taxonomyId = page.data?.taxonomyId
    ?? (page.type === 'listing' ? String(page.key).split('/')[0] : null);

  const author = (page.type === 'brand' ? list.find((a) => a.slug === page.data.brand.author) : null)
    ?? owner(taxonomyId)
    ?? owner(page.key)
    ?? owner(page.type)
    ?? list[0];

  return {
    ...author,
    url: `${ctx.staticUrls.authors}#${author.slug}`,
    publisher: locale.site?.publisher ?? locale.site?.name ?? '',
  };
}

/**
 * Оценка в виде, пригодном для чтения на этом языке.
 *
 * Две вещи, которые машина делает неправильно, а человек замечает сразу.
 * Первая: `6` вместо `6,0` — в колонке, где соседи 6,3 и 6,1, целое число
 * выглядит как обрезанное. Вторая: точка вместо запятой. Немецкий текст с
 * «6.3» читается как переведённый машинально, а это ровно то впечатление,
 * которого мы избегаем.
 *
 * Разделитель берётся из локали, а не зашивается: следующий сайт сети может
 * быть английским, и там правильна как раз точка.
 */
/**
 * Полоса оценки: высокая, средняя, низкая.
 *
 * Нужна ради цвета шкалы под числом. Порогов два и они те же, что в
 * тексте методики: 7,5 — граница, выше которой площадку можно советовать
 * без оговорок, 6,5 — ниже которой оговорок больше, чем достоинств.
 * Красного здесь нет: шкала показывает, где площадка стоит среди прочих,
 * а не выносит приговор. Ниже средней она просто серая.
 */
export function scoreBand(value) {
  if (value == null) return '';
  if (value >= 7.5) return 'is-high';
  if (value >= 6.5) return 'is-mid';
  return 'is-low';
}

export function formatScore(value, ctx) {
  if (value == null) return 'k. A.';
  return Number(value).toLocaleString(ctx.locale.code ?? 'en', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
