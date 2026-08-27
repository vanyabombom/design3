/**
 * Общие утилиты генератора. Зависимостей нет и не будет — лист 08 требует
 * чистый стек, а любой пакет в node_modules это то, что смотрят на приёмке.
 */

/** Достаёт вложенное значение по строковому пути: get(brand, 'payout.medianHours'). */
export function get(obj, path) {
  if (obj == null || !path) return undefined;
  let cur = obj;
  for (const key of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Записывает вложенное значение по пути, создавая недостающие объекты. */
export function set(obj, path, value) {
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * Экранирование для вставки в HTML-текст и в значения атрибутов.
 * Прогоняется через него КАЖДАЯ строка из данных — иначе апостроф в названии
 * бренда или кавычка в описании бонуса ломает разметку.
 */
export function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Экранирование для вставки внутрь <script type="application/ld+json">. */
export function escJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Приводит произвольную строку к URL-слагу. Транслитерация немецких умляутов включена. */
export function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Слаг -> data-атрибут: minDeposit -> data-f-min-deposit. */
export function kebab(input) {
  return String(input).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Префикс подпапки, если сайт живёт не в корне: '31.76.241.72/casino'.
 * Задаётся один раз в site.basePath и уходит во все адреса разом, потому что
 * urlJoin — единственное место, где они собираются. Ставить его руками по
 * шаблонам нельзя: одна пропущенная ссылка даёт 404 на живом сайте.
 */
let BASE_PATH = '';

export function setBasePath(value) {
  BASE_PATH = value ? `/${String(value).replace(/^\/+|\/+$/g, '')}` : '';
}

export function basePath() {
  return BASE_PATH;
}

/** Адреса вне urlJoin: /404.html, /assets/css/main.css. */
export function withBase(path) {
  return `${BASE_PATH}${path}`;
}

/** Собирает путь с гарантированными слешами по краям: '/casino-payment/paypal-casino/'. */
export function urlJoin(...parts) {
  const joined = parts
    .filter((p) => p != null && p !== '')
    .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
    .filter((p) => p !== '')
    .join('/');
  return joined === '' ? `${BASE_PATH}/` : `${BASE_PATH}/${joined}/`;
}

/**
 * Считает слова в HTML-фрагменте, игнорируя теги, script/style и содержимое
 * JSON-LD. Нужен для порога тонких страниц из листа 05 — если считать вместе
 * с разметкой, любая страница «проходит» порог за счёт тегов.
 */
export function countWords(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Доля уникальности текста A относительно B по шинглам из 5 слов.
 * Лист 09 требует 40%+ различий между visa-casino и mastercard-casino,
 * и это единственный способ проверять требование, а не верить на слово.
 */
export function uniquenessRatio(htmlA, htmlB, shingleSize = 5) {
  const toWords = (html) =>
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const shingles = (words) => {
    const out = new Set();
    for (let i = 0; i + shingleSize <= words.length; i++) {
      out.add(words.slice(i, i + shingleSize).join(' '));
    }
    return out;
  };

  const a = shingles(toWords(htmlA));
  const b = shingles(toWords(htmlB));
  if (a.size === 0) return 0;

  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  return 1 - shared / a.size;
}

/** Форматирование даты в ISO (для dateModified и datetime). */
export function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Самая свежая из дат. Используется для dateModified страницы-листинга. */
export function latestDate(dates) {
  const valid = dates.map(isoDate).filter(Boolean).sort();
  return valid.length ? valid[valid.length - 1] : null;
}

/** Сортировка по строке вида 'score.total:desc'. */
export function comparatorFromSpec(spec) {
  if (!spec) return null;
  const [path, dir = 'asc'] = String(spec).split(':');
  const sign = dir.toLowerCase() === 'desc' ? -1 : 1;
  return (x, y) => {
    const a = get(x, path);
    const b = get(y, path);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
    return String(a).localeCompare(String(b)) * sign;
  };
}

/** Округление до заданного знака: round(8.4666, 1) -> 8.5 */
export function round(value, digits = 1) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function unique(arr) {
  return [...new Set(arr)];
}

/** Группировка массива по ключу или функции. */
export function groupBy(arr, keyOrFn) {
  const fn = typeof keyOrFn === 'function' ? keyOrFn : (item) => get(item, keyOrFn);
  const out = new Map();
  for (const item of arr) {
    const key = fn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}
