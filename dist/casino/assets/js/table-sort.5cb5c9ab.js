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
table.addEventListener('table:sorted', function (event) {
for (var i = 0; i < columns.length; i++) {
if (columns[i].index === event.detail.column) {
active = String(i);
if (select.value !== active) select.value = active;
return;
}
}
});
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
var label = th.innerHTML;
var button = document.createElement('button');
button.type = 'button';
button.innerHTML = label;
button.setAttribute('data-sort-button', '');
th.innerHTML = '';
th.appendChild(button);
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
window.tableSort = { init: init, renumber: renumber };
})();