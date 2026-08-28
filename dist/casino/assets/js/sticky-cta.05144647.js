(function () {
'use strict';
function setup(bar, anchor) {
if (!('IntersectionObserver' in window)) return;
var observer = new IntersectionObserver(function (entries) {
var entry = entries[0];
bar.hidden = entry.isIntersecting;
}, { rootMargin: '-64px 0px 0px 0px' });
observer.observe(anchor);
}
function init(root) {
var bar = (root || document).querySelector('[data-sticky-bonus]');
var anchor = (root || document).querySelector('[data-sticky-watch]');
if (bar && anchor) setup(bar, anchor);
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', function () { init(document); });
} else {
init(document);
}
})();