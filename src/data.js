// BurgerLab: данные меню, справочники и настройки по умолчанию.
// Меню, настройки и стоп-лист редактируются в админ-панели и приходят с сервера (см. applyMenu ниже).

export const CATEGORIES = [
  { id: 'bun', name: 'Булочки', nameUz: 'Bulochkalar', icon: 'bakery_dining' },
  { id: 'meat', name: 'Мясо', nameUz: 'Go\'sht', icon: 'outdoor_grill' },
  { id: 'cheese', name: 'Сыр', nameUz: 'Pishloq', icon: 'change_history' },
  { id: 'veg', name: 'Овощи', nameUz: 'Sabzavotlar', icon: 'eco' },
  { id: 'sauce', name: 'Соусы', nameUz: 'Souslar', icon: 'water_drop' },
  { id: 'extra', name: 'Добавки', nameUz: 'Qo\'shimchalar', icon: 'tapas' },
];

// price — сум за порцию (для булочек — за целую булочку, половинка = 1/2)
// w — граммы, kcal — ккал, h — миллиметры в собранном бургере, hot — острота 0..5
export const INGREDIENTS = [
  // Булочки
  { id: 'brioche', cat: 'bun', name: 'Бриошь', nameUz: 'Briosh', en: 'Brioche', price: 8000, w: 90, kcal: 290, h: 70, vis: 'bun', c: '#D9862C', c2: '#F0B45A', seeds: 'none' },
  { id: 'sesame', cat: 'bun', name: 'Кунжутная', nameUz: 'Kunjutli', en: 'Sesame bun', price: 7000, w: 85, kcal: 260, h: 68, vis: 'bun', c: '#C9782A', c2: '#E8A34E', seeds: '#F7E7C4' },
  { id: 'charcoal', cat: 'bun', name: 'Чёрная угольная', nameUz: 'Qora ko\'mirli', en: 'Charcoal bun', price: 9000, w: 88, kcal: 270, h: 68, vis: 'bun', c: '#1E1B1A', c2: '#3A3432', seeds: '#F4EFE6' },
  { id: 'potato', cat: 'bun', name: 'Картофельная', nameUz: 'Kartoshkali', en: 'Potato bun', price: 8500, w: 92, kcal: 280, h: 72, vis: 'bun', c: '#E1A650', c2: '#F5CE86', seeds: 'none' },

  // Мясо
  { id: 'beef', cat: 'meat', name: 'Говяжья котлета 150 г', nameUz: 'Mol go\'shti kotleti 150 g', shortUz: 'Kotlet', short: 'Котлета', en: 'Beef 150g', price: 18000, w: 150, kcal: 380, h: 17, vis: 'patty', c: '#5B3120', c2: '#7A4530' },
  { id: 'chicken', cat: 'meat', name: 'Куриная котлета', nameUz: 'Tovuq kotleti', shortUz: 'Tovuq', short: 'Курица', en: 'Chicken', price: 15000, w: 130, kcal: 290, h: 16, vis: 'crispy', c: '#C47E2A', c2: '#E3A44A' },
  { id: 'smash', cat: 'meat', name: 'Смэш-котлета 90 г', nameUz: 'Smash-kotlet 90 g', shortUz: 'Smash', short: 'Смэш', en: 'Smash 90g', price: 12000, w: 90, kcal: 240, h: 9, vis: 'smash', c: '#4E2A1B', c2: '#6E3D28' },
  { id: 'veggie', cat: 'meat', name: 'Растительная котлета', nameUz: 'O\'simlik kotleti', shortUz: 'Veggie', short: 'Veggie', en: 'Plant patty', price: 16000, w: 120, kcal: 250, h: 15, vis: 'patty', c: '#5E5A2E', c2: '#7C7640' },
  { id: 'wagyu', cat: 'meat', name: 'Вагю 180 г', nameUz: 'Vagyu 180 g', shortUz: 'Vagyu', short: 'Вагю', en: 'Wagyu 180g', price: 42000, w: 180, kcal: 470, h: 19, vis: 'wagyu', c: '#6A2F1E', c2: '#8C4632' },

  // Сыр
  { id: 'cheddar', cat: 'cheese', name: 'Чеддер', nameUz: 'Chedder', en: 'Cheddar', price: 5000, w: 20, kcal: 80, h: 3, vis: 'cheese', c: '#F5A20F', c2: '#FFC247' },
  { id: 'mozzarella', cat: 'cheese', name: 'Моцарелла', nameUz: 'Motsarella', en: 'Mozzarella', price: 6000, w: 25, kcal: 75, h: 4, vis: 'cheese', c: '#F1E8CF', c2: '#FFFBEF' },
  { id: 'blue', cat: 'cheese', name: 'Дорблю', nameUz: 'Dorblyu', en: 'Blue cheese', price: 8000, w: 20, kcal: 72, h: 3, vis: 'cheese', c: '#E4E0CC', c2: '#F3F0E2', spots: '#6F86A8' },
  { id: 'gouda', cat: 'cheese', name: 'Копчёная гауда', nameUz: 'Dudlangan gauda', en: 'Smoked gouda', price: 6500, w: 20, kcal: 76, h: 3, vis: 'cheese', c: '#D98A22', c2: '#EFAE4C' },

  // Овощи
  { id: 'tomato', cat: 'veg', name: 'Помидор', nameUz: 'Pomidor', en: 'Tomato', price: 2000, w: 30, kcal: 6, h: 6, vis: 'tomato', c: '#E0352B', c2: '#FF6B5A' },
  { id: 'onion', cat: 'veg', name: 'Красный лук', nameUz: 'Qizil piyoz', en: 'Red onion', price: 1500, w: 15, kcal: 6, h: 4, vis: 'onion', c: '#9B3D86', c2: '#E8C9E0' },
  { id: 'pickles', cat: 'veg', name: 'Маринованные огурцы', nameUz: 'Tuzlangan bodring', shortUz: 'Bodring', short: 'Огурцы', en: 'Pickles', price: 2000, w: 20, kcal: 3, h: 3, vis: 'pickles', c: '#6B8E2E', c2: '#B7CF6E' },
  { id: 'jalapeno', cat: 'veg', name: 'Халапеньо', nameUz: 'Xalapenyo', en: 'Jalapeño', price: 2500, w: 15, kcal: 4, h: 3, vis: 'rings', c: '#2E8B3A', c2: '#C8E6A0', hot: 3 },
  { id: 'lettuce', cat: 'veg', name: 'Салат айсберг', nameUz: 'Aysberg salati', shortUz: 'Salat', short: 'Салат', en: 'Lettuce', price: 1500, w: 15, kcal: 2, h: 5, vis: 'lettuce', c: '#5DB445', c2: '#A6DB6E' },
  { id: 'avocado', cat: 'veg', name: 'Авокадо', nameUz: 'Avokado', en: 'Avocado', price: 6000, w: 40, kcal: 64, h: 6, vis: 'avocado', c: '#6E9B2E', c2: '#D6E58A' },
  { id: 'mushroom', cat: 'veg', name: 'Шампиньоны гриль', nameUz: 'Grilda qo\'ziqorin', shortUz: 'Qo\'ziqorin', short: 'Грибы', en: 'Grilled mushrooms', price: 3000, w: 30, kcal: 10, h: 5, vis: 'mushroom', c: '#8A6546', c2: '#D9C3A5' },
  { id: 'caramel', cat: 'veg', name: 'Карамелизированный лук', nameUz: 'Karamellangan piyoz', shortUz: 'Karamel piyoz', short: 'Карамел. лук', en: 'Caramelized onion', price: 2500, w: 25, kcal: 40, h: 4, vis: 'caramel', c: '#9A5A1E', c2: '#C98A3E' },
  { id: 'pepper', cat: 'veg', name: 'Болгарский перец', nameUz: 'Bolgar qalampiri', shortUz: 'Qalampir', short: 'Перец', en: 'Bell pepper', price: 2000, w: 20, kcal: 5, h: 4, vis: 'pepper', c: '#E23B22', c2: '#F6C12A' },

  // Соусы
  { id: 'labsauce', cat: 'sauce', name: 'BurgerLab Sauce', nameUz: 'BurgerLab Sauce', en: 'BurgerLab Sauce', price: 3500, w: 20, kcal: 90, h: 2, vis: 'sauce', c: '#F08A3C' },
  { id: 'bbq', cat: 'sauce', name: 'BBQ', nameUz: 'BBQ', en: 'BBQ', price: 3000, w: 20, kcal: 50, h: 2, vis: 'sauce', c: '#6B2413' },
  { id: 'cheesesauce', cat: 'sauce', name: 'Cheese sauce', nameUz: 'Pishloq sousi', en: 'Cheese sauce', price: 3500, w: 25, kcal: 95, h: 2, vis: 'sauce', c: '#FFB21E' },
  { id: 'ketchup', cat: 'sauce', name: 'Кетчуп', nameUz: 'Ketchup', en: 'Ketchup', price: 1500, w: 15, kcal: 18, h: 1, vis: 'sauce', c: '#C8171B' },
  { id: 'mustard', cat: 'sauce', name: 'Горчица', nameUz: 'Xantal', en: 'Mustard', price: 1500, w: 10, kcal: 8, h: 1, vis: 'sauce', c: '#E7C21A' },
  { id: 'garlic', cat: 'sauce', name: 'Чесночный майонез', nameUz: 'Sarimsoqli mayonez', shortUz: 'Sarimsoqli', short: 'Чесночный', en: 'Garlic mayo', price: 2500, w: 20, kcal: 130, h: 2, vis: 'sauce', c: '#F6F0DD' },
  { id: 'sriracha', cat: 'sauce', name: 'Шрирача', nameUz: 'Shriracha', en: 'Sriracha', price: 3000, w: 15, kcal: 15, h: 1, vis: 'sauce', c: '#E0301E', hot: 3 },
  { id: 'truffle', cat: 'sauce', name: 'Трюфельный майонез', nameUz: 'Tryufelli mayonez', shortUz: 'Tryufel', short: 'Трюфель', en: 'Truffle mayo', price: 5000, w: 20, kcal: 140, h: 2, vis: 'sauce', c: '#E9DFC6' },
  { id: 'ghost', cat: 'sauce', name: 'Ghost Pepper', nameUz: 'Ghost Pepper', en: 'Ghost pepper', price: 4000, w: 15, kcal: 20, h: 1, vis: 'sauce', c: '#A5140E', hot: 5 },

  // Добавки
  { id: 'bacon', cat: 'extra', name: 'Бекон', nameUz: 'Bekon', en: 'Bacon', price: 7000, w: 25, kcal: 135, h: 4, vis: 'bacon', c: '#A8382A', c2: '#F2C9A8' },
  { id: 'egg', cat: 'extra', name: 'Яйцо глазунья', nameUz: 'Quymoq tuxum', shortUz: 'Tuxum', short: 'Яйцо', en: 'Fried egg', price: 4000, w: 50, kcal: 90, h: 7, vis: 'egg', c: '#FFFDF5', c2: '#FFB319' },
  { id: 'rings', cat: 'extra', name: 'Луковые кольца', nameUz: 'Piyoz halqalari', shortUz: 'Halqalar', short: 'Кольца', en: 'Onion rings', price: 5000, w: 40, kcal: 160, h: 12, vis: 'orings', c: '#D8922E', c2: '#F1BE62' },
  { id: 'fries', cat: 'extra', name: 'Картофель фри внутри', nameUz: 'Ichida kartoshka fri', shortUz: 'Fri ichida', short: 'Фри внутри', en: 'Fries inside', price: 6000, w: 60, kcal: 190, h: 14, vis: 'fries', c: '#F2C14B', c2: '#FFE08A' },
  { id: 'hashbrown', cat: 'extra', name: 'Хашбраун', nameUz: 'Xeshbraun', en: 'Hash brown', price: 5000, w: 60, kcal: 150, h: 10, vis: 'hash', c: '#D4952F', c2: '#EDBF62' },
  { id: 'pineapple', cat: 'extra', name: 'Ананас гриль', nameUz: 'Grilda ananas', shortUz: 'Ananas', short: 'Ананас', en: 'Grilled pineapple', price: 4000, w: 40, kcal: 20, h: 8, vis: 'pineapple', c: '#F5CC2E', c2: '#8A5A1A' },
  { id: 'pastrami', cat: 'extra', name: 'Пастрами', nameUz: 'Pastrami', en: 'Pastrami', price: 12000, w: 50, kcal: 120, h: 8, vis: 'pastrami', c: '#B84A4E', c2: '#E59A94' },
  { id: 'crispy', cat: 'extra', name: 'Хрустящий лук', nameUz: 'Qarsildoq piyoz', shortUz: 'Qarsildoq piyoz', short: 'Хруст. лук', en: 'Crispy onion', price: 3000, w: 15, kcal: 80, h: 4, vis: 'crumbs', c: '#C9832C', c2: '#E8B55C' },
  { id: 'nachos', cat: 'extra', name: 'Начос', nameUz: 'Nachos', en: 'Nachos', price: 3000, w: 20, kcal: 100, h: 6, vis: 'nachos', c: '#F0B22E', c2: '#FFD66B' },
  { id: 'poppers', cat: 'extra', name: 'Халапеньо-попперсы', nameUz: 'Xalapenyo-poppers', shortUz: 'Poppers', short: 'Попперсы', en: 'Jalapeño poppers', price: 6000, w: 40, kcal: 130, h: 12, vis: 'poppers', c: '#D9832A', c2: '#F2B25C', hot: 2 },
  { id: 'macncheese', cat: 'extra', name: 'Мак-н-чиз котлета', nameUz: 'Mak-n-chiz kotlet', shortUz: 'Mak-n-chiz', short: 'Мак-н-чиз', en: 'Mac&cheese patty', price: 8000, w: 70, kcal: 220, h: 14, vis: 'mac', c: '#F2A124', c2: '#FFD27A' },
];

export const ING = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

// Состав в формате "сверху вниз", булочки — "top:<id>" / "bottom:<id>" / "mid:<id>"
const B = (id, ...mid) => [`top:${id}`, ...mid, `bottom:${id}`];

export const SIZE_PRESETS = [
  { id: 'mini', name: 'Mini', layers: B('potato', 'ketchup', 'pickles', 'cheddar', 'smash') },
  { id: 'standard', name: 'Standard', layers: B('brioche', 'labsauce', 'lettuce', 'tomato', 'onion', 'cheddar', 'beef') },
  { id: 'big', name: 'Big', layers: B('sesame', 'labsauce', 'lettuce', 'tomato', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'pickles') },
  { id: 'custom', name: 'Custom', layers: null },
];

export const DEFAULT_LAYERS = SIZE_PRESETS[1].layers;

// ── Меню готовых блюд (раздел «Меню» в приложении) ──
// Разделы меню. «Хит продаж» — не раздел, а отметка hit у товара (показывается отдельной вкладкой).
export const PRODUCT_CATS = [
  { id: 'burgers', name: 'Бургеры', nameUz: 'Burgerlar', icon: 'lunch_dining' },
  { id: 'hotdogs', name: 'Хот-доги', nameUz: 'Hot-doglar', icon: 'kebab_dining' },
  { id: 'healthy', name: 'ПП-сеты', nameUz: 'PP-setlar', icon: 'eco' },
  { id: 'snacks', name: 'Закуски', nameUz: 'Gazaklar', icon: 'fastfood' },
  { id: 'sauces', name: 'Соусы', nameUz: 'Souslar', icon: 'water_drop' },
  { id: 'drinks', name: 'Напитки', nameUz: 'Ichimliklar', icon: 'local_drink' },
  { id: 'desserts', name: 'Десерты', nameUz: 'Desertlar', icon: 'cake' },
];
export const PROD = {};
// Разделы, которые предлагаем «добавить к заказу» в корзине
export const UPSELL_CATS = ['sauces', 'drinks', 'snacks', 'desserts'];

// keys — слои бургера (картинка и «изменить состав» в конструкторе), spicy — можно выбрать «острый / не острый»
export const PRODUCTS = [
  { id: 'b_classic', cat: 'burgers', name: 'Классический', nameUz: 'Klassik', note: 'Говядина, чеддер, овощи, BurgerLab Sauce', noteUz: "Mol go'shti, chedder, sabzavotlar, BurgerLab Sauce", price: 39000, hit: true, spicy: true, keys: B('brioche', 'labsauce', 'lettuce', 'tomato', 'onion', 'cheddar', 'beef') },
  { id: 'b_cheese', cat: 'burgers', name: 'Чизбургер', nameUz: 'Chizburger', note: 'Двойной чеддер и маринованные огурцы', noteUz: "Ikki qavat chedder va tuzlangan bodring", price: 35000, spicy: true, keys: B('potato', 'ketchup', 'mustard', 'pickles', 'cheddar', 'beef', 'cheddar') },
  { id: 'b_double', cat: 'burgers', name: 'Двойной бургер', nameUz: 'Ikki karra burger', note: 'Две котлеты, бекон, двойной сыр', noteUz: "Ikki kotlet, bekon, ikki qavat pishloq", price: 62000, hit: true, spicy: true, keys: B('sesame', 'labsauce', 'lettuce', 'tomato', 'cheddar', 'beef', 'bacon', 'cheddar', 'beef', 'pickles') },
  { id: 'b_chicken', cat: 'burgers', name: 'Криспи чикен', nameUz: 'Krispi chiken', note: 'Хрустящая курица, салат, чесночный соус', noteUz: "Qarsildoq tovuq, salat, sarimsoqli sous", price: 36000, spicy: true, keys: B('brioche', 'garlic', 'lettuce', 'tomato', 'mozzarella', 'chicken') },
  { id: 'b_fire', cat: 'burgers', name: 'Чили Файр', nameUz: 'Chili Fayr', note: 'Халапеньо, шрирача, угольная булочка', noteUz: "Xalapenyo, shriracha, ko'mir bulochka", price: 45000, spicy: true, keys: B('charcoal', 'sriracha', 'jalapeno', 'poppers', 'cheddar', 'beef', 'pepper', 'onion') },
  { id: 'b_wagyu', cat: 'burgers', name: 'Вагю Рояль', nameUz: 'Vagyu Royal', note: 'Мраморная говядина, трюфельный майонез', noteUz: "Marmar mol go'shti, tryufelli mayonez", price: 89000, keys: B('brioche', 'truffle', 'lettuce', 'gouda', 'wagyu', 'caramel', 'mushroom') },

  { id: 'h_classic', cat: 'hotdogs', name: 'Классический хот-дог', nameUz: 'Klassik hot-dog', note: 'Говяжья сосиска, кетчуп, горчица', noteUz: "Mol go'shti sosiskasi, ketchup, xantal", price: 22000, w: 180, kcal: 420, hit: true, spicy: true },
  { id: 'h_danish', cat: 'hotdogs', name: 'Датский хот-дог', nameUz: 'Daniya hot-dogi', note: 'Хрустящий лук, огурцы, соус ремулад', noteUz: "Qarsildoq piyoz, bodring, remulad sousi", price: 26000, w: 200, kcal: 480, spicy: true },
  { id: 'h_chili', cat: 'hotdogs', name: 'Чили-дог', nameUz: 'Chili-dog', note: 'Острый соус чили, халапеньо, чеддер', noteUz: "Achchiq chili sousi, xalapenyo, chedder", price: 28000, w: 220, kcal: 530, spicy: true },
  { id: 'h_cheese', cat: 'hotdogs', name: 'Сырный хот-дог', nameUz: 'Pishloqli hot-dog', note: 'Сырный соус и моцарелла', noteUz: "Pishloq sousi va motsarella", price: 25000, w: 200, kcal: 510 },

  { id: 'pp_chicken', cat: 'healthy', name: 'ПП-сет с курицей', nameUz: 'Tovuqli PP-set', note: 'Курица гриль, киноа, свежие овощи', noteUz: "Grilda tovuq, kinoa, yangi sabzavotlar", price: 42000, w: 350, kcal: 410, hit: true },
  { id: 'pp_lettuce', cat: 'healthy', name: 'Бургер в листьях салата', nameUz: 'Salat bargida burger', note: 'Без булочки: говядина, авокадо, томаты', noteUz: "Bulochkasiz: mol go'shti, avokado, pomidor", price: 39000, w: 280, kcal: 330 },
  { id: 'pp_bowl', cat: 'healthy', name: 'Боул с лососем', nameUz: "Losos bilan boul", note: 'Рис, лосось, огурец, эдамаме', noteUz: "Guruch, losos, bodring, edamame", price: 55000, w: 330, kcal: 460 },

  { id: 'up_fries', cat: 'snacks', name: 'Картофель фри', nameUz: 'Kartoshka fri', note: 'Хрустящий, 150 г', noteUz: 'Qarsildoq, 150 g', price: 12000, icon: 'fastfood', w: 150, kcal: 410, hit: true },
  { id: 's_nuggets', cat: 'snacks', name: 'Наггетсы, 6 шт', nameUz: 'Nagetslar, 6 dona', note: 'Куриные, с соусом на выбор', noteUz: "Tovuqli, sous tanlash mumkin", price: 18000, icon: 'tapas', w: 120, kcal: 300 },
  { id: 's_rings', cat: 'snacks', name: 'Луковые кольца', nameUz: 'Piyoz halqalari', note: '8 штук в панировке', noteUz: '8 dona, panirovkada', price: 14000, icon: 'tapas', w: 110, kcal: 330 },

  { id: 'up_dip', cat: 'sauces', name: 'BurgerLab Sauce', nameUz: 'BurgerLab Sauce', note: 'Фирменный, 50 мл', noteUz: 'Firmaviy, 50 ml', price: 3000, icon: 'water_drop', w: 50, kcal: 160 },
  { id: 'sc_cheese', cat: 'sauces', name: 'Сырный соус', nameUz: 'Pishloq sousi', note: '50 мл', noteUz: '50 ml', price: 3000, icon: 'water_drop', w: 50, kcal: 150 },
  { id: 'sc_bbq', cat: 'sauces', name: 'Соус BBQ', nameUz: 'BBQ sousi', note: '50 мл', noteUz: '50 ml', price: 3000, icon: 'water_drop', w: 50, kcal: 90 },
  { id: 'sc_garlic', cat: 'sauces', name: 'Чесночный соус', nameUz: 'Sarimsoqli sous', note: '50 мл', noteUz: '50 ml', price: 3000, icon: 'water_drop', w: 50, kcal: 170 },
  { id: 'sc_chili', cat: 'sauces', name: 'Острый чили', nameUz: 'Achchiq chili', note: '50 мл', noteUz: '50 ml', price: 3000, icon: 'water_drop', w: 50, kcal: 60 },

  { id: 'up_drink', cat: 'drinks', name: 'Лимонад BurgerLab', nameUz: 'BurgerLab limonadi', note: 'Апельсин-маракуйя, 0,5 л', noteUz: "Apelsin-marakuyya, 0,5 l", price: 9000, icon: 'local_drink', w: 500, kcal: 180 },
  { id: 'd_cola', cat: 'drinks', name: 'Coca-Cola', nameUz: 'Coca-Cola', note: '0,5 л', noteUz: '0,5 l', price: 8000, icon: 'local_drink', w: 500, kcal: 210, hit: true },
  { id: 'd_water', cat: 'drinks', name: 'Вода без газа', nameUz: 'Gazsiz suv', note: '0,5 л', noteUz: '0,5 l', price: 4000, icon: 'water_bottle', w: 500, kcal: 0 },
  { id: 'd_ayran', cat: 'drinks', name: 'Айран', nameUz: 'Ayron', note: '0,4 л', noteUz: '0,4 l', price: 6000, icon: 'local_cafe', w: 400, kcal: 120 },

  { id: 'up_dessert', cat: 'desserts', name: 'Чизкейк', nameUz: 'Chizkeyk', note: 'Нью-Йорк, 120 г', noteUz: "Nyu-York, 120 g", price: 16000, icon: 'cake', w: 120, kcal: 390 },
];

// ── Единый справочник статусов заказа (приложение, касса, бот) ──
// ms — иконка в интерфейсе, icon — эмодзи для сообщений бота
export const STATUSES = {
  created: { t: 'Заказ оформлен', d: 'Заказ принят системой и отправлен на кассу', icon: '🧾', ms: 'receipt' },
  received: { t: 'Заказ на кассе', d: 'Касса получила заказ и скоро его подтвердит', icon: '📥', ms: 'point_of_sale' },
  accepted: { t: 'Принят в работу', d: 'Кассир подтвердил заказ', icon: '✅', ms: 'check_circle' },
  cooking: { t: 'Готовится', d: 'Котлеты уже на гриле, повар собирает слои по рецепту', icon: '👨‍🍳', ms: 'cooking' },
  ready: { t: 'Готов', d: 'Заказ готов', icon: '🍔', ms: 'lunch_dining' },
  delivering: { t: 'Доставляется', d: 'Курьер забрал заказ и едет к вам', icon: '🛵', ms: 'two_wheeler' },
  done: { t: 'Завершён', d: 'Приятного аппетита!', icon: '🎉', ms: 'done_all' },
  cancelled: { t: 'Отменён', d: 'Заказ отменён', icon: '❌', ms: 'cancel' },
};

// Этапы для каждого способа получения
export const FLOWS = {
  delivery: ['created', 'received', 'accepted', 'cooking', 'ready', 'delivering', 'done'],
  pickup: ['created', 'received', 'accepted', 'cooking', 'ready', 'done'],
  hall: ['created', 'received', 'accepted', 'cooking', 'ready', 'done'],
};

export const MODES = {
  delivery: { t: 'Доставка', icon: 'delivery_dining' },
  pickup: { t: 'Самовывоз', icon: 'directions_run' },
  hall: { t: 'В зале', icon: 'table_restaurant' },
};

// Способы оплаты. online — оплата в приложении (Click / Payme, пока тестовый режим)
export const PAYMENTS = {
  click: { t: 'Click', online: true },
  payme: { t: 'Payme', online: true },
  cash: { t: 'Наличные', icon: 'payments' },
  card: { t: 'Картой курьеру', tHall: 'Картой на кассе', icon: 'credit_card' },
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
  // Реферальная программа: бонус в котлетках приглашённому и пригласившему после первого выполненного заказа.
  // 1 котлетка = rate сум; котлетками можно оплатить до maxPercent % заказа.
  referral: { enabled: true, inviterBonus: 15, inviteeBonus: 10, rate: 1000, maxPercent: 50 },
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
const DEFAULT_MENU = clone({ categories: CATEGORIES, ingredients: INGREDIENTS, productCats: PRODUCT_CATS, products: PRODUCTS });
export const defaultMenu = () => clone(DEFAULT_MENU);

for (const p of PRODUCTS) PROD[p.id] = p;
export const SETTINGS = clone(DEFAULT_SETTINGS);
export const STOP = {};

const replaceAll = (arr, next) => { if (Array.isArray(next)) arr.splice(0, arr.length, ...next); };

export function applyMenu(m) {
  if (!m) return;
  replaceAll(CATEGORIES, m.categories);
  replaceAll(INGREDIENTS, m.ingredients);
  replaceAll(PRODUCT_CATS, m.productCats);
  replaceAll(PRODUCTS, m.products);
  for (const k of Object.keys(ING)) delete ING[k];
  for (const i of INGREDIENTS) ING[i.id] = i;
  for (const k of Object.keys(PROD)) delete PROD[k];
  for (const p of PRODUCTS) PROD[p.id] = p;
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
