# Выкладка на голый сервер (nginx)

Всё, что ниже, выполняется один раз. Дальше обновление сайта — это только
пересборка и повторная заливка `dist/`, конфиги не трогаются.

Файлы в `deploy/nginx/` генерируются сборкой. Править их руками нет смысла —
следующий `node build.js` перезапишет.

---

## 1. Папки на сервере

```bash
sudo mkdir -p /var/www/casino/public
sudo chown -R $USER:www-data /var/www/casino
sudo chmod -R 755 /var/www/casino
```

Путь задаётся в `data/site.json` → `deploy.root`. Если на сервере он другой,
меняем там и пересобираем — путь попадёт в конфиг сам.

## 2. Конфиги nginx

Оба файла кладутся в `conf.d`, а не в `sites-available`: `map` работает только
в контексте `http`, и `conf.d/*.conf` подключается именно туда.

```bash
scp deploy/nginx/*.conf user@host:/tmp/
sudo mv /tmp/00-casino-redirects.conf /tmp/10-casino-site.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` обязателен. При ошибке ничего не перезагружаем — сайт, который уже
работает, не должен падать из-за нашего конфига.

Если на сервере остался дефолтный `default_server`, он перехватит запросы:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

## 3. Сайт

```bash
node build.js --stage=content
scp -r dist/* user@host:/var/www/casino/public/
```

`dist/*` без точки в начале — `.htaccess` на nginx не нужен, и в webroot ему
делать нечего.

## 4. Проверка

```bash
curl -sI  http://ДОМЕН/                                   # 200
curl -sI  http://ДОМЕН/vergleich/                         # 200
curl -sI  http://ДОМЕН/paypal/                            # 301 → /casino-payment/paypal-casino/
curl -sI  http://ДОМЕН/paypal                             # 301, без слэша тоже
curl -sI  http://ДОМЕН/casino-payment/mastercard-casino/  # 301 → /zahlungen/
curl -sI  http://ДОМЕН/nichts-da/                         # 404
curl -s   http://ДОМЕН/robots.txt
curl -s   http://ДОМЕН/sitemap.xml | head -5
```

Ожидаемое: 66 адресов отдают 200, 233 адреса отдают 301, всё остальное 404.

---

## Что стоит знать

**Редиректов 233, ключей в map 466.** Каждый адрес записан со слэшем и без:
nginx сравнивает ключи точно, и `/paypal` без слэша иначе ушёл бы в 404.

**`map_hash_bucket_size` выставлен не для красоты.** Самый длинный ключ — 52
знака, а дефолт корзины 32 или 64 байта в зависимости от процессора. Без этой
строки nginx не стартует вообще, с сообщением про `could not build map_hash`.

**Сейчас только `listen 80`.** Для показа этого достаточно. Под боевой запуск:

```bash
sudo certbot --nginx -d ДОМЕН -d www.ДОМЕН
```

Certbot допишет 443-й блок и редирект с 80-го сам.

**Сайт закрыт от индексации.** `robots.txt` отдаёт `Disallow: /`, nginx шлёт
`X-Robots-Tag: noindex`. Так надо: авторы пока заглушки, партнёрские ссылки
ведут на тестовый домен. Пустить это в индекс — значит потом выбивать черновик
из выдачи.

Снимается в `data/site.json`:

```json
"deploy": { "demo": false }
```

Дальше пересборка и заливка. Конфиг nginx тоже перегенерируется — заголовок
`X-Robots-Tag` из него уйдёт.

**Домен.** Пока в `site.json` стоит заглушка `beste-online-casinos-de.de`, и
она уже зашита в `canonical`, `og:url` и все 66 адресов `sitemap.xml`. Меняем
домен → пересобираем → заливаем заново. Поэтому реальный домен нужен **до**
первой сборки под выкладку, а не после.
