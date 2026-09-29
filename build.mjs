import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { ICON_NAMES } from './src/icons.js';

// Сборка: src/ → dist/*.html (каждая страница — один самодостаточный файл: HTML + CSS + JS)
//   dist/index.html — приложение для клиентов (Telegram Mini App и веб-версия)
//   dist/staff.html — касса и админ-панель для сотрудников (открывается по адресу /staff)
const OUT_DIR = 'dist';

// Шрифт иконок Material Symbols: только нужные иконки (Google требует список по алфавиту)
const ICONS_URL = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${[...new Set(ICON_NAMES)].sort().join(',')}&display=block`;

// Предупреждение, если в коде есть иконка не из списка (иначе она не отобразится)
function checkIcons() {
  const known = new Set(ICON_NAMES);
  const re = /(?:<Icon[^>]*\bname=["']|\b(?:icon|ms):\s*['"])([a-z0-9_]+)['"]/g;
  for (const f of fs.readdirSync('src').filter((x) => /\.(jsx?|mjs)$/.test(x))) {
    for (const m of fs.readFileSync(path.join('src', f), 'utf8').matchAll(re)) {
      if (!known.has(m[1])) console.warn(`⚠ ${f}: иконки «${m[1]}» нет в src/icons.js`);
    }
  }
}

const PAGES = [
  {
    entry: 'src/App.jsx', out: 'index.html',
    title: 'BurgerLab — твой бургер. Твои правила.',
    head: `<meta name="description" content="Собери бургер по слоям, смотри цену, вес, калории и высоту в реальном времени и закажи свою комбинацию.">
<meta name="theme-color" content="#FCF9F5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F0F0F" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="BurgerLab">
<!-- Telegram Mini App SDK (вне Telegram просто не используется) -->
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<!--BL_CONFIG-->`,
  },
  {
    entry: 'src/staffMain.jsx', out: 'staff.html',
    title: 'BurgerLab — касса',
    head: `<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0F0F0F">
<!--BL_CONFIG-->`,
  },
];

async function buildPage(p, css) {
  const r = await esbuild.build({ entryPoints: [p.entry], bundle: true, minify: true, format: 'iife', write: false, target: ['es2019','safari14'], define: { 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic', loader: { '.js': 'jsx' } });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${p.title}</title>
${p.head}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Unbounded:wght@500;600;700;800&display=swap" rel="stylesheet">
<link href="${ICONS_URL}" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;
  const file = path.join(OUT_DIR, p.out);
  fs.writeFileSync(file, html);
  console.log(`✔ ${file} — ${(html.length / 1024).toFixed(0)} KB`);
}

export async function build() {
  checkIcons();
  const css = fs.readFileSync('src/styles.css', 'utf8');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const p of PAGES) await buildPage(p, css);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build();
}
