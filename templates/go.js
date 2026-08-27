/**
 * Точка выхода на оффер: /go/[brand]/
 *
 * Отдельной страницей, а не прямой ссылкой из шаблонов, по трём причинам:
 * целевой URL меняется в одном месте на весь сайт, клики можно считать без
 * стороннего скрипта, и эти адреса легко держать вне индекса.
 *
 * noindex + nofollow + Disallow в robots.txt. Страница не появляется в
 * sitemap.xml и не участвует в подсчёте входящих ссылок.
 */

import { esc } from '../lib/render.js';
import { urlJoin } from '../lib/util.js';

export function render(ctx, page) {
  const { site } = ctx;
  const { brand } = page.data;
  const target = brand.affiliate.url;

  return `<!doctype html>
<html lang="${esc(site.lang)}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="origin">
<title>${esc(brand.name)}</title>
<link rel="canonical" href="${esc(site.domain)}${esc(ctx.staticUrls.compare ?? urlJoin())}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<style>body{font:16px system-ui,sans-serif;background:#12141a;color:#e8eaf0;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}a{color:#4ea1ff}</style>
</head>
<body>
<p>Opening ${esc(brand.name)}…</p>
<p><a href="${esc(target)}" rel="${esc(site.affiliate.rel)}" data-affiliate="${esc(brand.slug)}">Continue to ${esc(brand.name)}</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
}
