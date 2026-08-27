/**
 * Иконки и графические заглушки.
 *
 * Почему свой набор, а не эмодзи и не иконочный шрифт:
 *
 * 1. Эмодзи рисуются шрифтом операционной системы. Один и тот же символ
 *    выглядит по-разному на Windows, macOS и Android, в тексте он цветной
 *    и не подчиняется currentColor — в таблице сравнения это шум.
 * 2. Иконочный шрифт — это внешний файл, блокирующий рендер, и лишний вес
 *    ради двадцати глифов.
 * 3. Инлайновый SVG наследует цвет и размер от текста, не даёт сетевого
 *    запроса и не ломает вёрстку при сдвиге шрифта.
 *
 * Набор один на весь сайт: символы кладутся в спрайт один раз на страницу,
 * дальше идут ссылки <use>. Двадцать иконок стоят около 2 КБ на документ.
 *
 * Иконки, которые нужны в CSS-псевдоэлементах (стрелки сортировки, плюс-минус
 * в аккордеоне), отдаются через маску в main.css — там <use> недоступен.
 */

import { readdirSync } from 'node:fs';
import { withBase } from './util.js';

/** Тело каждого символа. viewBox 24×24, обводка, ни одного fill-only пути. */
const PATHS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  'arrow-right': '<path d="M5 12h13M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  minus: '<path d="M6 12h12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.5v5M12 8h.01"/>',
  shield: '<path d="M12 3l7.5 3v6.2c0 4.2-3.2 6.9-7.5 8.3-4.3-1.4-7.5-4.1-7.5-8.3V6z"/><path d="M9 12.2l2 2 4-4.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 1.9"/>',
  star: '<path d="M12 4.2l2.45 4.96 5.47.8-3.96 3.86.94 5.45L12 16.7l-4.9 2.57.94-5.45L4.08 9.96l5.47-.8z"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  wallet: '<path d="M3.5 8.5A2.5 2.5 0 016 6h11.5v2.5"/><rect x="3.5" y="8.5" width="17" height="10" rx="2"/><path d="M16 12.5h4.5v2.5H16a1.25 1.25 0 010-2.5z"/>',
  bank: '<path d="M3.5 10L12 4.5l8.5 5.5M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7M4 20h16"/>',
  coins: '<circle cx="9.5" cy="9.5" r="5"/><path d="M14.5 6.2a5 5 0 010 11.6"/><path d="M12 14.5a5 5 0 006 4"/>',
  voucher: '<path d="M4 7.5h16v3a1.8 1.8 0 000 3.6v3.4H4v-3.4a1.8 1.8 0 000-3.6z"/><path d="M13 8.5v1.5M13 13v1.5M13 17.5V16"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 17.8h2"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0114 0"/>',
  filter: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
  external: '<path d="M14 5h5v5M19 5l-7.5 7.5"/><path d="M18 14v5H5V6h5"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 017.5 3H19v15.5H7.5A2.5 2.5 0 005 21z"/><path d="M19 18.5H7.5"/>',
  alert: '<path d="M12 4.5l8.5 15h-17z"/><path d="M12 10.5v3.8M12 17h.01"/>',
  scale: '<path d="M12 4.5v15M7 19.5h10M4 9l3-4 3 4M4 9a3 3 0 006 0M14 9l3-4 3 4M14 9a3 3 0 006 0M7 5h10"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.15" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/>',
  video: '<rect x="3" y="6" width="12.5" height="12" rx="2.2"/><path d="M15.5 10.2l5-2.8v9.2l-5-2.8z"/>',
  trophy: '<path d="M8 4h8v4.5a4 4 0 01-8 0z"/><path d="M8 5.8H5v1.2a3 3 0 003 3M16 5.8h3V7a3 3 0 01-3 3"/><path d="M12 12.5v3M9.5 19.5h5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
};

/** Ключ раздела → иконка меню. Разделы приходят из таксономий, не из вёрстки. */
export const SECTION_ICONS = {
  payments: 'card',
  bonuses: 'star',
  current: 'calendar',
  licenses: 'shield',
  providers: 'dice',
  live: 'video',
  odds: 'trophy',
  'brand-index': 'grid',
  compare: 'scale',
  'how-we-test': 'check',
  authors: 'user',
  'editorial-policy': 'book',
  'responsible-gambling': 'alert',
  imprint: 'info',
  privacy: 'shield',
  home: 'grid',
};

/** Слаг платёжного метода → иконка. Тип метода, а не логотип бренда. */
const PAYMENT_ICONS = {
  visa: 'card',
  mastercard: 'card',
  maestro: 'card',
  klarna: 'card',
  paypal: 'wallet',
  skrill: 'wallet',
  neteller: 'wallet',
  muchbetter: 'wallet',
  revolut: 'wallet',
  sepa: 'bank',
  sofort: 'bank',
  trustly: 'bank',
  'wire-transfer': 'bank',
  paysafecard: 'voucher',
  neosurf: 'voucher',
  'apple-pay': 'phone',
  'google-pay': 'phone',
  boku: 'phone',
  bitcoin: 'coins',
  ethereum: 'coins',
  litecoin: 'coins',
  usdt: 'coins',
  usdc: 'coins',
  dogecoin: 'coins',
};

/**
 * Спрайт со всеми символами. Выводится один раз сразу после открытия <body>,
 * до первой ссылки <use>: браузер умеет разрешать и обратные ссылки, но тогда
 * иконки на мгновение мигают пустотой. hidden убирает спрайт из потока,
 * aria-hidden — из дерева доступности.
 */
export function iconSprite() {
  const symbols = Object.entries(PATHS)
    .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
    .join('');
  return `<svg class="sprite" aria-hidden="true" focusable="false" hidden>${symbols}</svg>`;
}

/**
 * Размер — классом, а не атрибутами.
 *
 * На листинге выходит под полторы сотни иконок, и каждая пара width/height
 * это лишние двадцать байт в документе. Четыре ступени закрывают все случаи,
 * размеры заданы в критическом CSS — значит, размер известен до загрузки
 * основного файла и сдвига макета не будет.
 */
const SIZE_CLASS = { 11: 'ic--xs', 12: 'ic--xs', 13: 'ic--xs', 14: 'ic--sm', 15: 'ic--sm', 16: '', 17: '', 18: 'ic--lg' };

/**
 * Иконка. По умолчанию декоративная и скрыта от скринридера — текст рядом
 * уже всё говорит. Если иконка стоит без подписи, передаётся label и она
 * становится картинкой с именем.
 */
export function icon(name, { size = 16, className = '', label = null, fill = false } = {}) {
  if (!PATHS[name]) throw new Error(`нет иконки "${name}" — добавьте её в lib/icons.js`);
  const sizeClass = SIZE_CLASS[size];
  const classes = ['ic', sizeClass, fill ? 'ic--fill' : '', className].filter(Boolean).join(' ');
  // Нестандартный размер всё-таки получает атрибуты: пусть лучше будет
  // лишняя пара байт, чем иконка размером 300×150 до прихода стилей.
  const dimensions = sizeClass === undefined ? ` width="${size}" height="${size}"` : '';
  const a11y = label ? ` role="img" aria-label="${escapeAttr(label)}"` : ' aria-hidden="true"';
  return `<svg class="${classes}"${dimensions}${a11y}><use href="#i-${name}"/></svg>`;
}

/**
 * Логотипы платёжных методов, найденные на диске.
 *
 * Каталог читается один раз при загрузке модуля: во время сборки он не
 * меняется, а альтернатива — тащить список файлов через ctx во все шаблоны,
 * которые выводят платёжную ячейку.
 *
 * Имя файла и есть слаг метода, расширение любое. Положили visa.svg —
 * он и поедет вместо visa.jpg, ничего править не нужно.
 */
const PAYMENT_LOGOS = (() => {
  const found = new Map();
  try {
    for (const file of readdirSync(new URL('../assets/img/payments/', import.meta.url))) {
      const slug = file.replace(/\.[^.]+$/, '');
      if (slug && !found.has(slug)) found.set(slug, file);
    }
  } catch {
    // каталога может не быть — тогда везде остаются типовые значки
  }
  return found;
})();

/**
 * Знак платёжного метода.
 *
 * Настоящий логотип, если файл для этого метода есть, иначе значок типа
 * (карта, кошелёк, банк, ваучер, крипта). Раньше типовой значок стоял
 * везде, и вопрос «Visa или Mastercard» — тот самый, ради которого человек
 * открывает страницу платёжного метода, — по ячейке не решался.
 *
 * Откат не декоративный, а рабочий: под три метода верного логотипа у нас
 * нет, и лучше честный значок типа, чем чужой знак, похожий на нужный.
 */
export function paymentIcon(method, options = {}) {
  const file = PAYMENT_LOGOS.get(method);
  if (!file) return icon(PAYMENT_ICONS[method] ?? 'card', options);

  const size = options.size ?? 16;
  const label = options.label ?? method;
  return `<img class="pay-logo" src="${escapeAttr(withBase(`/assets/img/payments/${file}`))}"`
    + ` alt="${escapeAttr(label)}" width="${size}" height="${size}" loading="lazy" decoding="async">`;
}

/** Есть ли для метода настоящий логотип. Нужно вёрстке платёжной ячейки. */
export function hasPaymentLogo(method) {
  return PAYMENT_LOGOS.has(method);
}

/**
 * Знак бренда.
 *
 * Настоящих логотипов у нас пока нет, и рисовать их «похоже» нельзя: это
 * чужие товарные знаки, а неточная копия хуже отсутствия. Поэтому строка
 * листинга получает монограмму — она честно наша, одинаковая по размеру у
 * всех брендов и не даёт ни одного сетевого запроса.
 *
 * Оттенок берётся из слага, а не назначается вручную: одинаковый бренд
 * выглядит одинаково на всех страницах сети, а новый получает свой цвет без
 * правки данных. Насыщенность низкая — восемнадцать ярких плашек в таблице
 * читались бы как реклама, а не как справочник.
 *
 * Когда появятся файлы логотипов, brand.logo будет указывать на существующий
 * WebP и вместо монограммы выведется он: точка подстановки одна, в logoOrMark.
 */
export function brandMark(brand, { size = 28 } = {}) {
  const initials = initialsOf(brand.name);
  const hue = hueOf(brand.slug ?? brand.name);
  const r = Math.round(size * 0.22);
  const fontSize = initials.length > 1 ? size * 0.4 : size * 0.5;

  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
    + `<rect x=".5" y=".5" width="${size - 1}" height="${size - 1}" rx="${r}" fill="hsl(${hue} 58% 93%)" stroke="hsl(${hue} 40% 78%)"/>`
    + `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="central"`
    + ` font-size="${fontSize.toFixed(1)}" font-weight="700"`
    + ` fill="hsl(${hue} 55% 32%)">${escapeAttr(initials)}</text></svg>`;
}

/**
 * Логотип, если файл есть, иначе монограмма. Наличие файла проверяет сборка
 * и кладёт результат в brand.hasLogo — шаблон в файловую систему не ходит.
 */
export function logoOrMark(brand, site, { size = 28 } = {}) {
  if (!brand.hasLogo || !brand.logo) return brandMark(brand, { size });
  const { logoWidth: w, logoHeight: h } = site.performance;
  return `<img class="logo" src="${escapeAttr(withBase(brand.logo))}" alt="${escapeAttr(brand.name)}"`
    + ` width="${w}" height="${h}" loading="lazy" decoding="async">`;
}

/** До двух букв: по первым буквам слов, иначе первые две буквы названия. */
function initialsOf(name) {
  const words = String(name).trim().split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(name).trim().slice(0, 2).toUpperCase();
}

/** Устойчивый оттенок из строки. Одинаковый вход — одинаковый цвет всегда. */
function hueOf(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return hash % 360;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
