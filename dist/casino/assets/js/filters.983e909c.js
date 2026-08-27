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
continue;
}
if (attr === null) return false;
if (!fn(attr, rule.values)) return false;
}
return true;
}
function resetButtons(form) {
return Array.prototype.filter.call(form.elements, function (el) {
return el.hasAttribute && el.hasAttribute('data-filter-reset');
});
}
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
if (window.tableSort && target.tBodies) window.tableSort.renumber(target);
var counter = form.querySelector('[data-filter-count]');
if (counter) counter.textContent = String(visible);
var empty = emptyNote(selector, target);
if (empty) empty.hidden = visible > 0;
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