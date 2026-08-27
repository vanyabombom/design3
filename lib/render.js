/**
 * Загрузка шаблонов и сборка разметки schema.org.
 *
 * Шаблон — обычный ES-модуль, экспортирующий render(ctx) и возвращающий строку.
 * Никакого мустача и никакого движка шаблонов: у JS уже есть шаблонные строки,
 * а лишний парсер это лишний вес, лишний баг и лишняя зависимость, которую
 * будут искать на приёмке.
 *
 * Все шаблоны в templates/ на этом этапе — временный стенд. Настоящая вёрстка
 * приходит после согласования дизайна и заменяет их, не трогая lib/ и data/.
 */

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { esc, escJsonLd, isoDate, latestDate, urlJoin, withBase } from './util.js';

export async function loadTemplates(dir) {
  const templates = new Map();
  let files;
  try {
    files = await readdir(dir);
  } catch {
    throw new Error(`не найдена папка шаблонов ${dir}`);
  }

  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const name = path.basename(file, '.js');
    const module = await import(pathToFileURL(path.join(dir, file)).href);
    if (typeof module.render !== 'function') {
      throw new Error(`шаблон ${file} не экспортирует функцию render(ctx)`);
    }
    templates.set(name, module.render);
  }

  return templates;
}

// ---------------------------------------------------------------------------
// schema.org
//
// Лист 04: «У конкурента нет Review, AggregateRating и BreadcrumbList — это наш
// зазор». Лист 09 при этом предупреждает: «разметка есть, а видимого контента
// под неё нет» — тревожный сигнал. Поэтому каждый билдер ниже принимает ровно
// те данные, которые уже выведены на странице, и не изобретает ничего сверх.
// ---------------------------------------------------------------------------

export function breadcrumbList(breadcrumbs, { domain, labelFor }) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: labelFor(crumb),
      item: `${domain}${crumb.url}`,
    })),
  };
}

export function article({ headline, description, url, domain, author, publishedAt, updatedAt, image }) {
  return {
    '@type': 'Article',
    headline,
    description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${domain}${url}` },
    author: {
      '@type': 'Person',
      name: author.name,
      jobTitle: author.role,
      url: `${domain}${author.url}`,
    },
    publisher: { '@type': 'Organization', name: author.publisher },
    datePublished: isoDate(publishedAt),
    dateModified: isoDate(updatedAt),
    ...(image ? { image: `${domain}${image}` } : {}),
  };
}

export function faqPage(items) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/**
 * Review на карточке бренда.
 *
 * Оценка берётся из brand.score, посчитанного формулой, и ссылается на
 * страницу методики. Без методики флаг seo.schema.aggregateRating снимается
 * автоматически в build.js и этот блок не выводится вообще — лист 04
 * разрешает AggregateRating только при опубликованных критериях.
 */
export function review({ brand, url, domain, author, methodologyUrl, scale = 10 }) {
  return {
    '@type': 'Review',
    itemReviewed: {
      '@type': 'Organization',
      name: brand.name,
      // Логотип указывается, только если файл действительно лежит на диске:
      // hasLogo проставляет сборка. Раньше адрес брался из данных без
      // проверки и вёл в 404, да ещё и мимо префикса подпапки — разметка
      // ссылалась на картинку, которой нет.
      ...(brand.hasLogo && brand.logo ? { logo: `${domain}${withBase(brand.logo)}` } : {}),
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: brand.score.total,
      bestRating: scale,
      worstRating: 0,
    },
    author: { '@type': 'Person', name: author.name, url: `${domain}${author.url}` },
    datePublished: isoDate(brand.publishedAt),
    url: `${domain}${url}`,
    reviewBody: brand.verdict,
    ...(methodologyUrl ? { isBasedOn: `${domain}${methodologyUrl}` } : {}),
  };
}

/**
 * ItemList для листинга. Даёт поисковику явный порядок подборки — тот же,
 * что видит пользователь в таблице.
 *
 * url на пункт — только если передан ctx: страницы карточек существуют
 * (см. templates/brand.js), и ссылка на них в разметке больше не ведёт
 * в 404. Без ctx, как раньше, отдаётся ItemList из одних name — вызывающая
 * сторона решает сама, уместен ли адрес в её контексте.
 */
export function itemList({ brands, ctx }) {
  const urlFor = ctx ? (brand) => `${ctx.site.domain}${urlJoin(ctx.locale.brandBase ?? 'casino', brand.slug)}` : null;

  return {
    '@type': 'ItemList',
    numberOfItems: brands.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: brands.map((brand, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: brand.name,
      ...(urlFor ? { url: urlFor(brand) } : {}),
    })),
  };
}

/** Склеивает блоки в один граф и оборачивает в тег. */
export function jsonLdBlock(nodes) {
  const clean = nodes.filter(Boolean);
  if (clean.length === 0) return '';
  const payload = clean.length === 1
    ? { '@context': 'https://schema.org', ...clean[0] }
    : { '@context': 'https://schema.org', '@graph': clean };
  return `<script type="application/ld+json">${escJsonLd(payload)}</script>`;
}

// ---------------------------------------------------------------------------
// Помощники разметки, общие для всех шаблонов
// ---------------------------------------------------------------------------

/**
 * Партнёрская ссылка. Единственный способ вывести ссылку на оффер во всём
 * проекте: rel и data-affiliate проставляются здесь, поэтому «забыть» их
 * технически невозможно, а линтер ловит любой обход.
 *
 * Явно попросили один адрес на все кнопки «Zum Casino» сайта — тот же,
 * что уже стоит на логотипах в site.affiliate.logoLinkUrl, а не адрес
 * конкретного бренда. Поэтому здесь он в приоритете, а /go/<slug>/ и
 * brand.affiliate.url остаются только запасным путём на случай, если
 * logoLinkUrl вообще не задан.
 */
export function affiliateLink({ brand, site, label, className = '', iconHtml = '', title = null }) {
  const href = site.affiliate.logoLinkUrl
    ?? (site.affiliate.mode === 'internal-redirect'
      ? urlJoin(site.affiliate.redirectBase, brand.slug)
      : brand.affiliate.url);

  return `<a href="${esc(href)}" rel="${esc(site.affiliate.rel)}" target="${esc(site.affiliate.target)}"`
    + ` data-affiliate="${esc(brand.slug)}"${title ? ` title="${esc(title)}"` : ''}`
    + `${className ? ` class="${esc(className)}"` : ''}>${esc(label)}${iconHtml}</a>`;
}

/** Логотип с обязательными размерами — иначе линтер валит сборку. */
export function logo(brand, site) {
  const { logoWidth: w, logoHeight: h, lazyBelowFold } = site.performance;
  const src = brand.logo ?? withBase(`/assets/img/brands/${brand.slug}.webp`);
  return `<img src="${esc(src)}" alt="${esc(brand.name)}" width="${w}" height="${h}"`
    + `${lazyBelowFold ? ' loading="lazy" decoding="async"' : ''}>`;
}

/**
 * Дата сверки. Лист 09: «Выводится автоматически из источника» — хорошо,
 * «Дата зашита в текст руками» — тревожный сигнал. Поэтому дата приходит
 * только сюда и только из данных бренда.
 */
export function checkedDate(value, { label }) {
  const iso = isoDate(value);
  if (!iso) return '';
  return `<time datetime="${iso}" data-checked>${esc(label)} ${esc(iso)}</time>`;
}

/** Самая свежая дата сверки по списку брендов — для dateModified листинга. */
export function listingModifiedDate(brands) {
  return latestDate(brands.flatMap((b) => [b.bonus?.checkedAt, b.payout?.checkedAt, b.updatedAt]));
}

/**
 * Обёртка таблицы. Лист 09: на 320 px таблица должна скроллиться внутри себя,
 * а страница — не ехать вбок. Один класс, одна точка правки на весь сайт.
 */
export function tableScroll(inner) {
  return `<div class="table-scroll" data-table-scroll>${inner}</div>`;
}

export { esc };
