/**
 * Сортировка таблиц. Ванильный JS, без библиотек (лист 08).
 *
 * КОНТРАКТ — только data-атрибуты, ни одного имени класса. Это сознательно:
 * вёрстка ещё не согласована, и когда придёт дизайн, менять придётся CSS,
 * а не этот файл.
 *
 *   <table data-sortable>
 *     <thead>
 *       <tr>
 *         <th data-sort="text">Casino</th>
 *         <th data-sort="number" data-sort-default="desc">Score</th>
 *         <th data-sort="date">Checked</th>
 *         <th data-sort="none">Go</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr><td data-value="19">19 h</td> ... </tr>
 *
 * data-value на ячейке — ключ сортировки. Без него берётся текст, но тогда
 * «19 h» и «7 h» сравнятся как строки и семь окажется больше девятнадцати.
 * Поэтому генератор всегда проставляет data-value для числовых колонок.
 *
 * Прогрессивное улучшение: таблица уже отсортирована на сервере и полностью
 * лежит в HTML. Без JS страница остаётся читаемой и индексируемой — лист 09
 * проверяет ровно это.
 */

(function () {
  'use strict';

  var COLLATOR = new Intl.Collator(document.documentElement.lang || 'en', {
    numeric: true,
    sensitivity: 'base',
  });

  function cellKey(row, index, type) {
    var cell = row.cells[index];
    if (!cell) return type === 'number' ? Number.NEGATIVE_INFINITY : '';

    var raw = cell.hasAttribute('data-value')
      ? cell.getAttribute('data-value')
      : cell.textContent.trim();

    if (type === 'number') {
      var num = parseFloat(String(raw).replace(',', '.'));
      // Пустые значения всегда уезжают в конец, независимо от направления:
      // «нет данных» это не «ноль» и не «бесконечность».
      return isNaN(num) ? null : num;
    }

    if (type === 'date') {
      var time = Date.parse(raw);
      return isNaN(time) ? null : time;
    }

    return String(raw);
  }

  function sortTable(table, index, type, direction) {
    var tbody = table.tBodies[0];
    if (!tbody) return;

    var rows = Array.prototype.slice.call(tbody.rows);
    var sign = direction === 'desc' ? -1 : 1;

    // Стабильность: одинаковые ключи сохраняют исходный порядок, а исходный
    // порядок это ранжирование по нашей оценке. Сортировка по «мин. депозит»
    // не должна перетасовывать казино с одинаковым депозитом случайным образом.
    rows.forEach(function (row, i) { row._i = i; });

    rows.sort(function (a, b) {
      var x = cellKey(a, index, type);
      var y = cellKey(b, index, type);

      if (x === null && y === null) return a._i - b._i;
      if (x === null) return 1;
      if (y === null) return -1;

      var result = typeof x === 'number' ? x - y : COLLATOR.compare(x, y);
      return result === 0 ? a._i - b._i : result * sign;
    });

    var fragment = document.createDocumentFragment();
    rows.forEach(function (row) {
      delete row._i;
      fragment.appendChild(row);
    });
    tbody.appendChild(fragment);
    renumber(table);
  }

  /**
   * Пересчёт позиций после сортировки и фильтрации.
   *
   * Номер в строке — это место в том списке, который человек сейчас видит.
   * Без пересчёта отсортированная по минимальному депозиту таблица выглядит
   * как 4, 1, 7, 2 — числа остаются от исходного ранжирования и читаются
   * как ошибка. Скрытые фильтром строки пропускаются, а не нумеруются.
   */
  function renumber(table) {
    var tbody = table.tBodies[0];
    if (!tbody) return;
    var n = 0;
    Array.prototype.forEach.call(tbody.rows, function (row) {
      var cell = row.querySelector('[data-rank]');
      if (!cell) return;
      if (row.hidden) {
        cell.textContent = '';
        return;
      }
      n += 1;
      cell.textContent = String(n);
    });
  }

  /**
   * Применить сортировку и рассказать о ней всем, кто должен знать.
   *
   * Единственная точка, через которую проходят оба способа сортировать —
   * клик по заголовку колонки и выбор в поле «Sortieren nach». Иначе один
   * из них обновлял бы aria-sort, а второй нет, и состояние таблицы
   * зависело бы от того, чем именно её отсортировали.
   */
  function applySort(table, headers, column, direction) {
    Array.prototype.forEach.call(headers.cells, function (other) {
      if (other.getAttribute('data-sort') && other.getAttribute('data-sort') !== 'none') {
        other.setAttribute('aria-sort', 'none');
      }
    });
    column.th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');

    sortTable(table, column.index, column.type, direction);
    table.dispatchEvent(new CustomEvent('table:sorted', {
      bubbles: true,
      detail: { column: column.index, type: column.type, direction: direction },
    }));
  }

  /**
   * Поле сортировки для узкого экрана.
   *
   * Ниже 960 px строки таблицы становятся карточками, и шапка с кнопками
   * сортировки уезжает вместе с thead. Список вариантов собирается здесь
   * из той же шапки: в разметке страницы поле приезжает пустым, потому что
   * второй список колонок разошёлся бы с первым.
   *
   * По варианту на колонку, а не по два на каждое направление: четырнадцать
   * пунктов в выпадающем списке никто не читает. Направление у каждой
   * колонки то, ради которого её сортируют, — оценку смотрят от лучшей,
   * умсатц и минимальный депозит от меньшего.
   *
   * Ни одной языковой строки: подписи направлений приходят data-атрибутами
   * из шаблона. Это тот же контракт, что и у остального файла.
   */
  function wireSelect(table, headers, columns) {
    if (!table.id || !columns.length) return;

    var select = document.querySelector('[data-sort-select][data-sort-target="#' + table.id + '"]');
    if (!select) return;

    var labels = {
      asc: select.getAttribute('data-label-asc') || '',
      desc: select.getAttribute('data-label-desc') || '',
      text: select.getAttribute('data-label-text') || '',
    };

    var active = '0';

    columns.forEach(function (column, position) {
      var direction = column.fallback;
      var hint = column.type === 'text' ? labels.text : labels[direction];
      var option = document.createElement('option');
      option.value = String(position);
      option.textContent = hint ? column.label + ' — ' + hint : column.label;
      if (column.current) {
        // defaultSelected, а не selected: поле лежит внутри формы фильтров,
        // и её кнопка «сбросить» зовёт form.reset(). Со свойством selected
        // сброс вернул бы поле к первому пункту списка, а таблица осталась
        // бы отсортированной по-прежнему — подпись начала бы врать.
        option.defaultSelected = true;
        active = String(position);
      }
      select.appendChild(option);
    });
    select.value = active;

    select.addEventListener('change', function () {
      var column = columns[Number(select.value)];
      if (column) applySort(table, headers, column, column.fallback);
    });

    // Клик по заголовку колонки на широком экране и выбор в поле на узком
    // меняют одно и то же состояние. Если окно повернуть между двумя
    // действиями, поле должно показывать то, что в таблице на самом деле.
    table.addEventListener('table:sorted', function (event) {
      for (var i = 0; i < columns.length; i++) {
        if (columns[i].index === event.detail.column) {
          active = String(i);
          if (select.value !== active) select.value = active;
          return;
        }
      }
    });

    // Сброс фильтров меняет состав строк, а не их порядок. Браузер к этому
    // моменту уже вернул полю значение по умолчанию, поэтому возвращаем то,
    // по чему таблица отсортирована на самом деле, — следующим тиком, когда
    // сброс завершён.
    if (select.form) {
      select.form.addEventListener('reset', function () {
        setTimeout(function () { select.value = active; }, 0);
      });
    }

    var field = select.closest('[data-sort-field]');
    if (field) field.hidden = false;
  }

  function setup(table) {
    var headers = table.tHead ? table.tHead.rows[0] : null;
    if (!headers) return;

    var columns = [];

    Array.prototype.forEach.call(headers.cells, function (th, index) {
      var type = th.getAttribute('data-sort');
      if (!type || type === 'none') return;

      // Кнопка, а не обработчик на <th>: клавиатура, фокус и скринридер
      // получают это бесплатно, без единого aria-костыля.
      var label = th.innerHTML;
      var button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = label;
      button.setAttribute('data-sort-button', '');
      th.innerHTML = '';
      th.appendChild(button);

      // Колонка, по которой сервер уже отсортировал список, приезжает с
      // data-sort-current и сразу получает свой aria-sort. Раньше здесь
      // всем колонкам ставилось «none», и таблица, отсортированная по
      // оценке, для скринридера выглядела неупорядоченной.
      var current = th.getAttribute('data-sort-current');
      th.setAttribute('aria-sort', current === 'asc' ? 'ascending'
        : current === 'desc' ? 'descending' : 'none');

      var column = {
        index: index,
        type: type,
        th: th,
        label: (button.textContent || '').trim(),
        fallback: th.getAttribute('data-sort-default') || (type === 'text' ? 'asc' : 'desc'),
        current: !!current,
      };
      columns.push(column);

      button.addEventListener('click', function () {
        var state = th.getAttribute('aria-sort');
        var direction = state === 'ascending' ? 'desc'
          : state === 'descending' ? 'asc'
            : column.fallback;
        applySort(table, headers, column, direction);
      });
    });

    wireSelect(table, headers, columns);
  }

  function init(root) {
    var tables = (root || document).querySelectorAll('table[data-sortable]');
    Array.prototype.forEach.call(tables, setup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }

  // renumber наружу: фильтр прячет строки и обязан пересчитать нумерацию,
  // но своей копии этой логики заводить не должен.
  window.tableSort = { init: init, renumber: renumber };
})();
