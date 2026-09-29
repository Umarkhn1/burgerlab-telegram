// Проверка подписи Telegram Mini App (initData).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import crypto from 'crypto';

const MAX_AGE_SEC = 24 * 60 * 60; // initData действителен сутки

export function validateInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && user.id ? { user, startParam: params.get('start_param') || '' } : null;
  } catch {
    return null;
  }
}

// ── Сотрудники: пароли и токены входа в кассу и админ-панель ──
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(password), salt, 32).toString('hex')}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(String(password), salt, 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Токен без хранения на сервере: payload.подпись. ver меняется при смене пароля или роли — старые токены перестают работать.
const b64 = (s) => Buffer.from(s).toString('base64url');
export function signToken(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifyToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
