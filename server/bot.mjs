// Telegram-бот BurgerLab на grammY.
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { getOrder, ordersOfUser, todayStats, getUser, saveUser, tgRole, tgStaffIds, findUserByUsername, applyReferral, cutletsOf } from './store.mjs';
import { kitchenText, customerText, orderShortLine, changeStatus, esc } from './orders.mjs';
import { STATUSES, CANCEL_REASONS, SETTINGS } from '../src/data.js';
import { tr, langFromCode, LANGS } from '../src/i18n.js';
import { fmtPrice, nextStatus, isClosed, normPhone, fmtPhone, validPhone, zoneFor } from '../src/calc.js';

// Адрес по координатам (OpenStreetMap Nominatim). Не получилось — вернём '' и адрес уточнят в приложении.
async function reverseGeocode({ lat, lng }) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ru`, {
      headers: { 'User-Agent': 'BurgerLab-bot/1.0' }, signal: AbortSignal.timeout(4000),
    });
    const a = (await r.json()).address || {};
    const city = a.city || a.town || a.village || a.state || '';
    const street = [a.road || a.pedestrian || a.neighbourhood || a.suburb, a.house_number].filter(Boolean).join(', ');
    return [city, street].filter(Boolean).join(', ');
  } catch { return ''; }
}

export function createBot({ token, webappUrl, kitchenChatId, apiRoot }) {
  const bot = new Bot(token, apiRoot ? { client: { apiRoot } } : undefined);
  // Персонал: владельцы (ADMIN_IDS), сотрудники из админ-панели и участники группы кухни
  const isStaff = (ctx) => !!tgRole(ctx.from?.id) || (kitchenChatId && String(ctx.chat?.id) === String(kitchenChatId));
  const actor = (ctx) => ({ name: ctx.from.first_name, by: `Telegram: ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}` });

  const appMenuButton = { type: 'web_app', text: '🍔 BurgerLab', web_app: { url: webappUrl } };
  const isAdmin = (ctx) => tgRole(ctx.from?.id) === 'admin';
  // Язык клиента: выбранный в боте или приложении, иначе по языку Telegram
  const langOfId = (id, code) => getUser(id)?.lang || langFromCode(code);
  const L = (ctx) => langOfId(ctx.from?.id, ctx.from?.language_code);
  const T = (ctx, s, v) => tr(L(ctx), s, v);
  // Сотрудникам — вторая кнопка: сразу в панель внутри Mini App
  const openAppKb = (ctx, text) => {
    const kb = new InlineKeyboard().webApp(text || T(ctx, '🍔 Собрать бургер'), webappUrl);
    const role = ctx && tgRole(ctx.from?.id);
    return role ? kb.row().webApp(role === 'admin' ? '🛠 Админ-панель' : '🧾 Касса и кухня', `${webappUrl}?panel=1`) : kb;
  };

  // Запоминаем никнейм и имя каждого, кто пишет боту: по @username сотрудника можно найти в админ-панели
  bot.use(async (ctx, next) => {
    const f = ctx.from;
    if (f && !f.is_bot && ctx.chat?.type === 'private') {
      const u = getUser(f.id);
      const tgName = [f.first_name, f.last_name].filter(Boolean).join(' ');
      if (!u || u.username !== (f.username || '') || u.tgName !== tgName) saveUser(f.id, { username: f.username || '', tgName });
    }
    return next();
  });

  // ── Клиент ──
  // /start: язык (если ещё не выбран) → номер телефона → геолокация → кнопка Mini App.
  // Данные сохраняются на сервере, и приложение подставляет их в заказ само (GET /api/me).
  const contactKb = (ctx) => new Keyboard().requestContact(T(ctx, '📱 Поделиться номером')).resized().persistent();
  const locationKb = (ctx) => new Keyboard().requestLocation(T(ctx, '📍 Отправить геолокацию')).resized().persistent();
  const langKb = () => new InlineKeyboard().text("🇺🇿 O'zbekcha", 'lang:uz').text('🇷🇺 Русский', 'lang:ru');
  const welcome = (ctx) => T(ctx, 'Привет, {name}! 👋\n\n<b>BurgerLab — твой бургер. Твои правила.</b>\n\nСобирай бургер по слоям или выбирай готовое из меню. Цена, вес и калории считаются сразу 🔥', { name: esc(ctx.from?.first_name || T(ctx, 'друг')) });
  const missing = (u) => (!u?.phone ? 'phone' : !u?.location ? 'location' : null);

  const askPhone = (ctx, text) => ctx.reply(text || T(ctx, 'Чтобы оформлять заказы, поделись номером телефона — кнопка внизу 👇'), { parse_mode: 'HTML', reply_markup: contactKb(ctx) });
  const askLocation = (ctx, text) => ctx.reply(text || T(ctx, 'Теперь отправь геолокацию — по ней мы определим адрес и посчитаем доставку 👇\n\n<i>Можно отправить и другую точку: 📎 → Геопозиция.</i>'), { parse_mode: 'HTML', reply_markup: locationKb(ctx) });
  const ask = (ctx, step, text) => (step === 'phone' ? askPhone(ctx, text) : askLocation(ctx, text));
  const enableMenuApp = (ctx) => ctx.api.setChatMenuButton({ chat_id: ctx.chat.id, menu_button: appMenuButton }).catch(() => {});

  // Всё собрано: убрать клавиатуру, показать кнопку приложения и включить кнопку меню в этом чате
  async function ready(ctx, u) {
    await ctx.reply(T(ctx, '✅ Готово!\n📱 Телефон: <b>{phone}</b>\n📍 Адрес: <b>{address}</b>\n\nОни уже подставлены в заказ. Сменить: /phone, /location', { phone: esc(u.phone), address: esc(u.address || T(ctx, 'по геолокации')) }), { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
    await ctx.reply(T(ctx, 'Собирай свой бургер 👇'), { reply_markup: openAppKb(ctx) });
    await enableMenuApp(ctx);
  }

  async function startFlow(ctx) {
    const u = getUser(ctx.from.id);
    const step = missing(u);
    if (!step) {
      await enableMenuApp(ctx);
      return ctx.reply(`${welcome(ctx)}\n\n📱 ${esc(u.phone)}\n📍 ${esc(u.address || T(ctx, 'геолокация сохранена'))}\n${T(ctx, '(сменить — /phone, /location, язык — /lang)')}\n\n${T(ctx, 'Жми кнопку ниже 👇')}`, { parse_mode: 'HTML', reply_markup: openAppKb(ctx) });
    }
    await ctx.reply(welcome(ctx), { parse_mode: 'HTML' });
    await ask(ctx, step, step === 'phone' ? T(ctx, 'Для начала поделись номером телефона — кнопка внизу 👇') : undefined);
  }

  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    // Ссылка друга: t.me/бот?start=ref<id> — бонус обоим после первого заказа
    const ref = String(ctx.match || '').match(/^ref(\d{3,15})$/);
    if (ref && applyReferral(ctx.from.id, ref[1])) {
      const R = SETTINGS.referral || {};
      await ctx.reply(T(ctx, '🎁 Тебя пригласил друг! После первого заказа ты получишь {n} котлеток — ими можно оплатить следующие заказы.', { n: R.inviteeBonus }));
    }
    if (!getUser(ctx.from.id)?.lang) return ctx.reply("Tilni tanlang · Выберите язык", { reply_markup: langKb() });
    await startFlow(ctx);
  });

  bot.command('lang', (ctx) => ctx.reply("Tilni tanlang · Выберите язык", { reply_markup: langKb() }));
  bot.callbackQuery(/^lang:(ru|uz)$/, async (ctx) => {
    const first = !getUser(ctx.from.id)?.lang;
    saveUser(ctx.from.id, { lang: ctx.match[1] });
    await ctx.answerCallbackQuery({ text: LANGS[ctx.match[1]] });
    await ctx.editMessageText(`✅ ${LANGS[ctx.match[1]]}`).catch(() => {});
    if (first) await startFlow(ctx);
  });

  bot.command('phone', (ctx) => askPhone(ctx, T(ctx, 'Нажми кнопку внизу, чтобы отправить номер 👇')));
  bot.command('location', (ctx) => askLocation(ctx, T(ctx, 'Отправь новую геолокацию кнопкой внизу или точку на карте (📎 → Геопозиция) 👇')));

  // Контакт приходит и из кнопки бота, и из Mini App (кнопка «Из Telegram» при оформлении)
  bot.on('message:contact', async (ctx) => {
    const c = ctx.message.contact;
    if (c.user_id && c.user_id !== ctx.from.id) return askPhone(ctx, T(ctx, 'Отправь, пожалуйста, <b>свой</b> номер — кнопкой внизу.'));
    const digits = normPhone(c.phone_number);
    const phone = validPhone(digits) ? fmtPhone(digits) : `+${digits}`;
    const u = saveUser(ctx.from.id, { phone, name: [c.first_name, c.last_name].filter(Boolean).join(' ') });
    await ctx.reply(`${T(ctx, '✅ Номер сохранён: <b>{phone}</b>', { phone: esc(phone) })}${validPhone(digits) ? '' : `\n${T(ctx, '⚠ Для доставки нужен номер Узбекистана (+998) — его можно поправить при оформлении.')}`}`, { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
    if (missing(u)) return askLocation(ctx);
    await ready(ctx, u);
  });

  bot.on('message:location', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const { latitude: lat, longitude: lng } = ctx.message.location;
    const location = { lat, lng };
    const address = ctx.message.venue?.address || (await reverseGeocode(location));
    const { zone, km } = zoneFor(location);
    const u = saveUser(ctx.from.id, { location, address });
    const dist = String(km).replace('.', ',');
    const zoneLine = zone
      ? T(ctx, '🛵 {km} км от ресторана · доставка {fee} · в пути ≈ {min} мин', { km: dist, fee: fmtPrice(zone.fee), min: zone.etaMin })
      : T(ctx, '⚠ Это {km} км от ресторана — вне зоны доставки. Доступны самовывоз и заказ в зале.', { km: dist });
    await ctx.reply(`${T(ctx, '✅ Геолокация сохранена')}${address ? `: <b>${esc(address)}</b>` : ''}\n${zoneLine}`, { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
    if (missing(u)) return askPhone(ctx);
    await ready(ctx, u);
  });

  bot.command('orders', async (ctx) => {
    const list = ordersOfUser(ctx.from.id);
    if (!list.length) return ctx.reply(T(ctx, 'У тебя пока нет заказов. Самое время собрать первый бургер!'), { reply_markup: openAppKb(ctx) });
    const kb = new InlineKeyboard();
    list.filter((o) => !isClosed(o)).forEach((o) => kb.webApp(T(ctx, '📍 Статус #{id}', { id: o.id }), `${webappUrl}?order=${o.id}`).row());
    await ctx.reply(`🧾 <b>${T(ctx, 'Твои последние заказы')}</b>\n\n${list.map((o) => orderShortLine(o, L(ctx))).join('\n')}`, { parse_mode: 'HTML', reply_markup: kb.webApp(T(ctx, '🍔 Новый бургер'), webappUrl) });
  });

  // Служебные команды и адрес кассы показываем только персоналу
  bot.command('help', (ctx) => ctx.reply(
    T(ctx, '/start — открыть BurgerLab\n/orders — мои заказы\n/phone — сменить номер телефона\n/location — сменить адрес доставки\n/lang — сменить язык')
    + (isStaff(ctx) ? `\n\nДля персонала:\n/chatid — узнать ID чата (для KITCHEN_CHAT_ID)\n/today — продажи за сегодня\nКасса в браузере: ${webappUrl}staff${isAdmin(ctx) ? '\nАдмин-панель есть и в приложении' : ''}` : ''),
  ));

  // ── Персонал ──
  bot.command('chatid', (ctx) => ctx.reply(`ID этого чата: <code>${ctx.chat.id}</code>\nВаш user ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' }));

  bot.command('today', async (ctx) => {
    if (!isStaff(ctx)) return;
    const s = todayStats();
    await ctx.reply(`📊 <b>Сегодня</b>\nЗаказов: ${s.count}\nВыручка: ${fmtPrice(s.revenue)}\nСредний чек: ${fmtPrice(s.avg)}\nВ работе сейчас: ${s.active}`, { parse_mode: 'HTML' });
  });

  // Кнопки на карточке заказа в чате кухни: принять / следующий этап / отклонить с причиной
  bot.callbackQuery(/^st:(\d+):([a-z]+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: 'Только для персонала', show_alert: true });
    const [, id, to] = ctx.match;
    const r = changeStatus(id, to, actor(ctx));
    if (r.error) {
      if (r.order) await refreshKitchenCard(r.order);
      return ctx.answerCallbackQuery({ text: r.error });
    }
    await ctx.answerCallbackQuery({ text: `#${id}: ${STATUSES[to].t}` });
  });

  // «Отклонить/Отменить» открывает выбор причины, «Назад» возвращает обычные кнопки
  bot.callbackQuery(/^cx:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: 'Только для персонала', show_alert: true });
    const o = getOrder(ctx.match[1]);
    if (!o || isClosed(o)) return ctx.answerCallbackQuery({ text: 'Заказ уже закрыт' });
    const kb = new InlineKeyboard();
    CANCEL_REASONS.forEach((t, i) => kb.text(t, `cr:${o.id}:${i}`).row());
    kb.text('← Назад', `cb:${o.id}`);
    await ctx.editMessageReplyMarkup({ reply_markup: kb }).catch(() => {});
    await ctx.answerCallbackQuery({ text: 'Выберите причину' });
  });

  bot.callbackQuery(/^cb:(\d+)$/, async (ctx) => {
    const o = getOrder(ctx.match[1]);
    if (o) await ctx.editMessageReplyMarkup({ reply_markup: kitchenKb(o) }).catch(() => {});
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^cr:(\d+):(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: 'Только для персонала', show_alert: true });
    const reason = CANCEL_REASONS[Number(ctx.match[2])];
    const r = changeStatus(ctx.match[1], 'cancelled', actor(ctx), { reason });
    await ctx.answerCallbackQuery({ text: r.error || `Заказ #${ctx.match[1]} отменён` });
  });

  // Пока номер и геолокация не получены, на любое сообщение в личке напоминаем, чего не хватает
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'private' || ctx.message.text?.startsWith('/')) return next();
    const step = missing(getUser(ctx.from.id));
    if (!step) return next();
    await ask(ctx, step, T(ctx, step === 'phone' ? 'Чтобы продолжить, поделись номером — кнопка внизу 👇' : 'Чтобы продолжить, отправь геолокацию — кнопка внизу 👇'));
  });

  bot.catch((err) => console.error('Ошибка бота:', err.error?.message || err.message));

  // ── Вспомогательные ──
  function kitchenKb(o) {
    if (isClosed(o)) return undefined;
    const kb = new InlineKeyboard();
    if (o.status === 'created' || o.status === 'received') {
      kb.text('✅ Принять', `st:${o.id}:accepted`).text('✖ Отклонить', `cx:${o.id}`);
      return kb;
    }
    const next = nextStatus(o);
    if (next) kb.text(`▶ ${STATUSES[next].t}`, `st:${o.id}:${next}`).row();
    kb.text('✖ Отменить', `cx:${o.id}`);
    return kb;
  }

  const staffTargets = () => (kitchenChatId ? [kitchenChatId] : tgStaffIds());

  async function sendToKitchen(o) {
    const targets = staffTargets();
    if (!targets.length) return;
    const cards = [];
    for (const chatId of targets) {
      try {
        const m = await bot.api.sendMessage(chatId, kitchenText(o), { parse_mode: 'HTML', reply_markup: kitchenKb(o), link_preview_options: { is_disabled: true } });
        cards.push({ chatId, messageId: m.message_id });
      } catch (e) { console.error(`Не удалось отправить заказ #${o.id} в чат ${chatId}:`, e.message); }
    }
    return cards;
  }

  async function refreshKitchenCard(o) {
    for (const c of o.cards || []) {
      try { await bot.api.editMessageText(c.chatId, c.messageId, kitchenText(o), { parse_mode: 'HTML', reply_markup: kitchenKb(o), link_preview_options: { is_disabled: true } }); }
      catch (e) { if (!/not modified/.test(e.message)) console.error('Не удалось обновить карточку:', e.message); }
    }
  }

  async function notifyCustomer(o, event) {
    if (!o.userId) return;
    const lang = langOfId(o.userId) || o.lang;
    try {
      const kb = isClosed(o) ? new InlineKeyboard().webApp(tr(lang, '🍔 Собрать ещё'), webappUrl) : new InlineKeyboard().webApp(tr(lang, '📍 Открыть статус'), `${webappUrl}?order=${o.id}`);
      await bot.api.sendMessage(o.userId, customerText(o, event, lang), { parse_mode: 'HTML', reply_markup: kb });
    } catch (e) { console.error(`Не удалось уведомить клиента заказа #${o.id}:`, e.message); }
  }

  // Начислены котлетки за приглашение
  async function notifyBonus(userId, amount, kind) {
    const lang = langOfId(userId);
    const text = kind === 'inviter'
      ? tr(lang, '🎉 Твой друг сделал первый заказ! Тебе начислено {n} котлеток. Баланс: {balance}.', { n: amount, balance: cutletsOf(userId) })
      : tr(lang, '🎁 Спасибо за первый заказ! Тебе начислено {n} котлеток. Баланс: {balance}.', { n: amount, balance: cutletsOf(userId) });
    try { await bot.api.sendMessage(userId, `${text}
${tr(lang, 'Котлетками можно оплатить часть следующего заказа.')}`, { reply_markup: new InlineKeyboard().webApp(tr(lang, '🍔 Собрать бургер'), webappUrl) }); }
    catch (e) { console.error('Не удалось сообщить о бонусе:', e.message); }
  }

  // Оповещение персонала: группа кухни и администраторы
  async function alertStaff(text) {
    const targets = [...new Set([...(kitchenChatId ? [kitchenChatId] : []), ...tgStaffIds()].map(String))];
    for (const chatId of targets) {
      try { await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }); }
      catch (e) { console.error(`Не удалось отправить оповещение в ${chatId}:`, e.message); }
    }
  }

  async function setup() {
    const commands = (lang) => [
      ['start', 'Открыть BurgerLab'], ['orders', 'Мои заказы'], ['phone', 'Номер телефона для заказов'],
      ['location', 'Адрес доставки'], ['lang', 'Язык'], ['help', 'Помощь'],
    ].map(([command, d]) => ({ command, description: tr(lang, d) }));
    await bot.api.setMyCommands(commands('ru'));
    await bot.api.setMyCommands(commands('uz'), { language_code: 'uz' }).catch(() => {});
    // По умолчанию кнопка меню — список команд. Приложение она открывает только в чате,
    // где клиент уже поделился номером и геолокацией (см. ready)
    await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
    const me = await bot.api.getMe();
    return me;
  }

  // Найти пользователя Telegram по ID, @username или ссылке t.me/username.
  // По ID Telegram отдаёт имя и никнейм, если человек хоть раз писал боту.
  // Никнейм Telegram по username для обычных пользователей не ищет — ищем среди тех, кто писал боту.
  async function resolveTgUser(query) {
    const q = String(query || '').trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
    let id = /^\d{5,15}$/.test(q) ? Number(q) : null;
    if (!id) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(q)) return { error: 'Введите Telegram ID (только цифры) или @username' };
      id = findUserByUsername(q)?.id;
      if (!id) return { error: `@${q} ещё не писал боту. Попросите нажать /start в боте или укажите Telegram ID` };
    }
    try {
      const c = await bot.api.getChat(id);
      if (c.type !== 'private') return { error: 'Это не пользователь, а группа или канал' };
      const user = { id: c.id, username: c.username || '', name: [c.first_name, c.last_name].filter(Boolean).join(' ') || `ID ${c.id}` };
      saveUser(c.id, { username: user.username, tgName: user.name });
      return { user };
    } catch {
      const u = getUser(id);
      if (u?.tgName || u?.username) return { user: { id, username: u.username || '', name: u.tgName || u.name || `ID ${id}` } };
      return { error: 'Пользователь не найден. Он должен сначала нажать /start в боте — тогда подтянутся имя и никнейм' };
    }
  }

  // Сообщение новому сотруднику: кнопка сразу открывает панель в Mini App
  async function notifyStaffAdded(entry, byName) {
    const role = entry.role === 'admin' ? 'администратором' : 'сотрудником';
    try {
      await bot.api.sendMessage(entry.tgId, `👋 ${esc(byName)} добавил(а) вас ${role} BurgerLab.\n\nПанель открывается прямо в приложении: касса и кухня${entry.role === 'admin' ? ', меню, отчёты и настройки' : ''}. Сюда же будут приходить новые заказы и оповещения.`, {
        parse_mode: 'HTML', reply_markup: new InlineKeyboard().webApp(entry.role === 'admin' ? '🛠 Открыть админ-панель' : '🧾 Открыть кассу и кухню', `${webappUrl}?panel=1`),
      });
      return true;
    } catch { return false; }
  }

  return { bot, setup, sendToKitchen, refreshKitchenCard, notifyCustomer, notifyBonus, alertStaff, resolveTgUser, notifyStaffAdded };
}
