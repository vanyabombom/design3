/**
 * Отпечатки статики.
 *
 * Проблема, которую это решает. Ассеты отдаются с длинным сроком жизни и
 * пометкой immutable — так и надо, иначе каждая страница тянет CSS заново.
 * Но пока имя файла постоянно, «immutable» становится обещанием, которого мы
 * не сдерживаем: выкатили новую вёрстку, а у всех, кто заходил раньше, ещё
 * месяц лежит старый main.css, и сайт у них выглядит как до правок. Ровно это
 * и случилось после первой выкладки.
 *
 * Лечится не чисткой кэша (чистить нечего — статика, никакого серверного кэша
 * нет), а именем файла. В имя уходит восемь знаков хэша содержимого:
 *
 *     assets/css/main.css  →  /assets/css/main.9f3c1a20.css
 *
 * Содержимое поменялось — поменялось имя — браузер идёт за новым адресом,
 * которого у него в кэше нет. Старый адрес больше никто не запрашивает.
 * Теперь «immutable» правда: под конкретным адресом лежит ровно один вариант
 * файла и он не изменится никогда.
 *
 * Отпечаток получают только CSS и JS. Картинки и шрифты — нет: на них
 * ссылаются данные (brand.logo), а данные не должны знать про хэши сборки.
 * Им в nginx выставлен обычный срок с перепроверкой.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { minifyAsset } from './minify.js';

/** Какие расширения versionируем. Остальное копируется как есть. */
const FINGERPRINTED = new Set(['.css', '.js']);

/** Длина отпечатка. Восьми знаков sha256 хватает: коллизия здесь не опасна. */
const HASH_LENGTH = 8;

/**
 * Читает папку ассетов и раскладывает содержимое по плану выкладки.
 *
 * Возвращает:
 *   files — что и куда писать, с уже прочитанным содержимым;
 *   map   — исходный адрес → адрес с отпечатком, для шаблонов.
 *
 * Оба адреса без basePath: префикс подпапки навешивается позже, в одной
 * точке, как и все остальные адреса на сайте.
 */
export async function planAssets(dir, { minify = true } = {}) {
  const files = [];
  const map = new Map();

  for (const rel of await walk(dir)) {
    // Минификация до подсчёта отпечатка: имя файла должно зависеть от
    // того, что реально уедет в dist, иначе правка комментария в исходнике
    // сменит адрес, а содержимое останется прежним.
    const raw = await readFile(path.join(dir, rel));
    const posix = rel.split(path.sep).join('/');
    const ext = path.extname(posix);

    // Через строку прогоняем только текст. Картинка, прочитанная как utf8,
    // возвращается уже не картинкой: каждый байт, не складывающийся в
    // допустимый символ, превращается в U+FFFD, и файл распухает и портится.
    // До появления логотипов в assets/img/ здесь просто нечего было ломать.
    const isText = FINGERPRINTED.has(ext);
    const content = minify && isText
      ? Buffer.from(minifyAsset(posix, raw.toString('utf8')), 'utf8')
      : raw;

    const outRel = FINGERPRINTED.has(ext)
      ? `${posix.slice(0, -ext.length)}.${hash(content)}${ext}`
      : posix;

    files.push({ outRel, content });
    map.set(`/assets/${posix}`, `/assets/${outRel}`);
  }

  return { files, map };
}

/** Пишет запланированное в выходную папку. */
export async function writeAssets(files, outDir) {
  for (const file of files) {
    const target = path.join(outDir, ...file.outRel.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  return files.length;
}

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, HASH_LENGTH);
}

async function walk(dir, prefix = '') {
  let entries;
  try {
    entries = await readdir(path.join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const entry of entries) {
    const rel = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...await walk(dir, rel));
    else out.push(rel);
  }
  return out;
}
