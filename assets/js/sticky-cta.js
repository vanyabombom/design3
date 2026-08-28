/**
 * Плавающая плашка с бонусом (Sticky/Floating Bar из брифа). Ванильный JS,
 * без библиотек (лист 08), только на странице казино.
 *
 * КОНТРАКТ — data-атрибуты, ни одного имени класса:
 *
 *   <p data-sticky-watch>…основной CTA над сгибом…</p>
 *   …
 *   <div data-sticky-bonus hidden>…плавающая плашка…</div>
 *
 * Плашка держится скрытой (атрибут hidden уже стоит в разметке — см.
 * stickyBonusBar() в _lib/layout.js), пока основной CTA виден во вьюпорте.
 * Как только он уходит за верхний край при прокрутке вниз, наблюдатель
 * снимает hidden; когда человек прокручивает обратно и CTA снова виден —
 * прячет плашку опять. Без IntersectionObserver (очень старый браузер)
 * скрипт просто ничего не делает: основной CTA и так на первом экране,
 * плашка без него не нужна.
 */

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
