// Режим разработки: пересборка при изменении файлов в src/ + локальный сервер
import http from 'http';
import fs from 'fs';
import path from 'path';
import { build } from './build.mjs';

const PORT = Number(process.env.PORT) || 5173;
let version = Date.now();

async function rebuild() {
  try { await build(); version = Date.now(); }
  catch (e) { console.error('✖ Ошибка сборки:\n', e.message); }
}

await rebuild();

let timer;
fs.watch('src', { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 120);
});

// Простой live-reload: страница опрашивает /__version и перезагружается после пересборки
const reloadSnippet = `<script>(function(){var v=null;setInterval(function(){fetch('/__version').then(function(r){return r.text()}).then(function(t){if(v&&v!==t)location.reload();v=t}).catch(function(){})},800)})();</script>`;

http.createServer((req, res) => {
  if (req.url === '/__version') { res.end(String(version)); return; }
  const file = path.join('dist', req.url.startsWith('/staff') ? 'staff.html' : 'index.html'); // /staff — касса (без API сервера только интерфейс)
  const html = fs.readFileSync(file, 'utf8').replace('</body>', reloadSnippet + '</body>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}).listen(PORT, () => console.log(`▶ BurgerLab: http://localhost:${PORT}`));
