/**
 * Правила пересечения «бренд x таксономия» из data/taxonomies.json.
 *
 * Лист 00: «Бренд заводится ОДИН раз карточкой, страницы-листинги генерируются
 * пересечением». Здесь живёт это пересечение. Списки брендов для листингов
 * нигде не ведутся руками — их не существует как данных, они вычисляются.
 *
 * Практическое следствие: чтобы добавить бренд во все подходящие листинги,
 * достаточно завести его карточку. Чтобы убрать из всех — сменить status.
 */

import { get, comparatorFromSpec } from './util.js';

const OPS = {
  /** Массив содержит значение: { payments: { has: 'paypal' } } */
  has: (value, arg) => Array.isArray(value) && value.includes(arg),

  /** Массив содержит хотя бы одно из: { payments: { hasAny: ['bitcoin','usdt'] } } */
  hasAny: (value, arg) => Array.isArray(value) && arg.some((item) => value.includes(item)),

  /** Массив содержит все перечисленные. */
  hasAll: (value, arg) => Array.isArray(value) && arg.every((item) => value.includes(item)),

  /** Длина массива не меньше N: { live: { minCount: 1 } } */
  minCount: (value, arg) => Array.isArray(value) && value.length >= arg,

  /** Строгое равенство, включая null: { 'limits.monthlyDepositCap': { eq: null } } */
  eq: (value, arg) => value === arg,
  ne: (value, arg) => value !== arg,

  in: (value, arg) => Array.isArray(arg) && arg.includes(value),
  notIn: (value, arg) => Array.isArray(arg) && !arg.includes(value),

  gte: (value, arg) => typeof value === 'number' && value >= arg,
  lte: (value, arg) => typeof value === 'number' && value <= arg,
  gt: (value, arg) => typeof value === 'number' && value > arg,
  lt: (value, arg) => typeof value === 'number' && value < arg,
};

/** Проверяет один бренд против правила match. Несколько полей = И. */
export function brandMatches(brand, match) {
  if (!match) return false;
  if (match.$all === true) return true;

  for (const [field, condition] of Object.entries(match)) {
    if (field.startsWith('$')) continue;

    const value = get(brand, field);

    for (const [op, arg] of Object.entries(condition)) {
      const fn = OPS[op];
      if (!fn) throw new Error(`taxonomies.json: неизвестная операция "${op}" в правиле для поля "${field}"`);
      if (!fn(value, arg)) return false;
    }
  }

  return true;
}

/**
 * Собирает состав листинга для одного терма.
 *
 * Порядок по умолчанию — по убыванию оценки: страница отвечает на вопрос
 * «где играть», и первым должен идти лучший по нашей же методике, а не первый
 * по алфавиту или тот, кто больше платит.
 */
export function resolveTerm(term, brands, { defaultSort = 'score.total:desc' } = {}) {
  const eligible = brands.filter((brand) => {
    // Ушедшие с рынка не попадают в листинги, но и не удаляются из данных:
    // лист 05 требует переводить их в блок «больше не работает в [стране]».
    if (brand.status !== 'active') return false;
    return brandMatches(brand, term.match);
  });

  const comparator = comparatorFromSpec(term.sort ?? defaultSort);
  if (comparator) eligible.sort(comparator);

  const limited = term.limit ? eligible.slice(0, term.limit) : eligible;

  return {
    brands: limited,
    totalMatched: eligible.length,
    truncated: eligible.length - limited.length,
  };
}

/**
 * Бренды, ушедшие с рынка, но подходящие под терм. Идут в отдельный блок
 * «больше не работает в [стране]» — лист 05 называет это отдельным запросом
 * со своим трафиком, а не мусором, который надо прятать.
 */
export function resolveDeparted(term, brands) {
  return brands.filter((brand) => brand.status !== 'active' && brandMatches(brand, term.match));
}

/**
 * Обратный индекс: для каждого бренда — все термы, где он присутствует.
 *
 * Это основа перелинковки из листа 04: «Каждая карточка бренда линкует на все
 * листинги, где он присутствует, и обратно. 1 бренд x 8 таксономий = 8 входящих».
 * Строится один раз на сборку и переиспользуется всеми шаблонами.
 */
export function buildBrandIndex(brands, resolvedTerms) {
  const index = new Map();
  for (const brand of brands) index.set(brand.slug, []);

  for (const resolved of resolvedTerms) {
    for (const brand of resolved.brands) {
      index.get(brand.slug)?.push({
        taxonomyId: resolved.taxonomyId,
        slug: resolved.slug,
        url: resolved.url,
        position: resolved.brands.indexOf(brand) + 1,
      });
    }
  }

  return index;
}

/**
 * Похожие казино для карточки бренда (лист 02). Считаем близость по числу
 * общих термов: два бренда, оказавшихся вместе в семи листингах, для
 * пользователя действительно взаимозаменяемы.
 */
export function findSimilar(brandSlug, brandIndex, limit = 4) {
  const own = brandIndex.get(brandSlug) ?? [];
  const ownTerms = new Set(own.map((t) => t.url));
  const overlap = new Map();

  for (const [slug, terms] of brandIndex) {
    if (slug === brandSlug) continue;
    let shared = 0;
    for (const term of terms) if (ownTerms.has(term.url)) shared++;
    if (shared > 0) overlap.set(slug, shared);
  }

  return [...overlap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([slug, shared]) => ({ slug, sharedTerms: shared }));
}
