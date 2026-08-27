(function () {
'use strict';
function setup(menu) {
var scrim = null;
function addScrim() {
if (scrim) return;
scrim = document.createElement('button');
scrim.type = 'button';
scrim.className = 'menu__scrim';
scrim.tabIndex = -1;
scrim.setAttribute('aria-hidden', 'true');
scrim.addEventListener('click', close);
document.body.appendChild(scrim);
}
function removeScrim() {
if (!scrim) return;
scrim.remove();
scrim = null;
}
function close() {
menu.open = false;
}
menu.addEventListener('toggle', function () {
if (menu.open) addScrim();
else removeScrim();
});
menu.addEventListener('click', function (event) {
if (event.target.closest('a')) close();
});
document.addEventListener('keydown', function (event) {
if (event.key !== 'Escape' || !menu.open) return;
close();
var summary = menu.querySelector('summary');
if (summary) summary.focus();
});
window.addEventListener('orientationchange', close);
}
function collapseFilters(root) {
if (!window.matchMedia || !window.matchMedia('(max-width: 640px)').matches) return;
var wraps = (root || document).querySelectorAll('.filters-wrap[open]');
Array.prototype.forEach.call(wraps, function (wrap) { wrap.open = false; });
}
function init(root) {
collapseFilters(root);
var menus = (root || document).querySelectorAll('[data-menu]');
Array.prototype.forEach.call(menus, setup);
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', function () { init(document); });
} else {
init(document);
}
})();