/**
 * Граф сайта: какие страницы существуют, по каким адресам, кто чей родитель,
 * что куда редиректит и что на что ссылается.
 *
 * Строится ДО рендеринга и полностью независим от вёрстки. Это позволяет
 * отдать заказчику карту всех URL раньше, чем написана первая строка CSS,
 * и ловить дубли и тупики на структуре, а не глазами по готовому сайту.
 */

import { urlJoin, withBase } from './util.js';
import { resolveTerm, resolveDeparted, buildBrandIndex, findSimilar } from './match.js';

export const PAGE_TYPES = {
  HOME: 'home',
  HUB: 'hub',
  LISTING: 'listing',
  BRAND: 'brand',
  BRAND_INDEX: 'brand-index',
  COMPARE: 'compare',
  STATIC: 'static',
  REDIRECT_TARGET: 'go',
};

/**
 * @param {object} args
 * @param {object} args.site        data/site.json
 * @param {object} args.taxonomies  data/taxonomies.json
 * @param {Array}  args.brands      бренды с уже посчитанными оценками
 * @param {object} args.locale      data/locales/<locale>.json — все слаги, зависящие от языка
 */
export function buildGraph({ site, taxonomies, brands, locale }) {
  const pages = [];
  const redirects = [];
  const problems = [];
  const byUrl = new Map();

  const geo = site.geo;
  const brandBase = locale.brandBase ?? 'casino';

  const addPage = (page) => {
    if (byUrl.has(page.url)) {
      const existing = byUrl.get(page.url);
      problems.push({
        level: 'error',
        message: `конфликт URL ${page.url}: его занимают одновременно "${existing.type}:${existing.key}" и "${page.type}:${page.key}"`,
      });
      return null;
    }
    byUrl.set(page.url, page);
    pages.push(page);
    return page;
  };

  const addRedirect = (from, to, reason) => {
    if (from === to) return;
    redirects.push({ from, to, code: 301, reason });
  };

  // ---------------------------------------------------------------------------
  // 1. Главная
  // ---------------------------------------------------------------------------
  const home = addPage({
    type: PAGE_TYPES.HOME,
    key: 'home',
    url: urlJoin(),
    template: 'home',
    priority: 1,
    parent: null,
    inSitemap: true,
  });

  // ---------------------------------------------------------------------------
  // 2. Термы таксономий и хабы
  //
  // Термы решаются ПЕРВЫМИ, потому что хаб должен знать, сколько брендов
  // набралось в каждом его листинге: терм, не добравший порога, в хаб попадает
  // не ссылкой, а секцией (лист 05, «Тонкие страницы в хвосте таксономий»).
  // ---------------------------------------------------------------------------
  const thresholds = taxonomies.thresholds ?? {};
  const minBrands = thresholds.minBrandsForOwnUrl ?? 5;
  const resolvedTerms = [];
  const termsByTaxonomy = new Map();
  const aliasQueue = [];

  // Отбор страниц для публикации. Лист 08 запрещает «страницы без содержания
  // на потом», а лист 05 советует выкладывать волнами. Пока в includeTerms
  // стоит список, все остальные термы ведут себя как тонкие: страницы не
  // получают, а отдают 301 на свой хаб. Битых ссылок при этом не возникает —
  // используется тот же путь, что и для термов ниже порога.
  const included = site.build?.includeTerms;
  const inScope = (slug) => !Array.isArray(included) || included.includes(slug);

  for (const taxonomy of taxonomies.taxonomies) {
    const list = [];
    termsByTaxonomy.set(taxonomy.id, list);

    for (const term of taxonomy.terms) {
      // Терм чужого ГЕО в сборку не попадает вообще: ни страницей, ни редиректом.
      if (term.geo && !term.geo.includes(geo)) continue;

      const url = urlJoin(taxonomy.base, term.slug);

      if (term.aliasOf) {
        aliasQueue.push({ taxonomy, term, url });
        continue;
      }

      const resolved = resolveTerm(term, brands);
      const departed = resolveDeparted(term, brands);

      const entry = {
        taxonomyId: taxonomy.id,
        taxonomy,
        term,
        slug: term.slug,
        url,
        brands: resolved.brands,
        totalMatched: resolved.totalMatched,
        truncated: resolved.truncated,
        departed,
        priority: term.priority ?? taxonomy.priority ?? 2,
        thin: resolved.brands.length < minBrands || !inScope(term.slug),
        outOfScope: !inScope(term.slug),
      };

      resolvedTerms.push(entry);
      list.push(entry);
    }
  }

  const hubUrlFor = (taxonomyId) => {
    const hub = taxonomies.hubs.find((h) => h.taxonomy === taxonomyId);
    const hubSlug = locale.hubSlugs?.[hub?.key];
    return hubSlug ? urlJoin(hubSlug) : urlJoin();
  };

  // Страницы листингов. Тонкие термы страницы не получают — вместо неё
  // редирект на хаб, где они выводятся секцией.
  for (const entry of resolvedTerms) {
    const hubUrl = hubUrlFor(entry.taxonomyId);

    if (entry.thin) {
      problems.push({
        level: 'warn',
        message: entry.outOfScope
          ? `терм "${entry.url}" не входит в текущую волну публикации (site.build.includeTerms) — отдаёт 301 на ${hubUrl}`
          : `терм "${entry.url}" набрал ${entry.brands.length} брендов при пороге ${minBrands} — своей страницы не получает, уходит секцией в ${hubUrl} (лист 05)`,
      });
      addRedirect(entry.url, hubUrl, entry.outOfScope
        ? 'вне текущей волны публикации'
        : `тонкий листинг: ${entry.brands.length} брендов из ${minBrands}`);
      if (entry.term.short) addRedirect(urlJoin(entry.term.short), hubUrl, 'короткий URL тонкого листинга');
      entry.page = null;
      continue;
    }

    const page = addPage({
      type: PAGE_TYPES.LISTING,
      key: `${entry.taxonomyId}/${entry.slug}`,
      url: entry.url,
      template: 'listing',
      priority: entry.priority,
      parent: hubUrl,
      inSitemap: true,
      data: entry,
    });
    entry.page = page;

    // Короткий URL эталона. Лист 07: у конкурента 111 таких страниц, и это
    // 111 дублей, конкурирующих с собственными вложенными адресами.
    // Мы отдаём 301 — трафик по короткому запросу сохраняется, дубля нет.
    if (entry.term.short) {
      addRedirect(urlJoin(entry.term.short), entry.url, 'короткий URL эталона (лист 07)');
    }
  }

  // Термы с ОДИНАКОВЫМ составом брендов. Лист 05: «Если сказать нечего —
  // объединять в одну страницу». Две страницы из одного и того же набора
  // брендов почти неизбежно провалят проверку уникальности, и лучше узнать
  // об этом на сборке, чем на приёмке.
  const bySignature = new Map();
  for (const entry of resolvedTerms) {
    const signature = `${entry.taxonomyId}::${entry.brands.map((b) => b.slug).sort().join(',')}`;
    if (!bySignature.has(signature)) bySignature.set(signature, []);
    bySignature.get(signature).push(entry);
  }
  for (const group of bySignature.values()) {
    if (group.length < 2) continue;
    const [keep, ...rest] = group;
    problems.push({
      level: 'warn',
      message: `одинаковый состав брендов у ${group.length} термов: ${group.map((t) => t.slug).join(', ')}. `
        + `Лист 05 предлагает в таком случае объединять: оставить "${keep.slug}", остальным поставить aliasOf. `
        + `Иначе это ${rest.length} почти одинаковых страниц, конкурирующих между собой`,
    });
  }

  // Синонимы разрешаются последними: цель могла быть объявлена ниже по файлу
  // и могла сама не получить страницы, не добрав порога. Тогда синоним ведёт
  // туда же, куда ушёл его канон, — на хаб. Цепочка 301 -> 301 недопустима.
  for (const { taxonomy, term, url } of aliasQueue) {
    const target = resolvedTerms.find((t) => t.taxonomyId === taxonomy.id && t.slug === term.aliasOf);
    if (!target) {
      problems.push({
        level: 'error',
        message: `терм "${term.slug}" объявлен синонимом "${term.aliasOf}", но такого терма нет в таксономии "${taxonomy.id}"`,
      });
      continue;
    }

    const destination = target.page ? target.url : hubUrlFor(target.taxonomyId);
    const reason = target.page
      ? `синоним терма "${term.aliasOf}"`
      : `синоним терма "${term.aliasOf}", который сам не добрал порога`;

    addRedirect(url, destination, reason);
    if (term.short) addRedirect(urlJoin(term.short), destination, 'короткий URL синонима');
  }

  // Хабы меню.
  for (const hub of taxonomies.hubs) {
    const slug = locale.hubSlugs?.[hub.key];
    if (!slug) {
      problems.push({ level: 'error', message: `в locale не задан hubSlugs.${hub.key} — хаб не получит адреса` });
      continue;
    }

    const terms = termsByTaxonomy.get(hub.taxonomy) ?? [];
    addPage({
      type: PAGE_TYPES.HUB,
      key: hub.key,
      url: urlJoin(slug),
      template: 'hub',
      priority: hub.priority ?? 1,
      parent: urlJoin(),
      inSitemap: true,
      inNav: true,
      data: {
        hub,
        taxonomyId: hub.taxonomy,
        terms: terms.filter((t) => t.page),
        thinTerms: terms.filter((t) => !t.page),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Карточки брендов
  // ---------------------------------------------------------------------------
  const brandIndex = buildBrandIndex(brands, resolvedTerms.filter((t) => t.page));

  addPage({
    type: PAGE_TYPES.BRAND_INDEX,
    key: 'brand-index',
    url: urlJoin(brandBase),
    template: 'brand-index',
    priority: 2,
    parent: urlJoin(),
    inSitemap: true,
    data: { brands },
    $note: 'Родитель всех карточек. Без него хлебная крошка карточки указывала бы в 404.',
  });

  for (const brand of brands) {
    const terms = brandIndex.get(brand.slug) ?? [];

    if (terms.length === 0 && brand.status === 'active') {
      problems.push({
        level: 'warn',
        brand: brand.slug,
        message: `бренд не попал ни в один листинг — карточка станет тупиком без входящих ссылок (лист 09, «Внутренняя перелинковка»)`,
      });
    }

    // Карточка бренда: подробный разбор одного казино. Была убрана вместе
    // со страницами-обзорами, вернулась по прямой правке — таблицы сравнения
    // остаются короткой сводкой, а сюда уходит вердикт, разбор бонуса,
    // полный список платежей и лицензия одним куском.
    addPage({
      type: PAGE_TYPES.BRAND,
      key: brand.slug,
      url: urlJoin(brandBase, brand.slug),
      template: 'brand',
      priority: 1,
      parent: urlJoin(brandBase),
      inSitemap: true,
      data: {
        brand,
        terms,
        similar: findSimilar(brand.slug, brandIndex),
      },
    });

    // Точка выхода на оффер. Отдельной страницей, а не прямой ссылкой:
    // целевой URL меняется в одном месте, клики можно считать, а noindex
    // не пускает эти адреса в индекс.
    if (site.affiliate.mode === 'internal-redirect' && brand.affiliate?.active) {
      addPage({
        type: PAGE_TYPES.REDIRECT_TARGET,
        key: `go/${brand.slug}`,
        url: urlJoin(site.affiliate.redirectBase, brand.slug),
        template: 'go',
        priority: 5,
        parent: null,
        inSitemap: false,
        noindex: true,
        data: { brand },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Служебные страницы
  // ---------------------------------------------------------------------------
  for (const spec of taxonomies.staticPages) {
    if (spec.key === 'home') continue;

    const slug = locale.pageSlugs?.[spec.key];
    if (!slug) {
      problems.push({ level: 'error', message: `в locale не задан pageSlugs.${spec.key}` });
      continue;
    }

    addPage({
      type: spec.key === 'compare' ? PAGE_TYPES.COMPARE : PAGE_TYPES.STATIC,
      key: spec.key,
      url: spec.key === '404' ? withBase('/404.html') : urlJoin(slug),
      template: spec.template,
      priority: spec.priority ?? 2,
      parent: urlJoin(),
      inSitemap: spec.key !== '404',
      inNav: spec.inNav === true,
      inFooter: spec.inFooter === true,
      noindex: spec.noindex === true,
      noOffers: spec.noOffers === true,
      generatedFrom: spec.generatedFrom ?? null,
      data: spec.key === 'compare' ? { brands } : {},
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Хлебные крошки и проверка целостности редиректов
  // ---------------------------------------------------------------------------
  for (const page of pages) {
    page.breadcrumbs = buildBreadcrumbs(page, byUrl, locale);
  }

  for (const redirect of redirects) {
    if (byUrl.has(redirect.from)) {
      problems.push({
        level: 'error',
        message: `${redirect.from} одновременно страница и источник редиректа на ${redirect.to}`,
      });
    }
    if (!byUrl.has(redirect.to)) {
      problems.push({
        level: 'error',
        message: `редирект ${redirect.from} ведёт на ${redirect.to}, которого нет в сборке`,
      });
    }
  }

  const seenFrom = new Map();
  for (const redirect of redirects) {
    if (seenFrom.has(redirect.from)) {
      problems.push({
        level: 'error',
        message: `короткий URL ${redirect.from} назначен дважды: на ${seenFrom.get(redirect.from)} и на ${redirect.to}`,
      });
    }
    seenFrom.set(redirect.from, redirect.to);
  }

  return { pages, redirects, problems, byUrl, resolvedTerms, brandIndex, home };
}

/** Цепочка родителей до главной. Из неё строится BreadcrumbList (лист 04). */
function buildBreadcrumbs(page, byUrl, locale) {
  const chain = [];
  let current = page;
  const guard = new Set();

  while (current) {
    if (guard.has(current.url)) break;
    guard.add(current.url);
    chain.unshift({ url: current.url, key: current.key, type: current.type });
    current = current.parent ? byUrl.get(current.parent) : null;
  }

  if (chain[0]?.url !== urlJoin()) {
    chain.unshift({ url: urlJoin(), key: 'home', type: PAGE_TYPES.HOME });
  }

  return chain;
}

/**
 * Считает входящие внутренние ссылки на каждый URL.
 * Лист 09: «Карточка — тупик без входящих ссылок» это тревожный сигнал,
 * лист 05: «каждая новая страница получает 3+ внутренние ссылки».
 */
export function countInboundLinks(renderedPages) {
  const inbound = new Map();

  for (const { url, html } of renderedPages) {
    const hrefs = [...String(html).matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
    for (const href of new Set(hrefs)) {
      if (href === url) continue;
      if (!inbound.has(href)) inbound.set(href, new Set());
      inbound.get(href).add(url);
    }
  }

  return inbound;
}
