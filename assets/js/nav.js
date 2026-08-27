/**
 * Меню в шапке. Ванильный JS, без библиотек (лист 08).
 *
 * КОНТРАКТ — только data-атрибуты, ни одного имени класса:
 *
 *   <details data-menu>
 *     <summary>…кнопка…</summary>
 *     <nav>…панель…</nav>
 *   </details>
 *
 * Само раскрытие делает <details>, а не скрипт. Это принципиально: без JS
 * меню всё равно открывается, закрывается и доступно с клавиатуры, потому
 * что этим занимается браузер. Скрипт добавляет только то, чего у <details>
 * нет из коробки и без чего меню раздражает:
 *
 *   — закрытие по Esc;
 *   — закрытие по клику мимо панели;
 *   — закрытие при переходе по ссылке внутри панели (иначе на мобильном
 *     панель остаётся раскрытой поверх новой страницы при возврате назад);
 *   — подложка, чтобы клик мимо ловился и на тач-устройствах, где click
 *     по <body> приходит не всегда.
 */

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

    // Панель на узком экране раскрывается на всю ширину, на широком — падает
    // карточкой из кнопки. При смене ориентации открытое меню оказывается
    // в промежуточном состоянии, поэтому просто закрываем.
    window.addEventListener('orientationchange', close);
  }

  /**
   * Фильтры на узком экране свёрнуты по умолчанию.
   *
   * Разметка приходит раскрытой, потому что на широком экране фильтры должны
   * быть видны сразу, а <details open> — единственный способ добиться этого
   * без JS. Свернуть его обратно можно только скриптом: open это атрибут,
   * CSS до него не дотягивается.
   *
   * Закрываем один раз при загрузке и больше не трогаем: если человек
   * раскрыл фильтры и повернул телефон, схлопывать их у него под рукой —
   * это не помощь.
   */
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
