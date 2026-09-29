// Интеграция с Telegram Mini App.
// Вне Telegram (обычный браузер) все функции безопасно ничего не делают — приложение работает в демо-режиме.

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
export const inTelegram = !!(tg && tg.initData);
export const CONFIG = (typeof window !== 'undefined' && window.BL_CONFIG) || {};

const supports = (v) => !!tg && typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast(v);

function applyTheme() {
  const dark = tg.colorScheme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const bg = dark ? '#0F0F0F' : '#FFFFFF';
  try {
    if (supports('6.1')) { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); }
    if (supports('7.10')) tg.setBottomBarColor(bg);
  } catch { /* старые клиенты */ }
}

export function initTelegram() {
  if (!inTelegram) return;
  document.documentElement.classList.add('in-tg');
  tg.ready();
  tg.expand();
  try { if (supports('7.7')) tg.disableVerticalSwipes(); } catch { /* ignore */ }
  try { if (supports('6.2')) tg.enableClosingConfirmation(); } catch { /* ignore */ }
  applyTheme();
  tg.onEvent('themeChanged', applyTheme);
}

export const tgUser = () => (inTelegram ? tg.initDataUnsafe?.user || null : null);
export const startParam = () => (inTelegram ? tg.initDataUnsafe?.start_param || '' : '');

export function haptic(kind = 'light') {
  if (!inTelegram || !supports('6.1')) return;
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind);
    else if (kind === 'select') tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred(kind);
  } catch { /* ignore */ }
}

// Кнопка «Назад» в шапке Telegram
let backHandler = null;
export function setBackButton(visible, onClick) {
  if (!inTelegram || !supports('6.1')) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = null;
  if (visible) {
    backHandler = onClick;
    tg.BackButton.onClick(backHandler);
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

// Ссылка, которая откроет рецепт прямо в Mini App: t.me/<бот>?startapp=<код>
export function miniAppLink(code) {
  if (!CONFIG.botUsername) return '';
  const base = CONFIG.appName ? `https://t.me/${CONFIG.botUsername}/${CONFIG.appName}` : `https://t.me/${CONFIG.botUsername}`;
  return `${base}?startapp=${code}`;
}

export function shareToTelegram(url, text) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (inTelegram) tg.openTelegramLink(share);
  else window.open(share, '_blank', 'noopener');
}

export function openExternal(url) {
  if (inTelegram) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

// Номер телефона из профиля Telegram (пользователь подтверждает отправку)
export function requestPhone() {
  return new Promise((resolve) => {
    if (!inTelegram || !supports('6.9')) return resolve(null);
    try { tg.requestContact((ok, r) => resolve(ok ? r?.responseUnsafe?.contact?.phone_number || null : null)); }
    catch { resolve(null); }
  });
}

// Геолокация: LocationManager Telegram (Bot API 8.0+), иначе браузерная
export function getLocation() {
  return new Promise((resolve, reject) => {
    const viaBrowser = () => {
      if (!navigator.geolocation) return reject(new Error('Геолокация недоступна на этом устройстве'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => reject(new Error(e.code === 1 ? 'Доступ к геолокации запрещён' : 'Не удалось определить местоположение')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    };
    const lm = inTelegram && supports('8.0') ? tg.LocationManager : null;
    if (!lm) return viaBrowser();
    try {
      lm.init(() => {
        if (!lm.isLocationAvailable) return viaBrowser();
        lm.getLocation((d) => {
          if (d) return resolve({ lat: d.latitude, lng: d.longitude });
          if (lm.isAccessRequested && !lm.isAccessGranted) { lm.openSettings(); return reject(new Error('Разрешите доступ к геолокации в настройках Telegram')); }
          reject(new Error('Не удалось определить местоположение'));
        });
      });
    } catch { viaBrowser(); }
  });
}

// ── API сервера бота ──
// Ошибка сети — status 0 (заказ можно отправить повторно), ошибка сервера — его код и сообщение
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${CONFIG.apiBase || ''}/api${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg?.initData || '', ...(opts.headers || {}) },
    });
  } catch {
    throw Object.assign(new Error('Нет соединения с сервером'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Ошибка сервера (${res.status})`), { status: res.status, code: data.code, cids: data.cids, retry: data.retry });
  return data;
}

export const apiConfig = (signal) => api('/config', { signal });
export const apiCreateOrder = (payload) => api('/orders', { method: 'POST', body: JSON.stringify(payload) });
export const apiGetOrder = (id) => api(`/orders/${id}`);
export const apiMe = () => api('/me');
