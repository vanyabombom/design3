/**
 * Фильтры листинга. Ванильный JS, без библиотек (лист 08).
 *
 * Лист 05, «Отсутствие фильтров на листингах»: 200 страниц-листингов, но
 * пользователь не может отсортировать внутри. Решение — фильтр по бонусу,
 * минимальному депозиту, скорости вывода и лицензии прямо на странице.
 *
 * КОНТРАКТ — только data-атрибуты, ни одного имени класса, чтобы вёрстку
 * можно было заменить целиком, не трогая этот файл.
 *
 *   <form data-filter-form data-filter-target="#offers">
 *     <select data-filter-field="license" data-filter-op="eq">
 *       <option value="">Any</option>
 *       <option value="MGA">MGA</option>
 *     </select>
 *     <input type="checkbox" data-filter-field="bonus-type" data-filter-op="includes" value="no-deposit">
 *     <output data-filter-count></output>
 *     <button type="button" data-filter-reset>Reset</button>
 *   </form>
 *
 *   <div data-filter-empty="#offers" hidden>
 *     Nichts gefunden.
 *     <button type="button" form="filters-offers" data-filter-reset>Reset</button>
 *   </div>
 *
 *   <table id="offers">
 *     <tbody>
 *       <tr data-row
 *           data-f-license="MGA"
 *           data-f-min-deposit="20"
 *           data-f-payout-speed="19"
 *           data-f-bonus-type="welcome,free-spins">
 *
 * Внутри одного поля несколько отмеченных значений работают как ИЛИ,
 * разные поля — как И. Это то, чего ждёт пользователь: «PayPal или Skrill,
 * но обязательно с лицензией MGA».
 *
 * Прогрессивное улучшение: без JS видны все строки. Фильтр ничего не
 * подгружает и не рисует — только переключает hidden у существующих строк,
 * поэтому весь контент остаётся в HTML и индексируется (лист 09).
 */

(function () {
  'use strict';

  var OPS = {
    eq: function (rowValue, wanted) {
      return wanted.some(function (w) { return rowValue === w; });
    },
    lte: function (rowValue, wanted) {
      var num = parseFloat(rowValue);
      if (isNaN(num)) return false;
      return wanted.some(function (w) { return num <= parseFloat(w); });
    },
    gte: function (rowValue, wanted) {
      var num = parseFloat(rowValue);
      if (isNaN(num)) return false;
      return wanted.some(function (w) { return num >= parseFloat(w); });
    },
    includes: function (rowValue, wanted) {
      var list = String(rowValue || '').split(',');
      return wanted.some(function (w) { return list.indexOf(w) !== -1; });
    },
    includesAll: function (rowValue, wanted) {
      var list = String(rowValue || '').split(',');
      return wanted.every(function (w) { return list.indexOf(w) !== -1; });
    },
  };

  /** Собирает активные условия: { field: { op, values: [...] } } */
  function readCriteria(form) {
    var criteria = {};
    var controls = form.querySelectorAll('[data-filter-field]');

    Array.prototype.forEach.call(controls, function (control) {
      var field = control.getAttribute('data-filter-field');
      var op = control.getAttribute('data-filter-op') || 'eq';
      var value = null;

      if (control.type === 'checkbox' || control.type === 'radio') {
        if (control.checked) value = control.value;
      } else if (control.value !== '') {
        value = control.value;
      }

      if (value === null || value === '') return;

      if (!criteria[field]) criteria[field] = { op: op, values: [] };
      criteria[field].values.push(value);
    });

    return criteria;
  }

  function rowMatches(row, criteria) {
    for (var field in criteria) {
      if (!Object.prototype.hasOwnProperty.call(criteria, field)) continue;

      var rule = criteria[field];
      var attr = row.getAttribute('data-f-' + field);
      var fn = OPS[rule.op];

      if (!fn) {
        // Неизвестная операция не должна тихо прятать все строки:
        // лучше показать лишнее, чем пустой список без объяснения.
        continue;
      }
      if (attr === null) return false;
      if (!fn(attr, rule.values)) return false;
    }
    return true;
  }

  /**
   * Кнопки сброса. Их две: одна в панели фильтров, вторая — в сообщении
   * «ничего не найдено». Вторая лежит вне <form> и связана с ней атрибутом
   * form, поэтому querySelector по форме её не видит, а form.elements —
   * видит: это и есть список её органов управления по спецификации.
   *
   * Вторая кнопка нужна там, где первой не видно. На телефоне панель
   * фильтров свёрнута, и человек, отфильтровавший список до нуля, видел
   * только текст «сбросьте фильтры» без единой кнопки рядом.
   */
  function resetButtons(form) {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.hasAttribute && el.hasAttribute('data-filter-reset');
    });
  }

  /**
   * Сообщение «ничего не найдено».
   *
   * Ищется по селектору своей таблицы: data-filter-empty="#offers". Раньше
   * его искали среди детей target.parentNode, то есть внутри обёртки
   * прокрутки, а лежит оно снаружи, рядом с формой, — и не находилось
   * никогда. Отфильтровав список до нуля, человек видел пустую таблицу
   * и ни строчки о том, почему она пустая.
   *
   * Второй проход оставлен для разметки без селектора: там правило прежнее,
   * сосед таблицы или её обёртки.
   */
  function emptyNote(selector, target) {
    if (selector) {
      var byTarget = document.querySelector('[data-filter-empty="' + selector + '"]');
      if (byTarget) return byTarget;
    }
    var scope = target.parentNode;
    while (scope && scope.querySelector) {
      var found = scope.querySelector('[data-filter-empty]');
      if (found) return found;
      scope = scope.parentNode;
    }
    return null;
  }

  /**
   * Чип «отфильтровано по Hacksaw Gaming».
   *
   * Приходит по ссылке из таблицы раздела: у категорий ниже порога своей
   * страницы нет, и строка ведёт в общий каталог с ?term=<слаг>. Само
   * условие живёт в скрытом поле формы и работает обычным механизмом
   * фильтра; чип нужен, чтобы человек видел, почему из восемнадцати строк
   * осталось восемь, и мог вернуть остальные одним нажатием.
   *
   * Подпись берётся из карты, выложенной сборкой, а не из адресной строки.
   * В адресе только слаг: показывать на странице текст, пришедший из URL,
   * значит открывать отражённую инъекцию, и textContent тут спасает не
   * всегда — а карта закрывает вопрос целиком.
   */
  function contextChip(form, criteria) {
    var chip = document.querySelector('[data-context-filter]');
    if (!chip) return;

    var rule = criteria.term;
    var slug = rule && rule.values.length ? rule.values[0] : null;
    if (!slug) {
      chip.hidden = true;
      return;
    }

    var target = chip.querySelector('[data-context-label]');
    if (target) target.textContent = termLabels()[slug] || slug;
    chip.hidden = false;
  }

  /** Карта «слаг категории → подпись». Читается один раз за загрузку. */
  var TERM_LABELS = null;

  function termLabels() {
    if (TERM_LABELS) return TERM_LABELS;
    var holder = document.querySelector('[data-term-labels]');
    try {
      TERM_LABELS = holder ? (JSON.parse(holder.textContent) || {}) : {};
    } catch (error) {
      TERM_LABELS = {};
    }
    return TERM_LABELS;
  }

  function apply(form) {
    var selector = form.getAttribute('data-filter-target');
    var target = selector ? document.querySelector(selector) : document;
    if (!target) return;

    var rows = target.querySelectorAll('[data-row]');
    var criteria = readCriteria(form);
    var visible = 0;

    Array.prototype.forEach.call(rows, function (row) {
      var show = rowMatches(row, criteria);
      row.hidden = !show;
      if (show) visible++;
    });

    // Нумерация строк принадлежит таблице, а не фильтру: после того как
    // часть строк скрыта, оставшиеся должны идти 1, 2, 3, а не сохранять
    // дырки от исходного ранжирования.
    if (window.tableSort && target.tBodies) window.tableSort.renumber(target);

    var counter = form.querySelector('[data-filter-count]');
    if (counter) counter.textContent = String(visible);

    var empty = emptyNote(selector, target);
    if (empty) empty.hidden = visible > 0;

    // Кнопка в панели отвечает за поля панели. Условие, пришедшее ссылкой из
    // таблицы раздела, живёт в скрытом поле и снимается своей кнопкой в чипе:
    // без этого при всех четырёх селектах на «Alle» рядом с ними висело
    // «Filter zurücksetzen» и сбрасывать было нечего.
    var panelFields = Object.keys(criteria).filter(function (field) { return field !== 'term'; });
    var idle = panelFields.length === 0;
    Array.prototype.forEach.call(form.querySelectorAll('[data-filter-reset]'), function (reset) {
      reset.hidden = idle;
    });
    contextChip(form, criteria);

    if (form.hasAttribute('data-filter-sync-url')) syncUrl(form, criteria);

    form.dispatchEvent(new CustomEvent('filters:applied', {
      bubbles: true,
      detail: { visible: visible, total: rows.length, criteria: criteria },
    }));
  }

  /**
   * Состояние фильтров в адресной строке. Нужно, чтобы отфильтрованную
   * подборку можно было переслать ссылкой. history.replaceState, а не
   * pushState: каждый чих чекбокса не должен засорять кнопку «назад».
   */
  function syncUrl(form, criteria) {
    var params = new URLSearchParams();
    for (var field in criteria) {
      if (!Object.prototype.hasOwnProperty.call(criteria, field)) continue;
      criteria[field].values.forEach(function (value) { params.append(field, value); });
    }
    var query = params.toString();
    history.replaceState(null, '', query ? '?' + query : location.pathname);
  }

  function restoreFromUrl(form) {
    var params = new URLSearchParams(location.search);
    if (![].concat(Array.from(params.keys())).length) return;

    var controls = form.querySelectorAll('[data-filter-field]');
    Array.prototype.forEach.call(controls, function (control) {
      var values = params.getAll(control.getAttribute('data-filter-field'));
      if (!values.length) return;
      if (control.type === 'checkbox' || control.type === 'radio') {
        control.checked = values.indexOf(control.value) !== -1;
      } else {
        control.value = values[0];
      }
    });
  }

  function setup(form) {
    if (form.hasAttribute('data-filter-sync-url')) restoreFromUrl(form);

    form.addEventListener('change', function () { apply(form); });
    form.addEventListener('submit', function (event) { event.preventDefault(); });

    resetButtons(form).forEach(function (reset) {
      reset.addEventListener('click', function () {
        form.reset();
        Array.prototype.forEach.call(form.querySelectorAll('[data-filter-field]'), function (control) {
          if (control.type === 'checkbox' || control.type === 'radio') control.checked = false;
          else control.value = '';
        });
        apply(form);
      });
    });

    apply(form);
  }

  function init(root) {
    var forms = (root || document).querySelectorAll('[data-filter-form]');
    Array.prototype.forEach.call(forms, setup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }

  window.listingFilters = { init: init, apply: apply };
})();
