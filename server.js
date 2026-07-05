const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

// База данных
const DB_FILE = 'database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {
    users: {},
    messages: {},
    friendRequests: {},
    groups: {},
    channels: {},
    market: [] // Рынок
};

// Динамические админы (xqzas всегда админ)
let ADMINS = db.admins || ['xqzas', 'Pidor'];
if (!ADMINS.includes('xqzas')) ADMINS.unshift('xqzas');

if (!db.shop) {
    db.shop = {
        gifts: [
            { id: 'heart', name: '❤️ Сердце', price: 10, emoji: '❤️', sellPrice: 5 },
            { id: 'star', name: '⭐ Звезда', price: 25, emoji: '⭐', sellPrice: 12 },
            { id: 'diamond', name: '💎 Бриллиант', price: 100, emoji: '💎', sellPrice: 50 },
            { id: 'crown', name: '👑 Корона', price: 250, emoji: '👑', sellPrice: 125 },
            { id: 'rocket', name: '🚀 Ракета', price: 500, emoji: '🚀', sellPrice: 250 },
            { id: 'fire', name: '🔥 Огонь', price: 50, emoji: '🔥', sellPrice: 25 },
            { id: 'rainbow', name: '🌈 Радуга', price: 150, emoji: '🌈', sellPrice: 75 },
            { id: 'unicorn', name: '🦄 Единорог', price: 300, emoji: '🦄', sellPrice: 150 },
            { id: 'katana', name: '⚔️ Катана', price: 5000, emoji: '⚔️', sellPrice: 2500, limited: true, maxOwners: 1 }
        ],
        nfts: [
            { id: 'nft_cat', name: 'Космический Кот', price: 1000, image: '🐱', rarity: 'legendary', sellPrice: 500, upgradeable: true, maxLevel: 5 },
            { id: 'nft_dragon', name: 'Дракон', price: 750, image: '🐉', rarity: 'epic', sellPrice: 375, upgradeable: true, maxLevel: 3 },
            { id: 'nft_phoenix', name: 'Феникс', price: 500, image: '🔥', rarity: 'rare', sellPrice: 250, upgradeable: true },
            { id: 'nft_robot', name: 'Робот', price: 300, image: '🤖', rarity: 'uncommon', sellPrice: 150, upgradeable: true },
            { id: 'nft_neon', name: 'Неон Волна', price: 2000, image: '🌊', rarity: 'neon', sellPrice: 1000, upgradeable: true },
            { id: 'nft_rainbow', name: 'Радужный Кристалл', price: 3000, image: '💠', rarity: 'rainbow', sellPrice: 1500, upgradeable: true },
            { id: 'nft_mythic', name: 'Мифический Дракон', price: 5000, image: '🐲', rarity: 'mythic', sellPrice: 2500, upgradeable: true }
        ],
        limitedOwners: {},
        dailyChestGifts: ['heart', 'star', 'fire']
    };
}
if (!db.groups) db.groups = {};
if (!db.channels) db.channels = {};
if (!db.market) db.market = [];
if (!db.admins) { db.admins = ADMINS; saveDB(); }
if (!db.settings) {
    db.settings = {
        maintenance: false,
        maintenanceMessage: 'Сайт на техническом обслуживании. Пожалуйста, подождите.',
        globalTheme: null,
        priceIncrease: { enabled: false, percent: 5 },
        customRarities: []
    };
    saveDB();
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== СИСТЕМА АВТОМАТИЧЕСКИХ БЭКАПОВ =====
const BACKUP_DIR = 'backups';
const BACKUP_INTERVAL = 60 * 60 * 1000; // Каждый час
const MAX_BACKUPS = 24; // Хранить последние 24 бэкапа

// Создать папку для бэкапов
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `database_${timestamp}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(db, null, 2));
        console.log(`✅ Бэкап создан: ${backupFile}`);
        
        // Удалить старые бэкапы
        const backups = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('database_') && f.endsWith('.json'))
            .sort()
            .reverse();
        
        if (backups.length > MAX_BACKUPS) {
            backups.slice(MAX_BACKUPS).forEach(oldBackup => {
                fs.unlinkSync(path.join(BACKUP_DIR, oldBackup));
                console.log(`🗑️ Удалён старый бэкап: ${oldBackup}`);
            });
        }
    } catch (err) {
        console.error('❌ Ошибка создания бэкапа:', err);
    }
}

// Создать бэкап при запуске
createBackup();

// Автоматические бэкапы каждый час
setInterval(createBackup, BACKUP_INTERVAL);

// Онлайн пользователи
const onlineUsers = new Map();

// Проверка админа
function isAdmin(username) {
    return ADMINS.includes(username);
}

io.on('connection', (socket) => {
    let currentUser = null;

    // Регистрация
    socket.on('register', ({ username, password, displayName }) => {
        if (db.users[username]) {
            return socket.emit('register_error', 'Этот логин уже занят');
        }
        if (username.length < 3) {
            return socket.emit('register_error', 'Логин минимум 3 символа');
        }
        
        db.users[username] = {
            password,
            displayName: displayName || username,
            avatar: null,
            theme: 'dark',
            status: 'Привет! Я использую XGram',
            telegram: null,
            friends: [],
            coins: 100,
            gifts: [],
            nfts: [],
            isBanned: false,
            isMuted: false,
            lastDailyChest: 0,
            createdAt: Date.now()
        };
        saveDB();
        socket.emit('register_success');
    });

    // Вход
    socket.on('login', ({ username, password }) => {
        const user = db.users[username];
        if (!user || user.password !== password) {
            return socket.emit('login_error', 'Неверный логин или пароль');
        }
        
        if (user.isBanned) {
            return socket.emit('login_error', 'Ваш аккаунт заблокирован');
        }
        
        currentUser = username;
        socket.join(username);
        onlineUsers.set(username, socket.id);
        
        // Миграция старых пользователей
        if (user.coins === undefined) user.coins = 100;
        if (!user.gifts) user.gifts = [];
        if (!user.nfts) user.nfts = [];
        saveDB();
        
        // Уведомляем друзей о входе
        user.friends.forEach(friend => {
            io.to(friend).emit('friend_online', username);
        });
        
        socket.emit('login_success', {
            username,
            displayName: user.displayName,
            avatar: user.avatar,
            theme: user.theme,
            status: user.status,
            coins: user.coins,
            gifts: user.gifts,
            nfts: user.nfts,
            isMuted: user.isMuted,
            isAdmin: isAdmin(username),
            premium: user.premium,
            nickEmoji: user.nickEmoji,
            nickFont: user.nickFont,
            profileEffect: user.profileEffect,
            profileFrame: user.profileFrame,
            customFrameColors: user.customFrameColors,
            friends: user.friends.map(f => ({
                username: f,
                displayName: db.users[f]?.displayName || f,
                avatar: db.users[f]?.avatar,
                online: onlineUsers.has(f),
                nickEmoji: db.users[f]?.nickEmoji,
                nickFont: db.users[f]?.nickFont,
                profileEffect: db.users[f]?.profileEffect,
                profileFrame: db.users[f]?.profileFrame,
                customFrameColors: db.users[f]?.customFrameColors
            }))
        });
        
        // Отправляем историю чатов
        const chatKey = (a, b) => [a, b].sort().join('_');
        user.friends.forEach(friend => {
            const key = chatKey(username, friend);
            if (db.messages[key]) {
                socket.emit('chat_history', { friend, messages: db.messages[key] });
            }
        });
        
        // Отправляем заявки в друзья
        if (db.friendRequests[username]) {
            socket.emit('friend_requests', db.friendRequests[username]);
        }
    });

    // ===== АДМИН ФУНКЦИИ =====
    socket.on('admin_get_users', () => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const users = Object.keys(db.users).map(u => ({
            username: u,
            displayName: db.users[u].displayName,
            coins: db.users[u].coins || 0,
            isBanned: db.users[u].isBanned || false,
            isMuted: db.users[u].isMuted || false,
            isAdmin: ADMINS.includes(u),
            online: onlineUsers.has(u),
            createdAt: db.users[u].createdAt
        }));
        
        socket.emit('admin_users_list', users);
    });

    socket.on('admin_ban_user', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        db.users[username].isBanned = true;
        saveDB();
        
        // Кикнуть если онлайн
        io.to(username).emit('you_are_banned');
        socket.emit('admin_action_done', `${username} забанен`);
    });

    socket.on('admin_unban_user', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        db.users[username].isBanned = false;
        saveDB();
        socket.emit('admin_action_done', `${username} разбанен`);
    });

    socket.on('admin_mute_user', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        db.users[username].isMuted = true;
        saveDB();
        io.to(username).emit('you_are_muted');
        socket.emit('admin_action_done', `${username} замучен`);
    });

    socket.on('admin_unmute_user', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        db.users[username].isMuted = false;
        saveDB();
        io.to(username).emit('you_are_unmuted');
        socket.emit('admin_action_done', `${username} размучен`);
    });

    socket.on('admin_add_coins', ({ username, amount }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        db.users[username].coins = (db.users[username].coins || 0) + amount;
        saveDB();
        
        io.to(username).emit('coins_updated', db.users[username].coins);
        socket.emit('admin_action_done', `${username} получил ${amount} котиков`);
    });

    socket.on('admin_gift_user', ({ username, giftId }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        const gift = db.shop.gifts.find(g => g.id === giftId);
        if (!gift) return;
        
        if (!db.users[username].gifts) db.users[username].gifts = [];
        db.users[username].gifts.push({
            ...gift,
            from: currentUser,
            date: Date.now()
        });
        saveDB();
        
        io.to(username).emit('gift_received', {
            gift,
            from: currentUser,
            fromName: db.users[currentUser].displayName
        });
        socket.emit('admin_action_done', `Подарок отправлен ${username}`);
    });

    socket.on('admin_gift_nft', ({ username, nftId }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        const nft = db.shop.nfts.find(n => n.id === nftId);
        if (!nft) return;
        
        if (!db.users[username].nfts) db.users[username].nfts = [];
        db.users[username].nfts.push({
            ...nft,
            from: currentUser,
            date: Date.now(),
            tokenId: Date.now().toString(36)
        });
        saveDB();
        
        io.to(username).emit('nft_received', {
            nft,
            from: currentUser,
            fromName: db.users[currentUser].displayName
        });
        socket.emit('admin_action_done', `NFT отправлен ${username}`);
    });

    // ===== МАГАЗИН =====
    socket.on('get_shop', () => {
        socket.emit('shop_data', db.shop);
    });

    // Генерация уникального кода
    function generateCode(rarity) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    socket.on('buy_gift', (giftId) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        const gift = db.shop.gifts.find(g => g.id === giftId);
        
        if (!gift) return socket.emit('shop_error', 'Подарок не найден');
        if (user.coins < gift.price) return socket.emit('shop_error', 'Недостаточно котиков');
        
        // Проверка премиум-эксклюзивного товара
        if (gift.premiumOnly && !user.premium) {
            return socket.emit('shop_error', 'Этот товар только для премиум!');
        }
        
        // Проверка лимитированного товара
        if (gift.limited) {
            if (!db.shop.limitedOwners) db.shop.limitedOwners = {};
            if (!db.shop.limitedOwners[giftId]) db.shop.limitedOwners[giftId] = [];
            
            if (db.shop.limitedOwners[giftId].length >= (gift.maxOwners || 1)) {
                return socket.emit('shop_error', 'Этот предмет уже куплен!');
            }
            if (db.shop.limitedOwners[giftId].includes(currentUser)) {
                return socket.emit('shop_error', 'У вас уже есть этот предмет!');
            }
            db.shop.limitedOwners[giftId].push(currentUser);
        }
        
        user.coins -= gift.price;
        if (!user.gifts) user.gifts = [];
        user.gifts.push({ ...gift, date: Date.now(), code: generateCode() });
        saveDB();
        
        socket.emit('purchase_success', { type: 'gift', item: gift, newBalance: user.coins });
    });

    socket.on('buy_nft', (nftId) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        const nft = db.shop.nfts.find(n => n.id === nftId);
        
        if (!nft) return socket.emit('shop_error', 'NFT не найден');
        if (user.coins < nft.price) return socket.emit('shop_error', 'Недостаточно котиков');
        
        // Проверка премиум-эксклюзивного NFT
        if (nft.premiumOnly && !user.premium) {
            return socket.emit('shop_error', 'Этот NFT только для премиум!');
        }
        
        user.coins -= nft.price;
        if (!user.nfts) user.nfts = [];
        user.nfts.push({ 
            ...nft, 
            date: Date.now(), 
            tokenId: Date.now().toString(36),
            code: generateCode(),
            level: 1,
            upgradeable: true
        });
        saveDB();
        
        socket.emit('purchase_success', { type: 'nft', item: nft, newBalance: user.coins });
    });

    // Покупка премиума
    socket.on('buy_premium', () => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        if (user.premium) {
            return socket.emit('shop_error', 'У вас уже есть Premium!');
        }
        
        if (user.coins < 500) {
            return socket.emit('shop_error', 'Недостаточно котиков! Нужно 500 🐱');
        }
        
        user.coins -= 500;
        user.premium = true;
        saveDB();
        
        socket.emit('premium_activated', { newBalance: user.coins });
    });

    socket.on('send_gift', ({ to, giftId }) => {
        if (!currentUser || !db.users[to]) return;
        const user = db.users[currentUser];
        
        const giftIndex = user.gifts?.findIndex(g => g.id === giftId);
        if (giftIndex === -1 || giftIndex === undefined) {
            return socket.emit('shop_error', 'У вас нет этого подарка');
        }
        
        const gift = user.gifts.splice(giftIndex, 1)[0];
        if (!db.users[to].gifts) db.users[to].gifts = [];
        db.users[to].gifts.push({ ...gift, from: currentUser, date: Date.now() });
        
        // Отправить как сообщение в чат
        const chatKey = [currentUser, to].sort().join('_');
        if (!db.messages[chatKey]) db.messages[chatKey] = [];
        
        const giftMessage = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            from: currentUser,
            to,
            text: `Подарил ${gift.emoji} ${gift.name}`,
            type: 'gift',
            gift: gift,
            timestamp: Date.now(),
            read: false
        };
        
        db.messages[chatKey].push(giftMessage);
        saveDB();
        
        socket.emit('message_sent', giftMessage);
        io.to(to).emit('new_message', giftMessage);
        
        io.to(to).emit('gift_received', {
            gift,
            from: currentUser,
            fromName: user.displayName
        });
        socket.emit('gift_sent', { to, gift });
    });

    // Создание своего NFT (только для админов)
    socket.on('create_custom_nft', ({ name, image }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const customNft = {
            id: 'custom_' + Date.now(),
            name: name || 'Custom NFT',
            image: image, // base64 изображение
            rarity: 'legendary',
            isCustom: true,
            creator: currentUser,
            date: Date.now(),
            tokenId: Date.now().toString(36)
        };
        
        if (!db.users[currentUser].nfts) db.users[currentUser].nfts = [];
        db.users[currentUser].nfts.push(customNft);
        saveDB();
        
        socket.emit('custom_nft_created', customNft);
    });

    // Продажа подарка
    socket.on('sell_gift', (giftIndex) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        if (!user.gifts || !user.gifts[giftIndex]) {
            return socket.emit('shop_error', 'Подарок не найден');
        }
        
        const gift = user.gifts[giftIndex];
        const sellPrice = gift.sellPrice || Math.floor(gift.price / 2);
        
        user.gifts.splice(giftIndex, 1);
        user.coins += sellPrice;
        saveDB();
        
        socket.emit('gift_sold', { sellPrice, newBalance: user.coins, gifts: user.gifts });
    });

    // Продажа NFT
    socket.on('sell_nft', (nftIndex) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        if (!user.nfts || !user.nfts[nftIndex]) {
            return socket.emit('shop_error', 'NFT не найден');
        }
        
        const nft = user.nfts[nftIndex];
        const sellPrice = nft.sellPrice || Math.floor(nft.price / 2);
        
        user.nfts.splice(nftIndex, 1);
        user.coins += sellPrice;
        saveDB();
        
        socket.emit('nft_sold', { sellPrice, newBalance: user.coins, nfts: user.nfts });
    });

    // ===== РЫНОК =====
    socket.on('get_market', () => {
        socket.emit('market_data', db.market);
    });

    // Выставить на рынок
    socket.on('list_on_market', ({ type, index, price }) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        let item;
        if (type === 'gift') {
            if (!user.gifts || !user.gifts[index]) return socket.emit('market_error', 'Подарок не найден');
            item = user.gifts.splice(index, 1)[0];
        } else if (type === 'nft') {
            if (!user.nfts || !user.nfts[index]) return socket.emit('market_error', 'NFT не найден');
            item = user.nfts.splice(index, 1)[0];
        } else {
            return;
        }
        
        const listing = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            type,
            item,
            price: Math.max(1, price),
            seller: currentUser,
            sellerName: user.displayName,
            listedAt: Date.now()
        };
        
        db.market.push(listing);
        saveDB();
        
        socket.emit('listed_on_market', listing);
        io.emit('market_updated', db.market);
    });

    // Купить с рынка
    socket.on('buy_from_market', (listingId) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        const listingIndex = db.market.findIndex(l => l.id === listingId);
        if (listingIndex === -1) return socket.emit('market_error', 'Лот не найден');
        
        const listing = db.market[listingIndex];
        if (listing.seller === currentUser) return socket.emit('market_error', 'Нельзя купить свой лот');
        if (user.coins < listing.price) return socket.emit('market_error', 'Недостаточно котиков');
        
        // Снять котики у покупателя
        user.coins -= listing.price;
        
        // Дать котики продавцу (минус 10% комиссия)
        const sellerEarnings = Math.floor(listing.price * 0.9);
        if (db.users[listing.seller]) {
            db.users[listing.seller].coins = (db.users[listing.seller].coins || 0) + sellerEarnings;
            io.to(listing.seller).emit('market_sale', { item: listing.item, earnings: sellerEarnings, buyer: user.displayName });
        }
        
        // Дать предмет покупателю
        if (listing.type === 'gift') {
            if (!user.gifts) user.gifts = [];
            user.gifts.push(listing.item);
        } else {
            if (!user.nfts) user.nfts = [];
            user.nfts.push(listing.item);
        }
        
        // Удалить лот
        db.market.splice(listingIndex, 1);
        saveDB();
        
        socket.emit('market_purchase', { item: listing.item, newBalance: user.coins });
        io.emit('market_updated', db.market);
    });

    // Снять с рынка
    socket.on('unlist_from_market', (listingId) => {
        if (!currentUser) return;
        
        const listingIndex = db.market.findIndex(l => l.id === listingId && l.seller === currentUser);
        if (listingIndex === -1) return socket.emit('market_error', 'Лот не найден');
        
        const listing = db.market.splice(listingIndex, 1)[0];
        const user = db.users[currentUser];
        
        // Вернуть предмет
        if (listing.type === 'gift') {
            if (!user.gifts) user.gifts = [];
            user.gifts.push(listing.item);
        } else {
            if (!user.nfts) user.nfts = [];
            user.nfts.push(listing.item);
        }
        saveDB();
        
        socket.emit('unlisted_from_market', { item: listing.item });
        io.emit('market_updated', db.market);
    });

    // Создать кастомный подарок (только админ)
    socket.on('create_custom_gift', ({ name, emoji, price, rarity }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        // Генерация уникального кода
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        const gift = {
            id: 'custom_gift_' + Date.now(),
            name: emoji + ' ' + name,
            emoji,
            price,
            sellPrice: Math.floor(price / 2),
            isCustom: true,
            creator: currentUser,
            rarity: rarity || 'common',
            code
        };
        
        db.shop.gifts.push(gift);
        saveDB();
        
        socket.emit('custom_gift_created', gift);
    });

    // Улучшить NFT (по редкостям как подарки)
    socket.on('upgrade_nft', (nftIndex) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        if (!user.nfts || !user.nfts[nftIndex]) return socket.emit('shop_error', 'NFT не найден');
        
        const nft = user.nfts[nftIndex];
        
        // Редкости: common → uncommon → rare → epic → legendary → mythic → neon → rainbow
        const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'neon', 'rainbow'];
        const currentRarity = nft.rarity || 'common';
        const currentIndex = rarities.indexOf(currentRarity);
        
        if (currentIndex >= rarities.length - 1) {
            return socket.emit('shop_error', 'Максимальная редкость!');
        }
        
        const upgradeCost = (currentIndex + 1) * 100; // 100, 200, 300...
        if (user.coins < upgradeCost) return socket.emit('shop_error', `Нужно ${upgradeCost} котиков`);
        
        user.coins -= upgradeCost;
        nft.rarity = rarities[currentIndex + 1];
        nft.sellPrice = Math.floor((nft.sellPrice || nft.price / 2) * 1.5);
        saveDB();
        
        socket.emit('nft_upgraded', { nft, newBalance: user.coins, nfts: user.nfts, newRarity: nft.rarity });
    });

    // Удалить подарок
    socket.on('delete_gift', (giftIndex) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        if (!user.gifts || !user.gifts[giftIndex]) return;
        
        user.gifts.splice(giftIndex, 1);
        saveDB();
        
        socket.emit('gift_deleted', { gifts: user.gifts });
    });

    // Удалить NFT
    socket.on('delete_nft', (nftIndex) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        if (!user.nfts || !user.nfts[nftIndex]) return;
        
        user.nfts.splice(nftIndex, 1);
        saveDB();
        
        socket.emit('nft_deleted', { nfts: user.nfts });
    });

    // Выдать/забрать админку
    socket.on('admin_toggle_admin', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return;
        
        if (ADMINS.includes(username)) {
            // Забрать админку (нельзя у xqzas)
            if (username === 'xqzas') return socket.emit('admin_action_done', 'Нельзя забрать админку у главного админа');
            ADMINS = ADMINS.filter(a => a !== username);
        } else {
            // Дать админку
            ADMINS.push(username);
        }
        
        db.admins = ADMINS;
        saveDB();
        
        io.to(username).emit('admin_status_changed', ADMINS.includes(username));
        socket.emit('admin_action_done', ADMINS.includes(username) ? `${username} теперь админ` : `${username} больше не админ`);
    });

    // Ежедневный сундук
    socket.on('claim_daily_chest', () => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        const now = Date.now();
        const lastClaim = user.lastDailyChest || 0;
        const dayMs = 24 * 60 * 60 * 1000;
        
        if (now - lastClaim < dayMs) {
            const timeLeft = dayMs - (now - lastClaim);
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const mins = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            return socket.emit('chest_error', `Следующий сундук через ${hours}ч ${mins}м`);
        }
        
        // Выдать случайный подарок
        const chestGifts = db.shop.dailyChestGifts || ['heart', 'star', 'fire'];
        const randomGiftId = chestGifts[Math.floor(Math.random() * chestGifts.length)];
        const gift = db.shop.gifts.find(g => g.id === randomGiftId);
        
        if (!user.gifts) user.gifts = [];
        user.gifts.push({ ...gift, date: Date.now(), fromChest: true });
        user.lastDailyChest = now;
        
        // Бонус котиков
        const bonusCoins = Math.floor(Math.random() * 20) + 10;
        user.coins += bonusCoins;
        saveDB();
        
        socket.emit('chest_claimed', { gift, bonusCoins, newBalance: user.coins, gifts: user.gifts });
    });

    // Получить профиль пользователя
    socket.on('get_user_profile', (username) => {
        if (!currentUser || !db.users[username]) return;
        
        const user = db.users[username];
        socket.emit('user_profile', {
            username,
            displayName: user.displayName,
            avatar: user.avatar,
            status: user.status,
            telegram: user.telegram,
            online: onlineUsers.has(username),
            friendsCount: user.friends?.length || 0,
            giftsCount: user.gifts?.length || 0,
            nftsCount: user.nfts?.length || 0,
            gifts: user.gifts?.slice(-10) || [],
            createdAt: user.createdAt,
            isFriend: db.users[currentUser].friends.includes(username)
        });
    });

    // ===== ГРУППЫ =====
    socket.on('create_group', ({ name, avatar, members }) => {
        if (!currentUser) return;
        
        const groupId = 'group_' + Date.now();
        const groupMembers = [currentUser];
        
        // Добавляем выбранных друзей
        if (members && Array.isArray(members)) {
            members.forEach(member => {
                if (db.users[member] && !groupMembers.includes(member)) {
                    groupMembers.push(member);
                }
            });
        }
        
        db.groups[groupId] = {
            id: groupId,
            name,
            avatar: avatar || '👥',
            owner: currentUser,
            admins: [currentUser],
            members: groupMembers,
            messages: [],
            isPublic: true,
            createdAt: Date.now()
        };
        saveDB();
        
        // Присоединяем создателя
        socket.join(groupId);
        socket.emit('group_created', db.groups[groupId]);
        
        // Уведомляем добавленных участников
        groupMembers.forEach(member => {
            if (member !== currentUser) {
                io.to(member).emit('added_to_group', {
                    group: db.groups[groupId],
                    addedBy: db.users[currentUser].displayName || currentUser
                });
            }
        });
    });

    socket.on('get_my_groups', () => {
        if (!currentUser) return;
        
        const myGroups = Object.values(db.groups).filter(g => g.members.includes(currentUser));
        socket.emit('my_groups', myGroups);
    });

    // Получить все публичные группы
    socket.on('get_all_groups', () => {
        if (!currentUser) return;
        const allGroups = Object.values(db.groups).map(g => ({
            id: g.id,
            name: g.name,
            avatar: g.avatar,
            owner: g.owner,
            ownerName: db.users[g.owner]?.displayName || g.owner,
            membersCount: g.members.length,
            isMember: g.members.includes(currentUser)
        }));
        socket.emit('all_groups', allGroups);
    });

    // Получить все каналы
    socket.on('get_all_channels', () => {
        if (!currentUser) return;
        const allChannels = Object.values(db.channels).map(c => ({
            id: c.id,
            name: c.name,
            avatar: c.avatar,
            description: c.description,
            owner: c.owner,
            ownerName: db.users[c.owner]?.displayName || c.owner,
            subscribersCount: c.subscribers.length,
            isSubscribed: c.subscribers.includes(currentUser)
        }));
        socket.emit('all_channels', allChannels);
    });

    // Получить мои группы и каналы
    socket.on('get_my_communities', () => {
        if (!currentUser) return;
        
        const myGroups = Object.values(db.groups)
            .filter(g => g.members && g.members.includes(currentUser))
            .map(g => ({
                id: g.id,
                name: g.name,
                membersCount: g.members?.length || 0,
                owner: g.owner
            }));
        
        const myChannels = Object.values(db.channels)
            .filter(c => c.subscribers && c.subscribers.includes(currentUser))
            .map(c => ({
                id: c.id,
                name: c.name,
                subscribersCount: c.subscribers?.length || 0,
                owner: c.owner
            }));
        
        socket.emit('my_communities', { groups: myGroups, channels: myChannels });
    });

    // Получить сообщения группы
    socket.on('get_group_messages', (groupId) => {
        if (!currentUser || !db.groups[groupId]) return;
        if (!db.groups[groupId].members.includes(currentUser)) return;
        
        socket.join(groupId);
        socket.emit('group_messages', { 
            groupId, 
            messages: db.groups[groupId].messages || [] 
        });
    });

    // Получить сообщения канала
    socket.on('get_channel_messages', (channelId) => {
        if (!currentUser || !db.channels[channelId]) return;
        if (!db.channels[channelId].subscribers.includes(currentUser)) return;
        
        socket.join(channelId);
        socket.emit('channel_messages', { 
            channelId, 
            messages: db.channels[channelId].messages || [] 
        });
    });

    socket.on('join_group', (groupId) => {
        if (!currentUser || !db.groups[groupId]) return;
        
        if (!db.groups[groupId].members.includes(currentUser)) {
            db.groups[groupId].members.push(currentUser);
            saveDB();
        }
        socket.join(groupId);
        socket.emit('group_joined', db.groups[groupId]);
    });

    socket.on('send_group_message', ({ groupId, text, type, media }) => {
        if (!currentUser || !db.groups[groupId]) return;
        if (!db.groups[groupId].members.includes(currentUser)) return;
        
        const message = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            from: currentUser,
            fromName: db.users[currentUser].displayName,
            fromAvatar: db.users[currentUser].avatar,
            text,
            type: type || 'text',
            media,
            timestamp: Date.now()
        };
        
        if (!db.groups[groupId].messages) db.groups[groupId].messages = [];
        db.groups[groupId].messages.push(message);
        if (db.groups[groupId].messages.length > 500) {
            db.groups[groupId].messages = db.groups[groupId].messages.slice(-500);
        }
        saveDB();
        
        io.to(groupId).emit('new_group_message', { groupId, message });
    });

    // Отправить сообщение в канал (только владелец)
    socket.on('send_channel_message', ({ channelId, text }) => {
        if (!currentUser || !db.channels[channelId]) return;
        
        // Только владелец может писать
        if (db.channels[channelId].owner !== currentUser) {
            return socket.emit('channel_error', 'Только владелец может писать в канал');
        }
        
        const message = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            from: currentUser,
            fromName: db.users[currentUser].displayName,
            text,
            timestamp: Date.now()
        };
        
        if (!db.channels[channelId].messages) db.channels[channelId].messages = [];
        db.channels[channelId].messages.push(message);
        if (db.channels[channelId].messages.length > 500) {
            db.channels[channelId].messages = db.channels[channelId].messages.slice(-500);
        }
        saveDB();
        
        io.to(channelId).emit('new_channel_message', { channelId, message });
    });

    // ===== ПРЕМИУМ =====
    socket.on('buy_premium', () => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        // Проверка, есть ли уже премиум
        if (user.premium) {
            return socket.emit('premium_error', 'У вас уже есть премиум!');
        }
        
        const premiumPrice = 1000;
        if (user.coins < premiumPrice) {
            return socket.emit('premium_error', `Нужно ${premiumPrice} котиков`);
        }
        
        user.coins -= premiumPrice;
        user.premium = true;
        user.premiumSince = Date.now();
        saveDB();
        
        socket.emit('premium_activated');
        socket.emit('coins_updated', user.coins);
    });

    // Админ: выдать премиум
    socket.on('admin_give_premium', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return socket.emit('admin_action_done', 'Пользователь не найден');
        
        db.users[username].premium = true;
        db.users[username].premiumSince = Date.now();
        saveDB();
        
        io.to(username).emit('premium_activated');
        socket.emit('admin_action_done', `${username} получил премиум`);
    });

    // Админ: забрать премиум
    socket.on('admin_remove_premium', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return socket.emit('admin_action_done', 'Пользователь не найден');
        
        db.users[username].premium = false;
        db.users[username].premiumSince = null;
        saveDB();
        
        io.to(username).emit('premium_removed');
        socket.emit('admin_action_done', `У ${username} забран премиум`);
    });

    // Админ: удалить пользователя
    socket.on('admin_delete_user', (username) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        if (!db.users[username]) return socket.emit('admin_action_done', 'Пользователь не найден');
        if (username === 'xqzas') return socket.emit('admin_action_done', 'Нельзя удалить главного админа');
        
        // Удалить из друзей у всех
        Object.keys(db.users).forEach(u => {
            if (db.users[u].friends) {
                db.users[u].friends = db.users[u].friends.filter(f => f !== username);
            }
        });
        
        // Удалить заявки в друзья
        delete db.friendRequests[username];
        Object.keys(db.friendRequests).forEach(u => {
            if (db.friendRequests[u]) {
                db.friendRequests[u] = db.friendRequests[u].filter(f => f !== username);
            }
        });
        
        // Удалить сообщения
        Object.keys(db.messages).forEach(key => {
            if (key.includes(username)) {
                delete db.messages[key];
            }
        });
        
        // Удалить с рынка
        db.market = db.market.filter(l => l.seller !== username);
        
        // Удалить пользователя
        delete db.users[username];
        saveDB();
        
        // Кикнуть если онлайн
        io.to(username).emit('you_are_deleted');
        socket.emit('admin_action_done', `Пользователь ${username} удалён`);
    });

    // Скример (только для премиум)
    socket.on('send_screamer', ({ to, image, sound }) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        if (!user.premium) {
            return socket.emit('shop_error', 'Скримеры доступны только для премиум!');
        }
        
        if (!db.users[to]) return;
        
        io.to(to).emit('screamer_received', {
            from: currentUser,
            fromName: user.displayName,
            image,
            sound
        });
        
        socket.emit('screamer_sent', to);
    });

    // ===== КАНАЛЫ =====
    socket.on('create_channel', ({ name, avatar, description }) => {
        if (!currentUser) return;
        
        const channelId = 'channel_' + Date.now();
        db.channels[channelId] = {
            id: channelId,
            name,
            avatar,
            description,
            owner: currentUser,
            admins: [currentUser],
            subscribers: [currentUser],
            posts: [],
            createdAt: Date.now()
        };
        saveDB();
        
        socket.join(channelId);
        socket.emit('channel_created', db.channels[channelId]);
    });

    socket.on('get_my_channels', () => {
        if (!currentUser) return;
        
        const myChannels = Object.values(db.channels).filter(c => c.subscribers.includes(currentUser));
        socket.emit('my_channels', myChannels);
    });

    socket.on('subscribe_channel', (channelId) => {
        if (!currentUser || !db.channels[channelId]) return;
        
        if (!db.channels[channelId].subscribers.includes(currentUser)) {
            db.channels[channelId].subscribers.push(currentUser);
            saveDB();
        }
        socket.join(channelId);
        socket.emit('channel_subscribed', db.channels[channelId]);
    });

    socket.on('post_to_channel', ({ channelId, text, media }) => {
        if (!currentUser || !db.channels[channelId]) return;
        if (!db.channels[channelId].admins.includes(currentUser)) return;
        
        const post = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            text,
            media,
            timestamp: Date.now()
        };
        
        db.channels[channelId].posts.push(post);
        saveDB();
        
        io.to(channelId).emit('channel_post', { channelId, post });
    });

    // Поиск пользователей
    socket.on('search_users', (query) => {
        if (!currentUser || !query || query.length < 2) {
            return socket.emit('search_results', []);
        }
        
        const q = query.toLowerCase();
        
        // Поиск пользователей
        const userResults = Object.keys(db.users)
            .filter(u => u !== currentUser && 
                !db.users[u].isBanned &&
                (u.toLowerCase().includes(q) ||
                 db.users[u].displayName.toLowerCase().includes(q)))
            .slice(0, 6)
            .map(u => ({
                type: 'user',
                username: u,
                displayName: db.users[u].displayName,
                avatar: db.users[u].avatar,
                online: onlineUsers.has(u),
                isFriend: db.users[currentUser].friends.includes(u)
            }));
        
        // Поиск групп
        const groupResults = Object.values(db.groups || {})
            .filter(g => g.name.toLowerCase().includes(q))
            .slice(0, 3)
            .map(g => ({
                type: 'group',
                id: g.id,
                name: g.name,
                avatar: g.avatar,
                membersCount: g.members?.length || 0
            }));
        
        // Поиск каналов
        const channelResults = Object.values(db.channels || {})
            .filter(c => c.name.toLowerCase().includes(q))
            .slice(0, 3)
            .map(c => ({
                type: 'channel',
                id: c.id,
                name: c.name,
                avatar: c.avatar,
                subscribersCount: c.subscribers?.length || 0
            }));
        
        socket.emit('search_results', [...userResults, ...groupResults, ...channelResults]);
    });

    // Заявка в друзья
    socket.on('send_friend_request', (toUser) => {
        if (!currentUser || !db.users[toUser]) return;
        if (db.users[currentUser].friends.includes(toUser)) return;
        
        if (!db.friendRequests[toUser]) db.friendRequests[toUser] = [];
        if (!db.friendRequests[toUser].includes(currentUser)) {
            db.friendRequests[toUser].push(currentUser);
            saveDB();
            
            io.to(toUser).emit('new_friend_request', {
                username: currentUser,
                displayName: db.users[currentUser].displayName,
                avatar: db.users[currentUser].avatar
            });
        }
        socket.emit('friend_request_sent');
    });

    // Принять заявку
    socket.on('accept_friend', (fromUser) => {
        if (!currentUser || !db.users[fromUser]) return;
        
        if (!db.users[currentUser].friends.includes(fromUser)) {
            db.users[currentUser].friends.push(fromUser);
        }
        if (!db.users[fromUser].friends.includes(currentUser)) {
            db.users[fromUser].friends.push(currentUser);
        }
        
        if (db.friendRequests[currentUser]) {
            db.friendRequests[currentUser] = db.friendRequests[currentUser].filter(u => u !== fromUser);
        }
        saveDB();
        
        const friendData = {
            username: fromUser,
            displayName: db.users[fromUser].displayName,
            avatar: db.users[fromUser].avatar,
            online: onlineUsers.has(fromUser)
        };
        socket.emit('friend_added', friendData);
        
        io.to(fromUser).emit('friend_added', {
            username: currentUser,
            displayName: db.users[currentUser].displayName,
            avatar: db.users[currentUser].avatar,
            online: true
        });
    });

    // Отклонить заявку
    socket.on('reject_friend', (fromUser) => {
        if (!currentUser) return;
        if (db.friendRequests[currentUser]) {
            db.friendRequests[currentUser] = db.friendRequests[currentUser].filter(u => u !== fromUser);
            saveDB();
        }
    });

    // Отправка сообщения
    socket.on('send_message', ({ to, text, type, media, fileName, fileSize }) => {
        if (!currentUser || !db.users[to]) return;
        
        // Проверка мута
        if (db.users[currentUser].isMuted) {
            return socket.emit('message_error', 'Вы не можете отправлять сообщения (мут)');
        }
        
        const chatKey = [currentUser, to].sort().join('_');
        if (!db.messages[chatKey]) db.messages[chatKey] = [];
        
        const message = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            from: currentUser,
            to,
            text,
            type: type || 'text',
            media,
            fileName,
            fileSize,
            timestamp: Date.now(),
            read: false,
            reactions: {}
        };
        
        db.messages[chatKey].push(message);
        
        if (db.messages[chatKey].length > 500) {
            db.messages[chatKey] = db.messages[chatKey].slice(-500);
        }
        saveDB();
        
        socket.emit('message_sent', message);
        io.to(to).emit('new_message', message);
    });

    // Реакции на сообщения
    socket.on('add_reaction', ({ friend, msgId, emoji }) => {
        if (!currentUser || !db.users[friend]) return;
        
        const chatKey = [currentUser, friend].sort().join('_');
        if (!db.messages[chatKey]) return;
        
        const msg = db.messages[chatKey].find(m => m.id === msgId);
        if (!msg) return;
        
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        
        if (!msg.reactions[emoji].includes(currentUser)) {
            msg.reactions[emoji].push(currentUser);
            saveDB();
            
            socket.emit('reaction_updated', { friend, msgId, reactions: msg.reactions });
            io.to(friend).emit('reaction_updated', { friend: currentUser, msgId, reactions: msg.reactions });
        }
    });

    socket.on('toggle_reaction', ({ friend, msgId, emoji }) => {
        if (!currentUser || !db.users[friend]) return;
        
        const chatKey = [currentUser, friend].sort().join('_');
        if (!db.messages[chatKey]) return;
        
        const msg = db.messages[chatKey].find(m => m.id === msgId);
        if (!msg) return;
        
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        
        const userIndex = msg.reactions[emoji].indexOf(currentUser);
        if (userIndex > -1) {
            msg.reactions[emoji].splice(userIndex, 1);
            if (msg.reactions[emoji].length === 0) {
                delete msg.reactions[emoji];
            }
        } else {
            msg.reactions[emoji].push(currentUser);
        }
        saveDB();
        
        socket.emit('reaction_updated', { friend, msgId, reactions: msg.reactions });
        io.to(friend).emit('reaction_updated', { friend: currentUser, msgId, reactions: msg.reactions });
    });

    // Прочитано
    socket.on('mark_read', (friend) => {
        if (!currentUser) return;
        const chatKey = [currentUser, friend].sort().join('_');
        if (db.messages[chatKey]) {
            db.messages[chatKey].forEach(m => {
                if (m.to === currentUser) m.read = true;
            });
            saveDB();
        }
    });

    // Печатает...
    socket.on('typing', (to) => {
        io.to(to).emit('user_typing', currentUser);
    });

    // Обновление профиля
    socket.on('update_profile', ({ displayName, avatar, status, theme, telegram, nickEmoji, nickFont, profileEffect, profileFrame, customFrameColors }) => {
        if (!currentUser) return;
        
        if (displayName) db.users[currentUser].displayName = displayName;
        if (avatar !== undefined) db.users[currentUser].avatar = avatar;
        if (status !== undefined) db.users[currentUser].status = status;
        if (theme) db.users[currentUser].theme = theme;
        if (telegram !== undefined) db.users[currentUser].telegram = telegram;
        
        // Премиум настройки (только для премиум пользователей)
        if (db.users[currentUser].premium) {
            if (nickEmoji !== undefined) db.users[currentUser].nickEmoji = nickEmoji;
            if (nickFont !== undefined) db.users[currentUser].nickFont = nickFont;
            if (profileEffect !== undefined) db.users[currentUser].profileEffect = profileEffect;
            if (profileFrame !== undefined) db.users[currentUser].profileFrame = profileFrame;
            if (customFrameColors !== undefined) db.users[currentUser].customFrameColors = customFrameColors;
        }
        
        saveDB();
        
        socket.emit('profile_updated', {
            displayName: db.users[currentUser].displayName,
            avatar: db.users[currentUser].avatar,
            status: db.users[currentUser].status,
            theme: db.users[currentUser].theme,
            telegram: db.users[currentUser].telegram,
            nickEmoji: db.users[currentUser].nickEmoji,
            nickFont: db.users[currentUser].nickFont,
            profileEffect: db.users[currentUser].profileEffect,
            profileFrame: db.users[currentUser].profileFrame,
            customFrameColors: db.users[currentUser].customFrameColors
        });
        
        db.users[currentUser].friends.forEach(friend => {
            io.to(friend).emit('friend_updated', {
                username: currentUser,
                displayName: db.users[currentUser].displayName,
                avatar: db.users[currentUser].avatar,
                nickEmoji: db.users[currentUser].nickEmoji,
                nickFont: db.users[currentUser].nickFont,
                profileEffect: db.users[currentUser].profileEffect,
                profileFrame: db.users[currentUser].profileFrame,
                customFrameColors: db.users[currentUser].customFrameColors
            });
        });
    });

    // ===== АДМИН: ДОБАВИТЬ NFT В МАГАЗИН =====
    socket.on('admin_add_shop_nft', ({ name, image, price, quantity, rarity, upgradeable }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const nft = {
            id: 'shop_nft_' + Date.now(),
            name,
            image, // emoji или base64
            price: price || 100,
            sellPrice: Math.floor((price || 100) / 2),
            rarity: rarity || 'rare',
            quantity: quantity || -1, // -1 = безлимит
            sold: 0,
            upgradeable: upgradeable || false,
            maxLevel: 5,
            creator: currentUser,
            createdAt: Date.now()
        };
        
        db.shop.nfts.push(nft);
        saveDB();
        
        socket.emit('admin_action_done', `NFT "${name}" добавлен в магазин`);
        io.emit('shop_updated', db.shop);
    });

    // ===== АДМИН: ДОБАВИТЬ ПОДАРОК В МАГАЗИН =====
    socket.on('admin_add_shop_gift', ({ name, emoji, price, image, rarity }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        // Генерация уникального кода
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        const gift = {
            id: 'gift_' + Date.now(),
            name: emoji + ' ' + name,
            emoji,
            image: image || null, // base64 картинка
            price: price || 50,
            sellPrice: Math.floor((price || 50) / 2),
            rarity: rarity || 'common',
            code,
            creator: currentUser,
            createdAt: Date.now()
        };
        
        db.shop.gifts.push(gift);
        saveDB();
        
        socket.emit('shop_gift_added', gift);
        io.emit('shop_updated', db.shop);
    });

    // ===== АДМИН: ИЗМЕНИТЬ ЦЕНУ ПОДАРКА =====
    socket.on('admin_edit_gift_price', ({ giftId, newPrice }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const gift = db.shop.gifts.find(g => g.id === giftId);
        if (!gift) return socket.emit('admin_action_done', 'Подарок не найден');
        
        gift.price = newPrice;
        gift.sellPrice = Math.floor(newPrice / 2);
        saveDB();
        
        socket.emit('admin_action_done', `Цена ${gift.name} изменена на ${newPrice}`);
        io.emit('shop_updated', db.shop);
    });

    // ===== АДМИН: ИЗМЕНИТЬ ЦЕНУ NFT =====
    socket.on('admin_edit_nft_price', ({ nftId, newPrice }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const nft = db.shop.nfts.find(n => n.id === nftId);
        if (!nft) return socket.emit('admin_action_done', 'NFT не найден');
        
        nft.price = newPrice;
        nft.sellPrice = Math.floor(newPrice / 2);
        saveDB();
        
        socket.emit('admin_action_done', `Цена ${nft.name} изменена на ${newPrice}`);
        io.emit('shop_updated', db.shop);
    });

    // ===== АДМИН: УДАЛИТЬ ПОДАРОК ИЗ МАГАЗИНА =====
    socket.on('admin_delete_shop_gift', (giftId) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const index = db.shop.gifts.findIndex(g => g.id === giftId);
        if (index === -1) return;
        
        db.shop.gifts.splice(index, 1);
        saveDB();
        
        socket.emit('shop_item_deleted');
        io.emit('shop_updated', db.shop);
    });

    // ===== АДМИН: УДАЛИТЬ NFT ИЗ МАГАЗИНА =====
    socket.on('admin_delete_shop_nft', (nftId) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const index = db.shop.nfts.findIndex(n => n.id === nftId);
        if (index === -1) return;
        
        db.shop.nfts.splice(index, 1);
        saveDB();
        
        socket.emit('shop_item_deleted');
        io.emit('shop_updated', db.shop);
    });

    // ===== УДАЛИТЬ СООБЩЕНИЕ =====
    socket.on('delete_message', ({ friend, msgId }) => {
        if (!currentUser) return;
        
        const chatKey = [currentUser, friend].sort().join('_');
        if (!db.messages[chatKey]) return;
        
        const msgIndex = db.messages[chatKey].findIndex(m => m.id === msgId && m.from === currentUser);
        if (msgIndex === -1) return; // Можно удалять только свои сообщения
        
        db.messages[chatKey].splice(msgIndex, 1);
        saveDB();
        
        // Уведомить обоих участников
        socket.emit('message_deleted', { friend, msgId });
        io.to(friend).emit('message_deleted', { friend: currentUser, msgId });
    });

    // ===== АДМИН: ГЛОБАЛЬНОЕ СООБЩЕНИЕ =====
    socket.on('admin_global_message', ({ text }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        io.emit('global_message', {
            text,
            from: currentUser,
            fromName: db.users[currentUser].displayName,
            timestamp: Date.now()
        });
        
        socket.emit('admin_action_done', 'Глобальное сообщение отправлено');
    });

    // ===== ОТПРАВКА NFT ДРУГУ =====
    socket.on('send_nft', ({ to, nftIndex }) => {
        if (!currentUser || !db.users[to]) return;
        const user = db.users[currentUser];
        
        if (!user.nfts || !user.nfts[nftIndex]) {
            return socket.emit('shop_error', 'NFT не найден');
        }
        
        const nft = user.nfts.splice(nftIndex, 1)[0];
        if (!db.users[to].nfts) db.users[to].nfts = [];
        db.users[to].nfts.push({ ...nft, from: currentUser, date: Date.now() });
        
        // Отправить как сообщение в чат
        const chatKey = [currentUser, to].sort().join('_');
        if (!db.messages[chatKey]) db.messages[chatKey] = [];
        
        const nftMessage = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            from: currentUser,
            to,
            text: `Подарил NFT: ${nft.name}`,
            type: 'nft',
            nft: nft,
            timestamp: Date.now(),
            read: false
        };
        
        db.messages[chatKey].push(nftMessage);
        saveDB();
        
        socket.emit('message_sent', nftMessage);
        socket.emit('nft_sent_success', { nfts: user.nfts });
        io.to(to).emit('new_message', nftMessage);
        io.to(to).emit('nft_received', {
            nft,
            from: currentUser,
            fromName: user.displayName
        });
    });

    // ===== УЛУЧШЕНИЕ ПОДАРКА (ФОН) =====
    socket.on('upgrade_gift', (giftIndex) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        if (!user.gifts || !user.gifts[giftIndex]) return socket.emit('shop_error', 'Подарок не найден');
        
        const gift = user.gifts[giftIndex];
        const currentBg = gift.background || 'common';
        
        // Уровни фона: common -> uncommon -> rare -> epic -> legendary (5% шанс)
        const backgrounds = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        const currentIndex = backgrounds.indexOf(currentBg);
        
        if (currentIndex >= backgrounds.length - 1) {
            return socket.emit('shop_error', 'Максимальный уровень фона!');
        }
        
        const upgradeCost = (currentIndex + 1) * 50; // 50, 100, 150, 200
        if (user.coins < upgradeCost) {
            return socket.emit('shop_error', `Нужно ${upgradeCost} котиков`);
        }
        
        user.coins -= upgradeCost;
        
        // Шанс на legendary только 5%
        let newBg;
        if (currentIndex === backgrounds.length - 2) {
            // Пытаемся получить legendary
            newBg = Math.random() < 0.05 ? 'legendary' : backgrounds[currentIndex]; // остаётся epic если не повезло
            if (newBg === backgrounds[currentIndex]) {
                // Вернуть котики если не повезло
                user.coins += upgradeCost;
                saveDB();
                return socket.emit('upgrade_failed', { message: 'Не повезло! Попробуйте ещё раз (5% шанс)' });
            }
        } else {
            newBg = backgrounds[currentIndex + 1];
        }
        
        gift.background = newBg;
        gift.sellPrice = Math.floor((gift.sellPrice || gift.price / 2) * 1.3);
        saveDB();
        
        socket.emit('gift_upgraded', { gift, newBalance: user.coins, gifts: user.gifts, newBackground: newBg });
    });

    // ===== ГРУППЫ: ДОБАВИТЬ УЧАСТНИКА =====
    socket.on('add_to_group', ({ groupId, username }) => {
        if (!currentUser || !db.groups[groupId]) return;
        const group = db.groups[groupId];
        
        // Только админы группы могут добавлять
        if (!group.admins.includes(currentUser)) {
            return socket.emit('group_error', 'Только админы могут добавлять участников');
        }
        
        if (!db.users[username]) {
            return socket.emit('group_error', 'Пользователь не найден');
        }
        
        if (!group.members.includes(username)) {
            group.members.push(username);
            saveDB();
            
            io.to(username).emit('added_to_group', group);
        }
        
        socket.emit('member_added', { groupId, username });
    });

    // ===== КАНАЛЫ: ДОБАВИТЬ ПОДПИСЧИКА =====
    socket.on('add_to_channel', ({ channelId, username }) => {
        if (!currentUser || !db.channels[channelId]) return;
        const channel = db.channels[channelId];
        
        if (!channel.admins.includes(currentUser)) {
            return socket.emit('channel_error', 'Только админы могут добавлять подписчиков');
        }
        
        if (!db.users[username]) {
            return socket.emit('channel_error', 'Пользователь не найден');
        }
        
        if (!channel.subscribers.includes(username)) {
            channel.subscribers.push(username);
            saveDB();
            
            io.to(username).emit('added_to_channel', channel);
        }
        
        socket.emit('subscriber_added', { channelId, username });
    });

    // ===== ПОЛУЧИТЬ ГРУППУ =====
    socket.on('get_group', (groupId) => {
        if (!currentUser || !db.groups[groupId]) return;
        const group = db.groups[groupId];
        
        if (!group.members.includes(currentUser)) {
            return socket.emit('group_error', 'Вы не участник этой группы');
        }
        
        socket.join(groupId);
        socket.emit('group_data', {
            ...group,
            members: group.members.map(m => ({
                username: m,
                displayName: db.users[m]?.displayName || m,
                avatar: db.users[m]?.avatar,
                online: onlineUsers.has(m)
            }))
        });
    });

    // ===== ПОЛУЧИТЬ КАНАЛ =====
    socket.on('get_channel', (channelId) => {
        if (!currentUser || !db.channels[channelId]) return;
        const channel = db.channels[channelId];
        
        socket.join(channelId);
        socket.emit('channel_data', {
            ...channel,
            isAdmin: channel.admins.includes(currentUser),
            isSubscribed: channel.subscribers.includes(currentUser)
        });
    });

    // ===== РАСШИРЕННЫЙ ПРОФИЛЬ =====
    socket.on('get_full_profile', (username) => {
        if (!currentUser || !db.users[username]) return;
        
        const user = db.users[username];
        socket.emit('full_profile', {
            username,
            displayName: user.displayName,
            avatar: user.avatar,
            status: user.status,
            telegram: user.telegram,
            online: onlineUsers.has(username),
            isAdmin: ADMINS.includes(username),
            friendsCount: user.friends?.length || 0,
            gifts: user.gifts || [],
            nfts: user.nfts || [],
            createdAt: user.createdAt,
            isFriend: db.users[currentUser].friends.includes(username)
        });
    });

    // WebRTC звонки
    socket.on('call_user', ({ to, offer, isVideo }) => {
        if (!currentUser) return;
        
        // Проверяем что пользователь онлайн
        if (!onlineUsers.has(to)) {
            return socket.emit('call_error', 'Пользователь не в сети');
        }
        
        io.to(to).emit('incoming_call', {
            from: currentUser,
            displayName: db.users[currentUser].displayName,
            avatar: db.users[currentUser].avatar,
            offer,
            isVideo
        });
    });

    socket.on('answer_call', ({ to, answer }) => {
        io.to(to).emit('call_answered', { answer });
    });

    socket.on('ice_candidate', ({ to, candidate }) => {
        io.to(to).emit('ice_candidate', { candidate });
    });

    socket.on('end_call', ({ to }) => {
        io.to(to).emit('call_ended');
    });

    socket.on('reject_call', ({ to }) => {
        io.to(to).emit('call_rejected');
    });

    // ===== МАССОВАЯ ПРОДАЖА =====
    socket.on('sell_multiple', ({ gifts, nfts }) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        let totalEarned = 0;
        
        // Продаём подарки (с конца чтобы индексы не сбивались)
        gifts.forEach(index => {
            if (user.gifts && user.gifts[index]) {
                const gift = user.gifts[index];
                const sellPrice = gift.sellPrice || Math.floor((gift.price || 50) / 2);
                const commission = Math.floor(sellPrice * 0.1);
                totalEarned += sellPrice - commission;
                user.gifts.splice(index, 1);
            }
        });
        
        // Продаём NFT
        nfts.forEach(index => {
            if (user.nfts && user.nfts[index]) {
                const nft = user.nfts[index];
                const sellPrice = nft.sellPrice || Math.floor((nft.price || 100) / 2);
                const commission = Math.floor(sellPrice * 0.1);
                totalEarned += sellPrice - commission;
                user.nfts.splice(index, 1);
            }
        });
        
        user.coins += totalEarned;
        saveDB();
        
        socket.emit('multiple_sold', { 
            newBalance: user.coins, 
            gifts: user.gifts, 
            nfts: user.nfts,
            totalEarned 
        });
    });

    // ===== МАССОВОЕ УДАЛЕНИЕ =====
    socket.on('delete_multiple', ({ gifts, nfts }) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        gifts.forEach(index => {
            if (user.gifts && user.gifts[index]) {
                user.gifts.splice(index, 1);
            }
        });
        
        nfts.forEach(index => {
            if (user.nfts && user.nfts[index]) {
                user.nfts.splice(index, 1);
            }
        });
        
        saveDB();
        socket.emit('multiple_deleted', { gifts: user.gifts, nfts: user.nfts });
    });

    // ===== УДАЛЕНИЕ АККАУНТА =====
    socket.on('delete_account', ({ password }) => {
        if (!currentUser) return;
        const user = db.users[currentUser];
        
        if (user.password !== password) {
            return socket.emit('delete_account_error', 'Неверный пароль');
        }
        
        // Удаляем из друзей у всех
        Object.keys(db.users).forEach(username => {
            const u = db.users[username];
            if (u.friends) {
                u.friends = u.friends.filter(f => f !== currentUser);
            }
        });
        
        // Удаляем сообщения
        delete db.messages[currentUser];
        Object.keys(db.messages).forEach(key => {
            if (db.messages[key]) {
                db.messages[key] = db.messages[key].filter(m => m.from !== currentUser && m.to !== currentUser);
            }
        });
        
        // Удаляем пользователя
        delete db.users[currentUser];
        saveDB();
        
        socket.emit('account_deleted');
    });

    // ===== СОЗДАНИЕ ГРУППЫ =====
    socket.on('create_group', ({ name }) => {
        if (!currentUser) return;
        if (!name || name.length < 2) return socket.emit('group_error', 'Название минимум 2 символа');
        
        const groupId = 'group_' + Date.now();
        db.groups[groupId] = {
            id: groupId,
            name,
            owner: currentUser,
            members: [currentUser],
            messages: [],
            createdAt: Date.now()
        };
        saveDB();
        
        socket.emit('group_created', db.groups[groupId]);
    });

    // ===== СОЗДАНИЕ КАНАЛА =====
    socket.on('create_channel', ({ name }) => {
        if (!currentUser) return;
        if (!name || name.length < 2) return socket.emit('channel_error', 'Название минимум 2 символа');
        
        const channelId = 'channel_' + Date.now();
        db.channels[channelId] = {
            id: channelId,
            name,
            owner: currentUser,
            subscribers: [currentUser],
            messages: [],
            createdAt: Date.now()
        };
        saveDB();
        
        socket.emit('channel_created', db.channels[channelId]);
    });

    // ===== СКРИМЕР =====
    socket.on('send_screamer', ({ to, image, sound }) => {
        if (!currentUser) return;
        
        // Скример всем
        if (to === '__ALL__' && isAdmin(currentUser)) {
            io.emit('screamer', {
                from: currentUser,
                fromName: db.users[currentUser]?.displayName || currentUser,
                image: image || null,
                sound: sound || null
            });
            socket.emit('screamer_sent');
            return;
        }
        
        io.to(to).emit('screamer', {
            from: currentUser,
            fromName: db.users[currentUser]?.displayName || currentUser,
            image: image || null,
            sound: sound || null
        });
        
        socket.emit('screamer_sent');
    });

    // ===== ADMIN ABUSE =====
    socket.on('admin_abuse_rainbow', () => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        Object.keys(db.users).forEach(username => {
            db.users[username].profileEffect = 'rainbow';
        });
        saveDB();
        
        io.emit('global_effect', 'rainbow');
        socket.emit('admin_action_done', 'Rainbow эффект применён всем!');
    });

    socket.on('admin_abuse_global_coins', (amount) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        Object.keys(db.users).forEach(username => {
            db.users[username].coins = (db.users[username].coins || 0) + amount;
            io.to(username).emit('coins_updated', db.users[username].coins);
        });
        saveDB();
        
        socket.emit('admin_action_done', `${amount} котиков выдано всем!`);
    });

    socket.on('admin_abuse_global_nft', (nftId) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const nft = db.shop.nfts.find(n => n.id === nftId);
        if (!nft) return;
        
        Object.keys(db.users).forEach(username => {
            if (!db.users[username].nfts) db.users[username].nfts = [];
            db.users[username].nfts.push({
                ...nft,
                date: Date.now(),
                tokenId: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                from: 'ADMIN'
            });
        });
        saveDB();
        
        io.emit('nft_received', { nft, from: 'ADMIN', fromName: 'Администрация' });
        socket.emit('admin_action_done', `NFT "${nft.name}" выдан всем!`);
    });

    socket.on('admin_abuse_global_gift', (giftId) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const gift = db.shop.gifts.find(g => g.id === giftId);
        if (!gift) return;
        
        Object.keys(db.users).forEach(username => {
            if (!db.users[username].gifts) db.users[username].gifts = [];
            db.users[username].gifts.push({
                ...gift,
                date: Date.now(),
                from: 'ADMIN'
            });
        });
        saveDB();
        
        io.emit('gift_received', { gift, from: 'ADMIN', fromName: 'Администрация' });
        socket.emit('admin_action_done', `Подарок "${gift.name}" выдан всем!`);
    });

    socket.on('admin_abuse_global_effect', (effect) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        Object.keys(db.users).forEach(username => {
            db.users[username].profileEffect = effect;
        });
        saveDB();
        
        io.emit('global_effect', effect);
        socket.emit('admin_action_done', `Эффект "${effect}" применён всем!`);
    });

    // ===== АДМИН: МУЗЫКА =====
    socket.on('admin_play_music_all', ({ url }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        io.emit('admin_music_play', { url, volume: 50, loop: false });
        socket.emit('admin_action_done', 'Музыка включена для всех!');
    });

    socket.on('admin_stop_music_all', () => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        io.emit('admin_music_stop');
        socket.emit('admin_action_done', 'Музыка остановлена для всех');
    });

    socket.on('admin_play_music_user', ({ username, url, volume, loop }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.username === username);
        if (targetSocket) {
            targetSocket.emit('admin_music_play', { url, volume, loop });
            socket.emit('admin_action_done', `Музыка включена для ${username}!`);
        } else {
            socket.emit('admin_action_done', `Пользователь ${username} не онлайн`);
        }
    });

    socket.on('admin_stop_music_user', ({ username }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.username === username);
        if (targetSocket) {
            targetSocket.emit('admin_music_stop');
            socket.emit('admin_action_done', `Музыка остановлена для ${username}`);
        } else {
            socket.emit('admin_action_done', `Пользователь ${username} не онлайн`);
        }
    });

    // ===== АДМИН: БЭКАПЫ =====
    socket.on('admin_create_backup', () => {
        if (!currentUser || !isAdmin(currentUser)) return;
        createBackup();
        socket.emit('admin_action_done', 'Бэкап создан!');
    });

    socket.on('admin_get_backups', () => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        try {
            const backups = fs.readdirSync(BACKUP_DIR)
                .filter(f => f.startsWith('database_') && f.endsWith('.json'))
                .sort()
                .reverse()
                .map(f => ({
                    name: f,
                    date: f.replace('database_', '').replace('.json', '').replace(/-/g, ':').slice(0, 19),
                    size: (fs.statSync(path.join(BACKUP_DIR, f)).size / 1024).toFixed(1) + ' KB'
                }));
            socket.emit('admin_backups_list', backups);
        } catch (err) {
            socket.emit('admin_backups_list', []);
        }
    });

    socket.on('admin_restore_backup', (backupName) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        try {
            const backupPath = path.join(BACKUP_DIR, backupName);
            if (fs.existsSync(backupPath)) {
                // Сначала создаём бэкап текущего состояния
                createBackup();
                
                // Восстанавливаем из бэкапа
                const backupData = JSON.parse(fs.readFileSync(backupPath));
                db = backupData;
                saveDB();
                
                socket.emit('admin_action_done', `База восстановлена из ${backupName}! Перезагрузите сервер.`);
            } else {
                socket.emit('admin_action_done', 'Бэкап не найден');
            }
        } catch (err) {
            socket.emit('admin_action_done', 'Ошибка восстановления: ' + err.message);
        }
    });

    // ===== РЕЖИМ ОБСЛУЖИВАНИЯ =====
    socket.on('admin_toggle_maintenance', ({ enabled, message }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        db.settings.maintenance = enabled;
        db.settings.maintenanceMessage = message || 'Сайт на техническом обслуживании.';
        saveDB();
        
        io.emit('maintenance_mode', { enabled, message: db.settings.maintenanceMessage });
        socket.emit('admin_action_done', enabled ? 'Режим обслуживания включен' : 'Режим обслуживания выключен');
    });

    // ===== ГЛОБАЛЬНАЯ ТЕМА =====
    socket.on('admin_toggle_earth_theme', (enabled) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        db.settings.globalTheme = enabled ? 'earth' : null;
        saveDB();
        
        io.emit('global_theme', db.settings.globalTheme);
        socket.emit('admin_action_done', enabled ? 'Earth тема включена для всех' : 'Глобальная тема отключена');
    });

    // ===== КАСТОМНЫЕ РЕДКОСТИ =====
    socket.on('admin_add_custom_rarity', ({ name, color, effect }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        if (!db.settings.customRarities) db.settings.customRarities = [];
        
        // Проверить дубликат
        if (db.settings.customRarities.find(r => r.name.toLowerCase() === name.toLowerCase())) {
            return socket.emit('admin_action_done', 'Такая редкость уже существует');
        }
        
        db.settings.customRarities.push({ name, color, effect });
        saveDB();
        
        io.emit('custom_rarities', db.settings.customRarities);
        socket.emit('admin_action_done', `Редкость "${name}" добавлена`);
    });

    socket.on('admin_delete_custom_rarity', (name) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        if (db.settings.customRarities) {
            db.settings.customRarities = db.settings.customRarities.filter(r => r.name !== name);
            saveDB();
            io.emit('custom_rarities', db.settings.customRarities);
        }
    });

    // ===== АВТОПОВЫШЕНИЕ ЦЕН =====
    socket.on('admin_toggle_price_increase', ({ enabled, percent }) => {
        if (!currentUser || !isAdmin(currentUser)) return;
        
        db.settings.priceIncrease = { enabled, percent };
        saveDB();
        
        socket.emit('admin_action_done', enabled ? `Автоповышение цен включено (${percent}%)` : 'Автоповышение цен выключено');
    });

    // Отключение
    socket.on('disconnect', () => {
        if (currentUser) {
            onlineUsers.delete(currentUser);
            const user = db.users[currentUser];
            if (user) {
                user.friends.forEach(friend => {
                    io.to(friend).emit('friend_offline', currentUser);
                });
            }
        }
    });
});

// Автоповышение цен каждые 10 минут
setInterval(() => {
    if (db.settings?.priceIncrease?.enabled) {
        const percent = db.settings.priceIncrease.percent || 5;
        const multiplier = 1 + (percent / 100);
        
        db.shop.gifts.forEach(gift => {
            gift.price = Math.ceil(gift.price * multiplier);
            gift.sellPrice = Math.ceil(gift.sellPrice * multiplier);
        });
        
        db.shop.nfts.forEach(nft => {
            nft.price = Math.ceil(nft.price * multiplier);
            nft.sellPrice = Math.ceil(nft.sellPrice * multiplier);
        });
        
        saveDB();
        io.emit('shop_data', db.shop);
        console.log(`📈 Цены повышены на ${percent}%`);
    }
}, 10 * 60 * 1000); // 10 минут

const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
    console.log(`🚀 XGram запущен на http://localhost:${PORT}`);
});
