// Языки: русский и узбекский (латиница). Ключ перевода — сама русская фраза, перевод — в src/i18n_uz.js.
// В фразах можно подставлять значения: t('Заказ #{id} принят', { id: 1001 }).
// Работает и в приложении (текущий язык), и на сервере (tr(lang, ...) — сообщения бота клиенту).
import { UZ } from './i18n_uz.js';

export const LANGS = { ru: 'Русский', uz: "O'zbekcha" };
const DICT = { uz: UZ };
let current = 'ru';

export const getLang = () => current;
export function setLang(lang) {
  current = LANGS[lang] ? lang : 'ru';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}
// Язык по умолчанию из Telegram (language_code): uz → узбекский, остальное → русский
export const langFromCode = (code) => (String(code || '').toLowerCase().startsWith('uz') ? 'uz' : 'ru');

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);
export const tr = (lang, ru, vars) => fill(lang !== 'ru' && DICT[lang]?.[ru] != null ? DICT[lang][ru] : ru, vars);
export const t = (ru, vars) => tr(current, ru, vars);

// Склонение: по-русски три формы, по-узбекски слово не меняется
export function tn(n, one, few, many, uz, lang = current) {
  if (lang === 'uz') return uz ?? one;
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Название из меню на текущем языке: name / nameUz, note / noteUz
export const nm = (x, field = 'name', lang = current) => (x ? (lang === 'uz' && x[`${field}Uz`]) || x[field] || '' : '');
