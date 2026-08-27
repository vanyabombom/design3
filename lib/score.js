/**
 * Расчёт оценки бренда из data/criteria.json.
 *
 * Лист 05, «Рейтинги без основания»: оценка 9.2 из воздуха плюс разметка
 * AggregateRating — риск ручных санкций. Поэтому score.total НИГДЕ не хранится
 * в исходных данных: он вычисляется здесь и только здесь. Попытка записать
 * оценку руками в brands.json ловится линтером.
 *
 * Побочный продукт расчёта — разбор по критериям, который идёт прямо в карточку
 * бренда («оценка по 6 критериям с весами», лист 02) и в /how-we-test/.
 */

import { get, round } from './util.js';

/** Оценивает одно правило. Возвращает { points, detail, skipped }. */
function evaluateRule(rule, brand) {
  switch (rule.type) {
    case 'band': {
      const value = get(brand, rule.field);
      if (value == null) return { skipped: true, reason: `нет данных в ${rule.field}` };
      return { points: pickBand(rule, value), value, unitKey: rule.unitKey };
    }

    case 'ratio': {
      const num = get(brand, rule.numerator);
      const den = get(brand, rule.denominator);
      if (num == null || den == null) return { skipped: true, reason: `нет данных в ${rule.numerator} или ${rule.denominator}` };
      if (den === 0) return { skipped: true, reason: `${rule.denominator} = 0, отношение не определено` };
      const ratio = num / den;
      return { points: pickBand(rule, ratio), value: round(ratio, 2) };
    }

    case 'count': {
      const value = get(brand, rule.field);
      if (!Array.isArray(value)) return { skipped: true, reason: `${rule.field} не массив` };
      return { points: pickBand(rule, value.length), value: value.length };
    }

    case 'match': {
      const value = get(brand, rule.field);
      if (value == null) return { skipped: true, reason: `нет данных в ${rule.field}` };
      const points = Object.prototype.hasOwnProperty.call(rule.map, value) ? rule.map[value] : rule.else;
      return { points, value };
    }

    case 'bool': {
      const value = get(brand, rule.field);
      if (typeof value !== 'boolean') return { skipped: true, reason: `${rule.field} не булево` };
      return { points: value ? rule.trueValue : rule.falseValue, value };
    }

    default:
      throw new Error(`criteria.json: неизвестный тип правила "${rule.type}" в правиле "${rule.id}"`);
  }
}

/** Первая подходящая полоса выигрывает; иначе rule.else. */
function pickBand(rule, value) {
  for (const band of rule.bands) {
    if (band.lte != null && value <= band.lte) return band.points;
    if (band.gte != null && value >= band.gte) return band.points;
  }
  return rule.else;
}

/**
 * Считает оценку одного бренда.
 *
 * Пропущенные правила (нет данных в необязательном поле) не обнуляют критерий,
 * а исключаются из расчёта с перераспределением долей между оставшимися.
 * Обнуление было бы враньём в другую сторону: отсутствие данных о числе языков
 * поддержки не означает, что поддержки нет. Но доля пропущенного пишется в
 * coverage, и линтер ругается, когда она велика — иначе оценка «8.9» может
 * оказаться посчитанной по одному правилу из четырёх.
 */
export function scoreBrand(brand, criteriaConfig) {
  const { criteria, scale = 10, roundTo = 1 } = criteriaConfig;
  const breakdown = [];
  let weightedSum = 0;
  let usedWeight = 0;

  for (const criterion of criteria) {
    // Критерий целиком неприменим — например, «Выплаты», пока собственных
    // замеров нет. Именно ПРОПУСТИТЬ, а не поставить ноль: ноль означал бы
    // «платят плохо», хотя на деле мы просто ещё не проверяли. Вес критерия
    // исключается из знаменателя, и оценка считается по оставшимся.
    if (criterion.skipWhen && get(brand, criterion.skipWhen.field) === criterion.skipWhen.equals) {
      breakdown.push({
        id: criterion.id,
        labelKey: criterion.labelKey,
        weight: criterion.weight,
        score: null,
        coverage: 0,
        skipped: true,
        reason: criterion.skipWhen.reason ?? `${criterion.skipWhen.field} = ${criterion.skipWhen.equals}`,
        rules: [],
      });
      continue;
    }

    const rules = [];
    let shareSum = 0;
    let pointsSum = 0;

    for (const rule of criterion.rules) {
      const result = evaluateRule(rule, brand);
      if (result.skipped) {
        rules.push({ id: rule.id, share: rule.share, skipped: true, reason: result.reason });
        continue;
      }
      shareSum += rule.share;
      pointsSum += result.points * rule.share;
      rules.push({
        id: rule.id,
        share: rule.share,
        points: result.points,
        value: result.value,
        unitKey: result.unitKey ?? null,
        field: rule.field ?? rule.numerator ?? null,
      });
    }

    const declaredShare = criterion.rules.reduce((sum, r) => sum + r.share, 0);
    const coverage = declaredShare === 0 ? 0 : shareSum / declaredShare;
    const criterionScore = shareSum === 0 ? null : round(pointsSum / shareSum, 2);

    breakdown.push({
      id: criterion.id,
      labelKey: criterion.labelKey,
      weight: criterion.weight,
      score: criterionScore,
      coverage: round(coverage, 2),
      rules,
    });

    if (criterionScore != null) {
      weightedSum += criterionScore * criterion.weight;
      usedWeight += criterion.weight;
    }
  }

  const total = usedWeight === 0 ? null : round(weightedSum / usedWeight, roundTo);

  return {
    total,
    scale,
    coverage: round(usedWeight / criteria.reduce((s, c) => s + c.weight, 0), 2),
    breakdown,
    computedAt: null,
  };
}

/**
 * Проставляет score всем брендам. Мутирует переданные объекты — сознательно:
 * дальше по конвейеру score.total используется в правилах match
 * (best-online-casinos = сортировка по score.total), и удобнее иметь его
 * прямо на бренде, а не тащить параллельную структуру.
 */
export function scoreAll(brands, criteriaConfig, { computedAt } = {}) {
  const problems = [];

  for (const brand of brands) {
    if (brand.score !== undefined) {
      problems.push({
        level: 'error',
        brand: brand.slug,
        message: 'в данных бренда найдено готовое поле "score". Оценка считается формулой из criteria.json и не задаётся руками (лист 05: «рейтинги без основания»)',
      });
      delete brand.score;
    }

    const score = scoreBrand(brand, criteriaConfig);
    score.computedAt = computedAt ?? null;
    brand.score = score;

    if (score.total == null) {
      problems.push({ level: 'error', brand: brand.slug, message: 'оценка не посчиталась ни по одному критерию' });
      continue;
    }

    for (const criterion of score.breakdown) {
      if (criterion.skipped) {
        problems.push({
          level: 'warn',
          brand: brand.slug,
          message: `критерий "${criterion.id}" (${criterion.weight}% веса) исключён из расчёта: ${criterion.reason}`,
        });
        continue;
      }
      if (criterion.coverage < 0.7) {
        const missing = criterion.rules.filter((r) => r.skipped).map((r) => r.id).join(', ');
        problems.push({
          level: 'warn',
          brand: brand.slug,
          message: `критерий "${criterion.id}" посчитан на ${Math.round(criterion.coverage * 100)}% — не хватает данных для правил: ${missing}`,
        });
      }
    }
  }

  return problems;
}

/**
 * Проверка целостности самой методики. Вызывается один раз на старте сборки:
 * кривые веса дают кривые оценки на всех 200 страницах сразу.
 */
export function validateCriteria(criteriaConfig) {
  const errors = [];
  const { criteria } = criteriaConfig;

  if (!Array.isArray(criteria) || criteria.length !== 6) {
    errors.push(`criteria.json: ожидалось ровно 6 критериев (лист 04), найдено ${criteria?.length ?? 0}`);
  }

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight !== 100) {
    errors.push(`criteria.json: сумма весов критериев = ${totalWeight}, должна быть 100`);
  }

  const seen = new Set();
  for (const criterion of criteria) {
    if (seen.has(criterion.id)) errors.push(`criteria.json: дубль критерия "${criterion.id}"`);
    seen.add(criterion.id);

    const shareSum = criterion.rules.reduce((sum, r) => sum + r.share, 0);
    if (shareSum !== 100) {
      errors.push(`criteria.json: сумма долей правил в критерии "${criterion.id}" = ${shareSum}, должна быть 100`);
    }

    for (const rule of criterion.rules) {
      if (rule.bands) {
        for (const band of rule.bands) {
          if (band.points < 0 || band.points > (criteriaConfig.scale ?? 10)) {
            errors.push(`criteria.json: правило "${rule.id}" даёт ${band.points} баллов, шкала 0–${criteriaConfig.scale ?? 10}`);
          }
        }
        // Полосы должны идти монотонно, иначе первая же перехватит все значения.
        const dirs = rule.bands.map((b) => (b.lte != null ? 'lte' : 'gte'));
        if (new Set(dirs).size > 1) {
          errors.push(`criteria.json: правило "${rule.id}" смешивает lte и gte в полосах — порядок срабатывания станет неочевидным`);
        }
      }
      if (rule.type === 'match' && !rule.map) {
        errors.push(`criteria.json: правило "${rule.id}" типа match без словаря map`);
      }
    }
  }

  return errors;
}
