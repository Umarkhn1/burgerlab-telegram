// BurgerLab: данные меню, справочники и настройки по умолчанию.
// Меню, настройки и стоп-лист редактируются в админ-панели и приходят с сервера (см. applyMenu ниже).

export const CATEGORIES = [
  { id: 'bun', name: 'Булочки', icon: 'bakery_dining' },
  { id: 'meat', name: 'Мясо', icon: 'outdoor_grill' },
  { id: 'cheese', name: 'Сыр', icon: 'change_history' },
  { id: 'veg', name: 'Овощи', icon: 'eco' },
  { id: 'sauce', name: 'Соусы', icon: 'water_drop' },
  { id: 'extra', name: 'Добавки', icon: 'tapas' },
];

// price — сум за порцию (для булочек — за целую булочку, половинка = 1/2)
// w — граммы, kcal — ккал, h — миллиметры в собранном бургере, hot — острота 0..5
export const INGREDIENTS = [
  // Булочки
  { id: 'brioche', cat: 'bun', name: 'Бриошь', en: 'Brioche', price: 8000, w: 90, kcal: 290, h: 70, vis: 'bun', c: '#D9862C', c2: '#F0B45A', seeds: 'none' },
  { id: 'sesame', cat: 'bun', name: 'Кунжутная', en: 'Sesame bun', price: 7000, w: 85, kcal: 260, h: 68, vis: 'bun', c: '#C9782A', c2: '#E8A34E', seeds: '#F7E7C4' },
  { id: 'charcoal', cat: 'bun', name: 'Чёрная угольная', en: 'Charcoal bun', price: 9000, w: 88, kcal: 270, h: 68, vis: 'bun', c: '#1E1B1A', c2: '#3A3432', seeds: '#F4EFE6' },
  { id: 'potato', cat: 'bun', name: 'Картофельная', en: 'Potato bun', price: 8500, w: 92, kcal: 280, h: 72, vis: 'bun', c: '#E1A650', c2: '#F5CE86', seeds: 'none' },

  // Мясо
  { id: 'beef', cat: 'meat', name: 'Говяжья котлета 150 г', short: 'Котлета', en: 'Beef 150g', price: 18000, w: 150, kcal: 380, h: 17, vis: 'patty', c: '#5B3120', c2: '#7A4530' },
  { id: 'chicken', cat: 'meat', name: 'Куриная котлета', short: 'Курица', en: 'Chicken', price: 15000, w: 130, kcal: 290, h: 16, vis: 'crispy', c: '#C47E2A', c2: '#E3A44A' },
  { id: 'smash', cat: 'meat', name: 'Смэш-котлета 90 г', short: 'Смэш', en: 'Smash 90g', price: 12000, w: 90, kcal: 240, h: 9, vis: 'smash', c: '#4E2A1B', c2: '#6E3D28' },
  { id: 'veggie', cat: 'meat', name: 'Растительная котлета', short: 'Veggie', en: 'Plant patty', price: 16000, w: 120, kcal: 250, h: 15, vis: 'patty', c: '#5E5A2E', c2: '#7C7640' },
  { id: 'wagyu', cat: 'meat', name: 'Вагю 180 г', short: 'Вагю', en: 'Wagyu 180g', price: 42000, w: 180, kcal: 470, h: 19, vis: 'wagyu', c: '#6A2F1E', c2: '#8C4632' },

  // Сыр
  { id: 'cheddar', cat: 'cheese', name: 'Чеддер', en: 'Cheddar', price: 5000, w: 20, kcal: 80, h: 3, vis: 'cheese', c: '#F5A20F', c2: '#FFC247' },
  { id: 'mozzarella', cat: 'cheese', name: 'Моцарелла', en: 'Mozzarella', price: 6000, w: 25, kcal: 75, h: 4, vis: 'cheese', c: '#F1E8CF', c2: '#FFFBEF' },
  { id: 'blue', cat: 'cheese', name: 'Дорблю', en: 'Blue cheese', price: 8000, w: 20, kcal: 72, h: 3, vis: 'cheese', c: '#E4E0CC', c2: '#F3F0E2', spots: '#6F86A8' },
  { id: 'gouda', cat: 'cheese', name: 'Копчёная гауда', en: 'Smoked gouda', price: 6500, w: 20, kcal: 76, h: 3, vis: 'cheese', c: '#D98A22', c2: '#EFAE4C' },

  // Овощи
  { id: 'tomato', cat: 'veg', name: 'Помидор', en: 'Tomato', price: 2000, w: 30, kcal: 6, h: 6, vis: 'tomato', c: '#E0352B', c2: '#FF6B5A' },
  { id: 'onion', cat: 'veg', name: 'Красный лук', en: 'Red onion', price: 1500, w: 15, kcal: 6, h: 4, vis: 'onion', c: '#9B3D86', c2: '#E8C9E0' },
  { id: 'pickles', cat: 'veg', name: 'Маринованные огурцы', short: 'Огурцы', en: 'Pickles', price: 2000, w: 20, kcal: 3, h: 3, vis: 'pickles', c: '#6B8E2E', c2: '#B7CF6E' },
  { id: 'jalapeno', cat: 'veg', name: 'Халапеньо', en: 'Jalapeño', price: 2500, w: 15, kcal: 4, h: 3, vis: 'rings', c: '#2E8B3A', c2: '#C8E6A0', hot: 3 },
  { id: 'lettuce', cat: 'veg', name: 'Салат айсберг', short: 'Салат', en: 'Lettuce', price: 1500, w: 15, kcal: 2, h: 5, vis: 'lettuce', c: '#5DB445', c2: '#A6DB6E' },
  { id: 'avocado', cat: 'veg', name: 'Авокадо', en: 'Avocado', price: 6000, w: 40, kcal: 64, h: 6, vis: 'avocado', c: '#6E9B2E', c2: '#D6E58A' },
  { id: 'mushroom', cat: 'veg', name: 'Шампиньоны гриль', short: 'Грибы', en: 'Grilled mushrooms', price: 3000, w: 30, kcal: 10, h: 5, vis: 'mushroom', c: '#8A6546', c2: '#D9C3A5' },
  { id: 'caramel', cat: 'veg', name: 'Карамелизированный лук', short: 'Карамел. лук', en: 'Caramelized onion', price: 2500, w: 25, kcal: 40, h: 4, vis: 'caramel', c: '#9A5A1E', c2: '#C98A3E' },
  { id: 'pepper', cat: 'veg', name: 'Болгарский перец', short: 'Перец', en: 'Bell pepper', price: 2000, w: 20, kcal: 5, h: 4, vis: 'pepper', c: '#E23B22', c2: '#F6C12A' },

  // Соусы
  { id: 'labsauce', cat: 'sauce', name: 'BurgerLab Sauce', en: 'BurgerLab Sauce', price: 3500, w: 20, kcal: 90, h: 2, vis: 'sauce', c: '#F08A3C' },
  { id: 'bbq', cat: 'sauce', name: 'BBQ', en: 'BBQ', price: 3000, w: 20, kcal: 50, h: 2, vis: 'sauce', c: '#6B2413' },
  { id: 'cheesesauce', cat: 'sauce', name: 'Cheese sauce', en: 'Cheese sauce', price: 3500, w: 25, kcal: 95, h: 2, vis: 'sauce', c: '#FFB21E' },
  { id: 'ketchup', cat: 'sauce', name: 'Кетчуп', en: 'Ketchup', price: 1500, w: 15, kcal: 18, h: 1, vis: 'sauce', c: '#C8171B' },
  { id: 'mustard', cat: 'sauce', name: 'Горчица', en: 'Mustard', price: 1500, w: 10, kcal: 8, h: 1, vis: 'sauce', c: '#E7C21A' },
  { id: 'garlic', cat: 'sauce', name: 'Чесночный майонез', short: 'Чесночный', en: 'Garlic mayo', price: 2500, w: 20, kcal: 130, h: 2, vis: 'sauce', c: '#F6F0DD' },
  { id: 'sriracha', cat: 'sauce', name: 'Шрирача', en: 'Sriracha', price: 3000, w: 15, kcal: 15, h: 1, vis: 'sauce', c: '#E0301E', hot: 3 },
  { id: 'truffle', cat: 'sauce', name: 'Трюфельный майонез', short: 'Трюфель', en: 'Truffle mayo', price: 5000, w: 20, kcal: 140, h: 2, vis: 'sauce', c: '#E9DFC6' },
  { id: 'ghost', cat: 'sauce', name: 'Ghost Pepper', en: 'Ghost pepper', price: 4000, w: 15, kcal: 20, h: 1, vis: 'sauce', c: '#A5140E', hot: 5 },

  // Добавки
  { id: 'bacon', cat: 'extra', name: 'Бекон', en: 'Bacon', price: 7000, w: 25, kcal: 135, h: 4, vis: 'bacon', c: '#A8382A', c2: '#F2C9A8' },
  { id: 'egg', cat: 'extra', name: 'Яйцо глазунья', short: 'Яйцо', en: 'Fried egg', price: 4000, w: 50, kcal: 90, h: 7, vis: 'egg', c: '#FFFDF5', c2: '#FFB319' },
  { id: 'rings', cat: 'extra', name: 'Луковые кольца', short: 'Кольца', en: 'Onion rings', price: 5000, w: 40, kcal: 160, h: 12, vis: 'orings', c: '#D8922E', c2: '#F1BE62' },
  { id: 'fries', cat: 'extra', name: 'Картофель фри внутри', short: 'Фри внутри', en: 'Fries inside', price: 6000, w: 60, kcal: 190, h: 14, vis: 'fries', c: '#F2C14B', c2: '#FFE08A' },
  { id: 'hashbrown', cat: 'extra', name: 'Хашбраун', en: 'Hash brown', price: 5000, w: 60, kcal: 150, h: 10, vis: 'hash', c: '#D4952F', c2: '#EDBF62' },
  { id: 'pineapple', cat: 'extra', name: 'Ананас гриль', short: 'Ананас', en: 'Grilled pineapple', price: 4000, w: 40, kcal: 20, h: 8, vis: 'pineapple', c: '#F5CC2E', c2: '#8A5A1A' },
  { id: 'pastrami', cat: 'extra', name: 'Пастрами', en: 'Pastrami', price: 12000, w: 50, kcal: 120, h: 8, vis: 'pastrami', c: '#B84A4E', c2: '#E59A94' },
  { id: 'crispy', cat: 'extra', name: 'Хрустящий лук', short: 'Хруст. лук', en: 'Crispy onion', price: 3000, w: 15, kcal: 80, h: 4, vis: 'crumbs', c: '#C9832C', c2: '#E8B55C' },
  { id: 'nachos', cat: 'extra', name: 'Начос', en: 'Nachos', price: 3000, w: 20, kcal: 100, h: 6, vis: 'nachos', c: '#F0B22E', c2: '#FFD66B' },
  { id: 'poppers', cat: 'extra', name: 'Халапеньо-попперсы', short: 'Попперсы', en: 'Jalapeño poppers', price: 6000, w: 40, kcal: 130, h: 12, vis: 'poppers', c: '#D9832A', c2: '#F2B25C', hot: 2 },
  { id: 'macncheese', cat: 'extra', name: 'Мак-н-чиз котлета', short: 'Мак-н-чиз', en: 'Mac&cheese patty', price: 8000, w: 70, kcal: 220, h: 14, vis: 'mac', c: '#F2A124', c2: '#FFD27A' },
];

export const ING = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

// Состав в формате "сверху вниз", булочки — "top:<id>" / "bottom:<id>" / "mid:<id>"
const B = (id, ...mid) => [`top:${id}`, ...mid, `bottom:${id}`];

export const SIZE_PRESETS = [
  { id: 'mini', name: 'Mini', layers: B('potato', 'ketchup', 'pickles', 'cheddar', 'smash') },
  { id: 'standard', name: 'Standard', layers: B('brioche', 'labsauce', 'lettuce', 'tomato', 'onion', 'cheddar', 'beef') },
  { id: 'xl', name: 'XL', layers: B('sesame', 'labsauce', 'lettuce', 'tomato', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'pickles') },
  { id: 'xxl', name: 'XXL', layers: B('brioche', 'bbq', 'rings', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'onion', 'pickles', 'labsauce') },
  { id: 'giant', name: 'Giant', layers: B('brioche', 'labsauce', 'lettuce', 'tomato', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'mid:brioche', 'fries', 'cheddar', 'beef', 'egg', 'cheddar', 'beef', 'bacon', 'bacon', 'cheddar', 'beef', 'rings', 'bbq') },
  { id: 'custom', name: 'Custom', layers: null },
];

export const DEFAULT_LAYERS = SIZE_PRESETS[1].layers;

export const COMMUNITY = [
  { id: 'c1', name: 'BOBUR MONSTER', author: 'Bobur', city: 'Ташкент', likes: 2841, tags: ['meat', 'cheese', 'big'], layers: B('brioche', 'bbq', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'tomato', 'onion', 'pickles', 'labsauce') },
  { id: 'c2', name: 'Сырный шторм', author: 'Мадина', city: 'Самарканд', likes: 1932, tags: ['cheese'], layers: B('potato', 'cheesesauce', 'cheddar', 'mozzarella', 'gouda', 'smash', 'cheddar', 'blue', 'cheddar', 'smash', 'mozzarella', 'cheddar', 'gouda', 'cheesesauce') },
  { id: 'c3', name: 'Chilanzar Fire', author: 'Азиз', city: 'Ташкент', likes: 1544, tags: ['hot'], layers: B('charcoal', 'ghost', 'jalapeno', 'poppers', 'cheddar', 'beef', 'jalapeno', 'sriracha', 'pepper', 'onion') },
  { id: 'c4', name: 'Tower of Babel', author: 'Тимур', city: 'Бухара', likes: 1320, tags: ['big', 'meat'], layers: B('sesame', 'labsauce', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'mid:sesame', 'cheddar', 'beef', 'egg', 'cheddar', 'beef', 'mid:sesame', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'rings', 'bbq') },
  { id: 'c5', name: 'Wagyu Royale', author: 'Камила', city: 'Ташкент', likes: 1180, tags: ['expensive', 'meat'], layers: B('brioche', 'truffle', 'lettuce', 'gouda', 'wagyu', 'caramel', 'mushroom', 'wagyu', 'blue', 'truffle') },
  { id: 'c6', name: 'Утренний', author: 'Дильноза', city: 'Наманган', likes: 986, tags: [], layers: B('potato', 'garlic', 'egg', 'bacon', 'hashbrown', 'cheddar', 'beef', 'ketchup') },
  { id: 'c7', name: 'Green Lab', author: 'Нодира', city: 'Ташкент', likes: 874, tags: [], layers: B('sesame', 'garlic', 'lettuce', 'avocado', 'tomato', 'veggie', 'mushroom', 'pepper', 'onion', 'mozzarella') },
  { id: 'c8', name: 'Гавайский хаос', author: 'Сардор', city: 'Фергана', likes: 712, tags: [], layers: B('brioche', 'bbq', 'pineapple', 'bacon', 'cheddar', 'chicken', 'jalapeno', 'onion', 'labsauce') },
  { id: 'c9', name: 'Double Pastrami', author: 'Жасур', city: 'Ташкент', likes: 655, tags: ['meat', 'expensive'], layers: B('charcoal', 'mustard', 'pastrami', 'gouda', 'beef', 'pastrami', 'gouda', 'beef', 'pickles', 'caramel') },
  { id: 'c10', name: 'Crunch Time', author: 'Лола', city: 'Андижан', likes: 540, tags: [], layers: B('potato', 'cheesesauce', 'nachos', 'crispy', 'cheddar', 'chicken', 'rings', 'fries', 'bbq') },
];

export const COMMUNITY_FILTERS = [
  { id: 'popular', label: 'Самые популярные', icon: 'whatshot' },
  { id: 'cheese', label: 'Самые сырные', icon: 'change_history' },
  { id: 'meat', label: 'Самые мясные', icon: 'outdoor_grill' },
  { id: 'hot', label: 'Самые острые', icon: 'local_fire_department' },
  { id: 'big', label: 'Самые большие', icon: 'workspace_premium' },
  { id: 'expensive', label: 'Самые дорогие', icon: 'savings' },
];

export const UPSELL = [
  { id: 'up_fries', name: 'Картофель фри', note: 'Хрустящий, 150 г', price: 12000, icon: 'fastfood', w: 150, kcal: 410 },
  { id: 'up_drink', name: 'Лимонад BurgerLab', note: 'Апельсин-маракуйя, 0,5 л', price: 9000, icon: 'local_drink', w: 500, kcal: 180 },
  { id: 'up_dip', name: 'Соус к фри', note: 'BurgerLab Sauce, 50 мл', price: 3000, icon: 'water_drop', w: 50, kcal: 160 },
  { id: 'up_dessert', name: 'Чизкейк', note: 'Нью-Йорк, 120 г', price: 16000, icon: 'cake', w: 120, kcal: 390 },
];

export const PARTY = [
  { id: 'p2', people: 2, weight: 900, price: 119000, len: 30 },
  { id: 'p4', people: 4, weight: 1800, price: 220000, len: 50 },
  { id: 'p6', people: 6, weight: 2700, price: 320000, len: 70 },
  { id: 'p10', people: 10, weight: 4500, price: 520000, len: 100 },
  { id: 'p15', people: 15, weight: 6800, price: 760000, len: 150 },
];

export const CHALLENGES = [
  { id: 'cheese', title: 'Cheese Monster', icon: 'change_history', goal: 'Собери бургер минимум с 10 слоями сыра', target: 10, unit: 'слоёв сыра' },
  { id: 'meat', title: 'Meat King', icon: 'workspace_premium', goal: 'Минимум 5 котлет в одном бургере', target: 5, unit: 'котлет' },
  { id: 'giant', title: 'Giant Week', icon: 'fitness_center', goal: 'Бургер весом больше 2 кг', target: 2000, unit: 'г' },
  { id: 'hot', title: 'Hot Challenge', icon: 'local_fire_department', goal: 'Набери 15 очков остроты', target: 15, unit: 'очков остроты' },
];

export const MOCK_USERS = [
  { name: 'Bobur Karimov', phone: '+998 90 123-45-67', orders: 14, spent: 1846000, fav: 'BOBUR MONSTER' },
  { name: 'Мадина Юсупова', phone: '+998 93 555-12-40', orders: 9, spent: 981000, fav: 'Сырный шторм' },
  { name: 'Азиз Рахимов', phone: '+998 97 700-88-11', orders: 22, spent: 2640000, fav: 'Chilanzar Fire' },
  { name: 'Камила Ахмедова', phone: '+998 99 410-20-30', orders: 6, spent: 1320000, fav: 'Wagyu Royale' },
  { name: 'Тимур Назаров', phone: '+998 91 234-77-00', orders: 11, spent: 2210000, fav: 'Tower of Babel' },
];

export const MOCK_KITCHEN = [
  { id: 4821, name: 'Сырный шторм', layers: COMMUNITY[1].layers, time: '12:31', status: 'cooking', comment: 'Без спешки, заберу сам', delivery: 'pickup' },
  { id: 4824, name: 'Chilanzar Fire', layers: COMMUNITY[2].layers, time: '12:36', status: 'new', comment: 'Максимально остро!', delivery: 'delivery' },
  { id: 4819, name: 'Green Lab', layers: COMMUNITY[6].layers, time: '12:24', status: 'ready', comment: '', delivery: 'delivery' },
];

// ── Единый справочник статусов заказа (приложение, касса, бот) ──
// ms — иконка в интерфейсе, icon — эмодзи для сообщений бота
export const STATUSES = {
  created: { t: 'Заказ оформлен', d: 'Заказ принят системой и отправлен на кассу', icon: '🧾', ms: 'receipt' },
  received: { t: 'Заказ на кассе', d: 'Касса получила заказ и скоро его подтвердит', icon: '📥', ms: 'point_of_sale' },
  accepted: { t: 'Принят в работу', d: 'Кассир подтвердил заказ', icon: '✅', ms: 'check_circle' },
  cooking: { t: 'Готовится', d: 'Котлеты уже на гриле, повар собирает слои по рецепту', icon: '👨‍🍳', ms: 'cooking' },
  ready: { t: 'Готов', d: 'Заказ готов', icon: '🍔', ms: 'lunch_dining' },
  courier: { t: 'Передан курьеру', d: 'Курьер забрал заказ', icon: '📦', ms: 'package_2' },
  delivering: { t: 'Доставляется', d: 'Курьер направляется к вам', icon: '🛵', ms: 'two_wheeler' },
  done: { t: 'Завершён', d: 'Приятного аппетита!', icon: '🎉', ms: 'done_all' },
  cancelled: { t: 'Отменён', d: 'Заказ отменён', icon: '❌', ms: 'cancel' },
};

// Этапы для каждого способа получения
export const FLOWS = {
  delivery: ['created', 'received', 'accepted', 'cooking', 'ready', 'courier', 'delivering', 'done'],
  pickup: ['created', 'received', 'accepted', 'cooking', 'ready', 'done'],
  hall: ['created', 'received', 'accepted', 'cooking', 'ready', 'done'],
};

export const MODES = {
  delivery: { t: 'Доставка', icon: 'delivery_dining' },
  pickup: { t: 'Самовывоз', icon: 'directions_run' },
  hall: { t: 'В зале', icon: 'table_restaurant' },
};

// Тексты, которые зависят от способа получения
export const MODE_TEXT = {
  ready: { delivery: 'Заказ готов и ждёт курьера', pickup: 'Заказ готов — можно забирать', hall: 'Заказ готов — несём к вашему столу' },
  done: { delivery: 'Заказ доставлен. Приятного аппетита!', pickup: 'Заказ выдан. Приятного аппетита!', hall: 'Заказ подан. Приятного аппетита!' },
};

export const CANCEL_REASONS = [
  'Закончились ингредиенты',
  'Кухня перегружена',
  'Адрес вне зоны доставки',
  'Не удалось связаться с клиентом',
  'Отменено по просьбе клиента',
];

// ── Настройки заведения по умолчанию (меняются в админ-панели) ──
export const DEFAULT_SETTINGS = {
  minOrder: 50000,
  freeFrom: 250000,
  tz: 'Asia/Tashkent',
  hours: { open: '10:00', close: '23:00' },
  modes: { delivery: true, pickup: true, hall: true },
  pickupAddress: 'BurgerLab Tashkent City — Бульвар Ислама Каримова, 12',
  hallTables: 20,
  partyCustom: true,
  // Лимиты конструктора: начинки = все слои, кроме булочек
  limits: {
    minFillings: 1,
    maxLayers: 60,
    maxSame: 15,
    maxCat: { bun: 3, meat: 10, cheese: 15, veg: 20, sauce: 6, extra: 15 },
    requireBun: true,
    requireMeat: false,
    forbidden: [],
  },
  // Минуты: приготовление, сигнал «кассир не принял», допуск на опоздание доставки
  timing: { cookMin: 20, acceptAlertMin: 3, graceMin: 10 },
  delivery: {
    origin: { lat: 41.3163, lng: 69.2486 },
    zones: [
      { id: 'z1', name: 'до 3 км', maxKm: 3, fee: 10000, etaMin: 25 },
      { id: 'z2', name: '3–7 км', maxKm: 7, fee: 15000, etaMin: 35 },
      { id: 'z3', name: '7–12 км', maxKm: 12, fee: 25000, etaMin: 50 },
    ],
  },
};

// ── Живые меню, настройки и стоп-лист ──
// Значения выше — стартовые. Сервер хранит актуальные и отдаёт их в /api/config;
// applyMenu/applySettings/applyStop обновляют эти же объекты на месте, поэтому
// все модули (конструктор, корзина, пересчёт цен на сервере) сразу видят изменения.
const clone = (v) => JSON.parse(JSON.stringify(v));
const DEFAULT_MENU = clone({ categories: CATEGORIES, ingredients: INGREDIENTS, extras: UPSELL, party: PARTY });
export const defaultMenu = () => clone(DEFAULT_MENU);

export const SETTINGS = clone(DEFAULT_SETTINGS);
export const STOP = {};

const replaceAll = (arr, next) => { if (Array.isArray(next)) arr.splice(0, arr.length, ...next); };

export function applyMenu(m) {
  if (!m) return;
  replaceAll(CATEGORIES, m.categories);
  replaceAll(INGREDIENTS, m.ingredients);
  replaceAll(UPSELL, m.extras);
  replaceAll(PARTY, m.party);
  for (const k of Object.keys(ING)) delete ING[k];
  for (const i of INGREDIENTS) ING[i.id] = i;
}

const merge = (base, over) => {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
};
export const withDefaults = (s) => merge(clone(DEFAULT_SETTINGS), s || {});

export function applySettings(s) {
  const next = withDefaults(s);
  for (const k of Object.keys(SETTINGS)) delete SETTINGS[k];
  Object.assign(SETTINGS, next);
}

export function applyStop(stop) {
  for (const k of Object.keys(STOP)) delete STOP[k];
  for (const [k, v] of Object.entries(stop || {})) if (v) STOP[k] = true;
}
