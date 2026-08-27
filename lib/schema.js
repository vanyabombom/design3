/**
 * Схема карточки бренда: поля, типы, допустимые значения, обязательность.
 *
 * Зачем отдельный файл, а не «просто JSON как получится»: бренд заводится ОДИН
 * раз (лист 00), и из него генерируются все листинги. Опечатка в payments —
 * 'pay-pal' вместо 'paypal' — тихо выкинет бренд из листинга PayPal и никто
 * этого не заметит на 200 страницах. Поэтому все перечислимые значения закрыты
 * словарями, а сборка падает на неизвестном значении.
 *
 * ГЕО-независим: здесь только имена полей и словари идентификаторов.
 * Ни одной строки, которую видит пользователь.
 */

export const PAYMENT_METHODS = [
  'visa', 'mastercard', 'maestro', 'paypal', 'skrill', 'neteller', 'trustly',
  'paysafecard', 'muchbetter', 'revolut', 'apple-pay', 'google-pay', 'klarna',
  'sofort', 'sepa', 'wire-transfer', 'boku', 'siru', 'neosurf', 'flexepin',
  'payid', 'mifinity', 'ecopayz', 'zimpler', 'pix', 'interac', 'astropay',
  'bitcoin', 'ethereum', 'usdt', 'usdt-trc20', 'usdc', 'litecoin', 'dogecoin',
  'xrp', 'cardano', 'solana', 'polygon', 'shiba-inu',
];

export const LICENSE_AUTHORITIES = [
  'UKGC', 'MGA', 'GGL', 'AGCO', 'SEGOB', 'GRAI', 'Gibraltar', 'IsleOfMan',
  'Kahnawake', 'Cagayan', 'Curacao', 'Anjouan', 'Tobique', 'LOTBA', 'IPLyC', 'none',
];

export const BONUS_TYPES = [
  'welcome', 'no-deposit', 'free-spins', 'free-chip', 'cashback', 'reload',
  'vip', 'high-roller',
];

export const LIVE_GAMES = [
  'live-roulette', 'live-blackjack', 'live-baccarat', 'live-poker',
  'lightning-roulette', 'crazy-time', 'monopoly-live', 'dream-catcher',
];

export const BETTING_MARKETS = [
  'football', 'basketball', 'tennis', 'horse-racing', 'esports',
  'virtual-sports', 'in-play', 'accumulator', 'asian-handicap', 'cash-out',
];

export const RESPONSIBLE_TOOLS = [
  'deposit-limit', 'loss-limit', 'time-limit', 'reality-check',
  'self-exclusion', 'time-out', 'national-register',
];

export const BRAND_FEATURES = [
  'demo-play', 'no-kyc-until-threshold', 'cashback-program', 'tournaments',
  'loyalty-shop', 'crypto-only',
];

export const BRAND_STATUS = ['active', 'left-market', 'license-revoked', 'domain-changed'];

/**
 * Описание полей. type: string | number | int | bool | date | slug | url |
 * enum | enum[] | string[] | object.
 *
 * required: true      — сборка падает без него
 * required: 'warn'    — сборка проходит, линтер предупреждает
 */
export const BRAND_FIELDS = [
  { path: 'slug', type: 'slug', required: true },
  { path: 'name', type: 'string', required: true },
  { path: 'status', type: 'enum', values: BRAND_STATUS, required: true, default: 'active',
    note: 'Лист 05, «Мёртвые бренды в листингах». Ушедший оператор не удаляется, а меняет статус — и попадает в блок «больше не работает в [стране]», у которого свой трафик.' },
  { path: 'established', type: 'int', min: 1990, max: 2030, required: 'warn' },
  { path: 'logo', type: 'string', required: 'warn',
    note: 'Путь к WebP. Размеры берутся из site.performance, чтобы width/height были явными на всех страницах разом.' },

  { path: 'license.authority', type: 'enum', values: LICENSE_AUTHORITIES, required: true },
  { path: 'license.number', type: 'string', required: 'warn' },
  { path: 'license.localLicensed', type: 'bool', required: true,
    note: 'Есть ли лицензия страны, под которую делается сайт. Отделяет GGL-лицензиатов от «casinos ohne deutsche Lizenz» — у эталона это отдельная таксономия с трафиком.' },
  { path: 'license.registryUrl', type: 'url', required: 'warn',
    note: 'Прямая ссылка на запись в публичном реестре. Из неё строится секция «как проверить лицензию» — собственная польза, которой нет у оператора.' },

  { path: 'bonus.types', type: 'enum[]', values: BONUS_TYPES, required: true },
  { path: 'bonus.matchPct', type: 'number', min: 0, max: 1000, nullable: true },
  { path: 'bonus.amount', type: 'number', min: 0, nullable: true },
  { path: 'bonus.noDepositAmount', type: 'number', min: 0, nullable: true },
  { path: 'bonus.freeSpins', type: 'int', min: 0, nullable: true },
  { path: 'bonus.wagering', type: 'number', min: 0, max: 100, required: true, nullable: true,
    note: 'null, если условие ещё не сверено с правилами оператора. Пустое поле честнее правдоподобного числа: по вейджеру считается 40% критерия «Бонус», и выдуманное значение исказит оценку.' },
  { path: 'bonus.wageringApplies', type: 'enum', values: ['bonus', 'bonus+deposit', 'deposit'], required: true, nullable: true,
    note: 'x30 на бонус и x30 на бонус+депозит — это двукратная разница в требуемом обороте. Без этого поля расчёт реальной стоимости бонуса врёт вдвое.' },
  { path: 'bonus.minDeposit', type: 'number', min: 0, required: true, nullable: true },
  { path: 'bonus.maxBet', type: 'number', min: 0, required: 'warn', nullable: true },
  { path: 'bonus.expiryDays', type: 'int', min: 0, required: 'warn', nullable: true },
  { path: 'bonus.maxCashout', type: 'number', min: 0, nullable: true },
  { path: 'bonus.hasCode', type: 'bool', default: false },
  { path: 'bonus.code', type: 'string', nullable: true },
  { path: 'bonus.checkedAt', type: 'date', required: true,
    note: 'Лист 04: дата проверки в шапке таблицы офферов и рядом с каждым бонусом. Выводится генератором отсюда — критерий приёмки «Актуальность» прямо запрещает зашивать дату в текст руками.' },

  { path: 'payments', type: 'enum[]', values: PAYMENT_METHODS, required: true },
  { path: 'payments_withdrawal', type: 'enum[]', values: PAYMENT_METHODS, required: 'warn',
    note: 'Методы, доступные НА ВЫВОД. Почти всегда короче списка пополнения, и это ровно то, что пользователь узнаёт последним.' },
  { path: 'fees.withdrawalPct', type: 'number', min: 0, max: 100, default: 0 },
  { path: 'fees.depositPct', type: 'number', min: 0, max: 100, default: 0 },

  { path: 'payout.claimedHours', type: 'number', min: 0, required: true, nullable: true,
    note: 'Что оператор ОБЕЩАЕТ. Берётся с его же страницы условий. null, если срок ещё не сверен с первоисточником — правдоподобное число вместо null это ровно то, что лист 04 запрещает.' },
  { path: 'payout.medianHours', type: 'number', min: 0, required: true, nullable: true,
    note: 'Медиана НАШИХ замеров. Пара «заявлено / замерено» — тот самый собственный блок, которого лист 04 требует на каждой странице. null, пока замеров нет.' },
  { path: 'payout.samples', type: 'int', min: 0, required: true },
  { path: 'payout.provisional', type: 'bool', default: false,
    note: 'true = собственных замеров ещё нет. Тогда medianHours обязан быть null, samples = 0, критерий «Выплаты» не участвует в расчёте оценки, а в таблицах вместо колонки «наш замер» выводится только заявленный оператором срок с явной пометкой. Так цифра, которой у нас нет, не может случайно попасть на страницу.' },
  { path: 'payout.checkedAt', type: 'date', required: true },
  { path: 'payout.note', type: 'string', required: 'warn' },

  { path: 'limits.minWithdrawal', type: 'number', min: 0 },
  { path: 'limits.maxWithdrawalPerMonth', type: 'number', min: 0, nullable: true },
  { path: 'limits.monthlyDepositCap', type: 'number', min: 0, nullable: true },

  { path: 'games.total', type: 'int', min: 0, required: 'warn' },
  { path: 'games.slots', type: 'int', min: 0 },
  { path: 'games.tables', type: 'int', min: 0 },
  { path: 'games.jackpots', type: 'int', min: 0 },
  { path: 'providers', type: 'string[]', required: 'warn' },
  { path: 'live', type: 'enum[]', values: LIVE_GAMES, default: [] },
  { path: 'betting', type: 'enum[]', values: BETTING_MARKETS, default: [] },
  { path: 'features', type: 'enum[]', values: BRAND_FEATURES, default: [] },

  { path: 'security.twoFactor', type: 'bool', default: false },
  { path: 'security.responsibleTools', type: 'enum[]', values: RESPONSIBLE_TOOLS, required: 'warn' },

  { path: 'support.liveChat24_7', type: 'bool', required: 'warn' },
  { path: 'support.medianReplyMinutes', type: 'number', min: 0, required: 'warn' },
  { path: 'support.languages', type: 'string[]', required: 'warn' },

  { path: 'mobile.app', type: 'bool', default: false },
  { path: 'mobile.responsive', type: 'bool', default: true },

  { path: 'pros', type: 'string[]', minItems: 3, maxItems: 6, required: true },
  { path: 'cons', type: 'string[]', minItems: 2, maxItems: 5, required: true,
    note: 'Лист 04, «Честные минусы»: страница без минусов не ранжируется по complaints и is it safe. Минимум два — не декоративный.' },
  { path: 'notFor', type: 'string', required: true,
    note: 'Раздел «кому не подходит» из листа 02. Обязателен в каждой карточке бренда.' },
  { path: 'verdict', type: 'string', required: true, maxWords: 80,
    note: 'Вердикт 60 слов из листа 02. Идёт первым блоком карточки, до таблиц и бонусов.' },

  { path: 'affiliate.url', type: 'url', required: true },
  { path: 'affiliate.active', type: 'bool', default: true },

  { path: 'author', type: 'slug', required: true,
    note: 'Ссылка на data/authors.json. Лист 09: автора проверяют, и «admin» или «player» это провал приёмки.' },
  { path: 'publishedAt', type: 'date', required: true },
  { path: 'updatedAt', type: 'date', required: true },
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function typeError(path, type, value) {
  return `поле "${path}": ожидался тип ${type}, получено ${JSON.stringify(value)}`;
}

function checkValue(field, value, errors) {
  const { path, type } = field;

  if (field.nullable && value === null) return;

  switch (type) {
    case 'string':
      if (typeof value !== 'string' || value.trim() === '') errors.push(typeError(path, 'непустая строка', value));
      else if (field.maxWords) {
        const words = value.trim().split(/\s+/).length;
        if (words > field.maxWords) errors.push(`поле "${path}": ${words} слов, максимум ${field.maxWords}`);
      }
      break;

    case 'slug':
      if (typeof value !== 'string' || !SLUG_RE.test(value)) errors.push(typeError(path, 'слаг вида my-brand-1', value));
      break;

    case 'url':
      if (typeof value !== 'string' || !/^https?:\/\//.test(value)) errors.push(typeError(path, 'абсолютный URL', value));
      break;

    case 'date':
      if (typeof value !== 'string' || !DATE_RE.test(value)) errors.push(typeError(path, 'дата YYYY-MM-DD', value));
      else if (Number.isNaN(new Date(value).getTime())) errors.push(`поле "${path}": несуществующая дата ${value}`);
      break;

    case 'bool':
      if (typeof value !== 'boolean') errors.push(typeError(path, 'true/false', value));
      break;

    case 'int':
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) { errors.push(typeError(path, 'число', value)); break; }
      if (type === 'int' && !Number.isInteger(value)) errors.push(`поле "${path}": ожидалось целое, получено ${value}`);
      if (field.min != null && value < field.min) errors.push(`поле "${path}": ${value} меньше минимума ${field.min}`);
      if (field.max != null && value > field.max) errors.push(`поле "${path}": ${value} больше максимума ${field.max}`);
      break;
    }

    case 'enum':
      if (!field.values.includes(value)) {
        errors.push(`поле "${path}": значение "${value}" не из словаря. Допустимо: ${field.values.join(', ')}`);
      }
      break;

    case 'enum[]':
    case 'string[]': {
      if (!Array.isArray(value)) { errors.push(typeError(path, 'массив', value)); break; }
      if (field.minItems != null && value.length < field.minItems) {
        errors.push(`поле "${path}": ${value.length} элементов, минимум ${field.minItems}`);
      }
      if (field.maxItems != null && value.length > field.maxItems) {
        errors.push(`поле "${path}": ${value.length} элементов, максимум ${field.maxItems}`);
      }
      if (type === 'enum[]') {
        for (const item of value) {
          if (!field.values.includes(item)) {
            errors.push(`поле "${path}": "${item}" не из словаря. Допустимо: ${field.values.join(', ')}`);
          }
        }
      } else {
        for (const item of value) {
          if (typeof item !== 'string' || item.trim() === '') errors.push(`поле "${path}": элемент массива не строка — ${JSON.stringify(item)}`);
        }
      }
      break;
    }

    default:
      errors.push(`поле "${path}": неизвестный тип схемы "${type}"`);
  }
}

/**
 * Валидирует один бренд. Возвращает { errors, warnings } —
 * errors валят сборку, warnings попадают в отчёт линтера.
 */
export function validateBrand(brand, { getValue, setValue }) {
  const errors = [];
  const warnings = [];

  for (const field of BRAND_FIELDS) {
    let value = getValue(brand, field.path);

    if (value === undefined && field.default !== undefined) {
      value = Array.isArray(field.default) ? [...field.default] : field.default;
      setValue(brand, field.path, value);
    }

    if (value === undefined) {
      if (field.required === true) errors.push(`не заполнено обязательное поле "${field.path}"`);
      else if (field.required === 'warn') warnings.push(`не заполнено поле "${field.path}"`);
      continue;
    }

    checkValue(field, value, errors);
  }

  // Кросс-полевые проверки: то, что нельзя выразить типом отдельного поля.
  const withdrawal = getValue(brand, 'payments_withdrawal');
  const deposit = getValue(brand, 'payments');
  if (Array.isArray(withdrawal) && Array.isArray(deposit)) {
    const orphan = withdrawal.filter((m) => !deposit.includes(m));
    if (orphan.length) {
      errors.push(`payments_withdrawal содержит методы, которых нет в payments: ${orphan.join(', ')}`);
    }
  }

  const types = getValue(brand, 'bonus.types');
  const noDepAmount = getValue(brand, 'bonus.noDepositAmount');
  if (Array.isArray(types) && types.includes('no-deposit') && (noDepAmount == null || noDepAmount === 0)) {
    warnings.push('bonus.types содержит "no-deposit", но bonus.noDepositAmount пуст — бренд не попадёт в листинги вида «бонус N евро без депозита»');
  }

  const hasCode = getValue(brand, 'bonus.hasCode');
  const code = getValue(brand, 'bonus.code');
  if (hasCode === true && !code) errors.push('bonus.hasCode = true, но bonus.code пуст');
  if (hasCode === false && code) warnings.push('bonus.code заполнен, но bonus.hasCode = false — бренд не попадёт в листинг промокодов');

  const claimed = getValue(brand, 'payout.claimedHours');
  const median = getValue(brand, 'payout.medianHours');
  const samples = getValue(brand, 'payout.samples');
  const provisional = getValue(brand, 'payout.provisional');

  if (samples === 0 && median != null) {
    errors.push('payout.samples = 0, но payout.medianHours заполнен — медиана без замеров это выдуманная цифра (лист 04)');
  }
  if (provisional === true) {
    if (median != null) errors.push('payout.provisional = true, но payout.medianHours заполнен. Пока замеров нет, медианы быть не может');
    if (samples !== 0) errors.push('payout.provisional = true, но payout.samples не ноль');
  } else {
    if (median == null) errors.push('payout.medianHours пуст. Либо внесите медиану замеров, либо поставьте payout.provisional = true');
    if (samples === 0) errors.push('payout.samples = 0 при payout.provisional = false');
  }
  if (typeof claimed === 'number' && typeof median === 'number' && median < claimed * 0.5 && samples > 0) {
    warnings.push(`payout: замер (${median} ч) вдвое быстрее заявленного (${claimed} ч) — перепроверьте, обычно бывает наоборот`);
  }

  const status = getValue(brand, 'status');
  const affActive = getValue(brand, 'affiliate.active');
  if (status !== 'active' && affActive === true) {
    errors.push(`status = "${status}", но affiliate.active = true — ушедший с рынка бренд не должен получать партнёрские ссылки`);
  }

  const pub = getValue(brand, 'publishedAt');
  const upd = getValue(brand, 'updatedAt');
  if (pub && upd && DATE_RE.test(pub) && DATE_RE.test(upd) && upd < pub) {
    errors.push(`updatedAt (${upd}) раньше publishedAt (${pub})`);
  }

  return { errors, warnings };
}
