// ===== ИНИЦИАЛИЗАЦИЯ =====
const socket = io();

// Состояние приложения
let currentUser = null;
let activeChat = null;
let friends = [];
let chatHistory = {};
let friendRequests = [];
let inventoryBgColor = localStorage.getItem('inventoryBgColor') || '#12121a';

// WebRTC
let peerConnection = null;
let localStream = null;
let callTarget = null;
let isVideoCall = false;
let isMuted = false;
let isVideoOff = false;

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Стикеры (эмодзи)
const stickers = [
    '😀', '😂', '🥰', '😎', '🤩', '😇', '🥳', '😋',
    '🤔', '😴', '😭', '😡', '🤯', '🥺', '😱', '🤗',
    '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '💪',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔',
    '🔥', '⭐', '🌈', '☀️', '🌙', '⚡', '💫', '✨',
    '🎉', '🎊', '🎁', '🎈', '🏆', '🥇', '💎', '👑'
];

// ===== TELEGRAM-STYLE МЕНЮ =====
let tgMenuOpen = false;

function toggleTelegramMenu() {
    const drawer = document.getElementById('tg-drawer');
    const overlay = document.getElementById('tg-menu-overlay');
    const btn = document.getElementById('tg-menu-btn');
    
    tgMenuOpen = !tgMenuOpen;
    
    if (tgMenuOpen) {
        drawer.classList.add('open');
        overlay.classList.add('active');
        btn.classList.add('active');
        updateTelegramMenuData();
    } else {
        drawer.classList.remove('open');
        overlay.classList.remove('active');
        btn.classList.remove('active');
    }
}

function closeTelegramMenu() {
    const drawer = document.getElementById('tg-drawer');
    const overlay = document.getElementById('tg-menu-overlay');
    const btn = document.getElementById('tg-menu-btn');
    
    tgMenuOpen = false;
    drawer.classList.remove('open');
    overlay.classList.remove('active');
    btn.classList.remove('active');
}

function updateTelegramMenuData() {
    if (!currentUser) return;
    
    const avatar = currentUser.avatar || getDefaultAvatar(currentUser.displayName);
    const avatarEl = document.getElementById('tg-drawer-avatar');
    const nameEl = document.getElementById('tg-drawer-name');
    const usernameEl = document.getElementById('tg-drawer-username');
    const coinsEl = document.getElementById('tg-drawer-coins');
    const avatarWrapper = document.getElementById('tg-drawer-avatar-wrapper');
    
    if (avatarEl) avatarEl.src = avatar;
    if (nameEl) nameEl.textContent = currentUser.displayName;
    if (usernameEl) usernameEl.textContent = '@' + currentUser.username;
    if (coinsEl) coinsEl.textContent = myCoins || 0;
    
    // Применить эффект редкости к аватару
    if (avatarWrapper) {
        avatarWrapper.className = 'tg-drawer-avatar-wrapper';
        const userRarity = getUserHighestRarity();
        if (userRarity) {
            avatarWrapper.classList.add('rarity-' + userRarity);
        }
    }
    
    // Обновить бейджи
    const giftsCountBadge = document.getElementById('gifts-count-badge');
    const nftsCountBadge = document.getElementById('nfts-count-badge');
    if (giftsCountBadge) giftsCountBadge.textContent = myGifts?.length || 0;
    if (nftsCountBadge) nftsCountBadge.textContent = myNfts?.length || 0;
    
    // Показать админ кнопку
    const adminItem = document.getElementById('tg-drawer-admin');
    if (adminItem && currentUser.isAdmin) {
        adminItem.style.display = 'flex';
    }
}

// Получить наивысшую редкость пользователя
function getUserHighestRarity() {
    const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'neon', 'rainbow'];
    let highestRarity = null;
    let highestIndex = -1;
    
    // Проверить NFT
    if (myNfts && myNfts.length > 0) {
        myNfts.forEach(nft => {
            const idx = rarityOrder.indexOf(nft.rarity);
            if (idx > highestIndex) {
                highestIndex = idx;
                highestRarity = nft.rarity;
            }
        });
    }
    
    // Проверить подарки
    if (myGifts && myGifts.length > 0) {
        myGifts.forEach(gift => {
            const idx = rarityOrder.indexOf(gift.rarity || gift.background);
            if (idx > highestIndex) {
                highestIndex = idx;
                highestRarity = gift.rarity || gift.background;
            }
        });
    }
    
    return highestRarity;
}

// ===== ИНВЕНТАРЬ =====
function openMyInventory() {
    renderInventoryFull();
    openModal('my-inventory-modal');
}

function openMyGiftsModal() {
    renderMyGiftsInventory();
    openModal('my-gifts-modal');
}

function openMyNftsModal() {
    renderMyNftsInventory();
    openModal('my-nfts-modal');
}

function renderInventoryFull() {
    const giftsGrid = document.getElementById('inventory-gifts-grid');
    const nftsGrid = document.getElementById('inventory-nfts-grid');
    const totalGifts = document.getElementById('inv-total-gifts');
    const totalNfts = document.getElementById('inv-total-nfts');
    const totalValue = document.getElementById('inv-total-value');
    
    // Статистика
    if (totalGifts) totalGifts.textContent = myGifts?.length || 0;
    if (totalNfts) totalNfts.textContent = myNfts?.length || 0;
    
    let value = 0;
    myGifts?.forEach(g => value += g.price || 50);
    myNfts?.forEach(n => value += n.price || 100);
    if (totalValue) totalValue.textContent = value + ' 🐱';
    
    // Рендер подарков
    if (giftsGrid) {
        if (!myGifts || myGifts.length === 0) {
            giftsGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет подарков</p>';
        } else {
            giftsGrid.innerHTML = myGifts.slice(0, 12).map((g, i) => renderInventoryItem(g, 'gift', i)).join('');
        }
    }
    
    // Рендер NFT
    if (nftsGrid) {
        if (!myNfts || myNfts.length === 0) {
            nftsGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет NFT</p>';
        } else {
            nftsGrid.innerHTML = myNfts.slice(0, 12).map((n, i) => renderInventoryItem(n, 'nft', i)).join('');
        }
    }
    
    // Применить цвет фона
    applyInventoryColor();
}

function renderMyGiftsInventory(filter = 'all') {
    const grid = document.getElementById('my-gifts-grid');
    if (!grid) return;
    
    let gifts = myGifts || [];
    
    // Фильтрация по редкости
    if (filter !== 'all') {
        gifts = gifts.filter(g => (g.rarity || g.background || 'common') === filter);
    }
    
    if (gifts.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет подарков</p>';
        return;
    }
    
    grid.innerHTML = gifts.map((g, i) => renderInventoryItem(g, 'gift', i)).join('');
    
    // Обновить фильтр "от кого"
    updateFromFilter('gifts');
    applyInventoryColor();
}

function renderMyNftsInventory(filter = 'all') {
    const grid = document.getElementById('my-nfts-grid');
    if (!grid) return;
    
    let nfts = myNfts || [];
    
    // Фильтрация по редкости
    if (filter !== 'all') {
        nfts = nfts.filter(n => (n.rarity || 'common') === filter);
    }
    
    if (nfts.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет NFT</p>';
        return;
    }
    
    grid.innerHTML = nfts.map((n, i) => renderInventoryItem(n, 'nft', i)).join('');
    
    // Обновить фильтр "от кого"
    updateFromFilter('nfts');
    applyInventoryColor();
}

function renderInventoryItem(item, type, index) {
    const rarity = item.rarity || item.background || 'common';
    const fromText = item.from ? `от ${item.fromName || item.from}` : '';
    const code = item.code || generateItemCode();
    
    // Проверяем, является ли image картинкой (base64 или URL)
    const hasImageUrl = item.image && typeof item.image === 'string' && 
        (item.image.startsWith('data:image') || item.image.startsWith('http'));
    
    let imageHtml;
    if (hasImageUrl) {
        // Если есть картинка - показываем её с fallback на эмодзи
        const fallbackEmoji = type === 'gift' ? (item.emoji || '🎁') : '🖼';
        imageHtml = `<div class="item-image-wrapper">
                        <img src="${item.image}" class="item-image" alt="${item.name}" 
                             onload="this.style.opacity='1'" 
                             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                        <span class="item-emoji item-fallback" style="display:none">${fallbackEmoji}</span>
                     </div>`;
    } else if (type === 'gift') {
        // Для подарков показываем эмодзи
        imageHtml = `<span class="item-emoji">${item.emoji || '🎁'}</span>`;
    } else {
        // Для NFT без картинки показываем эмодзи или иконку
        imageHtml = `<span class="item-emoji">${item.image || '🖼'}</span>`;
    }
    
    return `
        <div class="inventory-item rarity-${rarity}" 
             onclick="showItemDetails('${type}', ${index})"
             title="${item.name}&#10;Редкость: ${rarity}&#10;Код: #${code}">
            ${imageHtml}
            <span class="item-name">${item.name}</span>
            ${fromText ? `<span class="item-from">${fromText}</span>` : ''}
            <span class="item-rarity" style="background:${getRarityColor(rarity)}">${rarity}</span>
        </div>
    `;
}

function getRarityColor(rarity) {
    const colors = {
        common: '#6b7280',
        uncommon: '#22c55e',
        rare: '#3b82f6',
        epic: '#a855f7',
        legendary: '#fbbf24',
        mythic: '#ec4899',
        neon: '#00ffff',
        rainbow: 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)'
    };
    return colors[rarity] || colors.common;
}

function switchInventoryTab(type, filter) {
    // Обновить активную вкладку
    const modal = document.getElementById(type === 'gifts' ? 'my-gifts-modal' : 'my-nfts-modal');
    modal.querySelectorAll('.inv-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    // Перерендерить
    if (type === 'gifts') {
        renderMyGiftsInventory(filter);
    } else {
        renderMyNftsInventory(filter);
    }
}

function updateFromFilter(type) {
    const select = document.getElementById(type + '-from-filter');
    if (!select) return;
    
    const items = type === 'gifts' ? myGifts : myNfts;
    const fromUsers = new Set();
    
    items?.forEach(item => {
        if (item.from) fromUsers.add(item.from);
    });
    
    select.innerHTML = '<option value="all">Все</option>';
    fromUsers.forEach(user => {
        select.innerHTML += `<option value="${user}">${user}</option>`;
    });
}

function filterGiftsByFrom() {
    const from = document.getElementById('gifts-from-filter').value;
    const grid = document.getElementById('my-gifts-grid');
    
    let gifts = myGifts || [];
    if (from !== 'all') {
        gifts = gifts.filter(g => g.from === from);
    }
    
    if (gifts.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет подарков</p>';
        return;
    }
    
    grid.innerHTML = gifts.map((g, i) => renderInventoryItem(g, 'gift', i)).join('');
}

function filterNftsByFrom() {
    const from = document.getElementById('nfts-from-filter').value;
    const grid = document.getElementById('my-nfts-grid');
    
    let nfts = myNfts || [];
    if (from !== 'all') {
        nfts = nfts.filter(n => n.from === from);
    }
    
    if (nfts.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет NFT</p>';
        return;
    }
    
    grid.innerHTML = nfts.map((n, i) => renderInventoryItem(n, 'nft', i)).join('');
}

function changeInventoryColor(type, color) {
    inventoryBgColor = color;
    localStorage.setItem('inventoryBgColor', color);
    applyInventoryColor();
}

function applyInventoryColor() {
    const grids = document.querySelectorAll('.inventory-grid');
    grids.forEach(grid => {
        grid.style.backgroundColor = inventoryBgColor;
    });
}

function showItemDetails(type, index) {
    const item = type === 'gift' ? myGifts[index] : myNfts[index];
    if (!item) return;
    
    const rarity = item.rarity || item.background || 'common';
    const code = item.code || generateItemCode();
    const hasImageUrl = item.image && typeof item.image === 'string' && 
        (item.image.startsWith('data:image') || item.image.startsWith('http'));
    
    // Создаём модальное окно с деталями
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'item-details-modal';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    const imageHtml = hasImageUrl 
        ? `<img src="${item.image}" class="item-detail-image" alt="${item.name}">`
        : `<div class="item-detail-emoji">${item.emoji || item.image || '🎁'}</div>`;
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 320px; text-align: center;">
            <div class="modal-header">
                <h2>${item.name}</h2>
                <button class="icon-btn" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 20px;">
                ${imageHtml}
                <div style="margin-top: 15px;">
                    <p style="margin: 8px 0;"><strong>Редкость:</strong> <span style="color: ${getRarityColor(rarity)}; text-transform: uppercase;">${rarity}</span></p>
                    <p style="margin: 8px 0; color: var(--text-muted);"><strong>Код:</strong> #${code}</p>
                    ${item.from ? `<p style="margin: 8px 0;"><strong>От:</strong> ${item.fromName || item.from}</p>` : ''}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ===== ПРОСМОТР ИНВЕНТАРЯ ДРУГОГО ИГРОКА =====
let viewingProfileData = null;

function viewProfileGifts() {
    if (!viewingProfile) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'view-profile-gifts-modal';
    modal.innerHTML = `
        <div class="modal-content inventory-content">
            <div class="modal-header">
                <h2><i class="fas fa-gift"></i> Подарки ${viewingProfile.displayName}</h2>
                <button class="icon-btn" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="inventory-grid" id="view-profile-gifts-grid"></div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const grid = document.getElementById('view-profile-gifts-grid');
    if (!viewingProfile.gifts || viewingProfile.gifts.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет подарков</p>';
    } else {
        grid.innerHTML = viewingProfile.gifts.map((g, i) => {
            const rarity = g.rarity || g.background || 'common';
            const hasImageUrl = g.image && typeof g.image === 'string' && 
                (g.image.startsWith('data:image') || g.image.startsWith('http'));
            const imageHtml = hasImageUrl 
                ? `<div class="item-image-wrapper"><img src="${g.image}" class="item-image" onload="this.style.opacity='1'" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="item-emoji item-fallback" style="display:none">${g.emoji || '🎁'}</span></div>`
                : `<span class="item-emoji">${g.emoji || '🎁'}</span>`;
            return `
                <div class="inventory-item rarity-${rarity}">
                    ${imageHtml}
                    <span class="item-name">${g.name}</span>
                    <span class="item-rarity" style="background:${getRarityColor(rarity)}">${rarity}</span>
                </div>
            `;
        }).join('');
    }
}

function viewProfileNfts() {
    if (!viewingProfile) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'view-profile-nfts-modal';
    modal.innerHTML = `
        <div class="modal-content inventory-content">
            <div class="modal-header">
                <h2><i class="fas fa-image"></i> NFT ${viewingProfile.displayName}</h2>
                <button class="icon-btn" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="inventory-grid" id="view-profile-nfts-grid"></div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const grid = document.getElementById('view-profile-nfts-grid');
    if (!viewingProfile.nfts || viewingProfile.nfts.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Нет NFT</p>';
    } else {
        grid.innerHTML = viewingProfile.nfts.map((n, i) => {
            const rarity = n.rarity || 'common';
            const hasImageUrl = n.image && typeof n.image === 'string' && 
                (n.image.startsWith('data:image') || n.image.startsWith('http'));
            const imageHtml = hasImageUrl 
                ? `<div class="item-image-wrapper"><img src="${n.image}" class="item-image" onload="this.style.opacity='1'" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="item-emoji item-fallback" style="display:none">🖼</span></div>`
                : `<span class="item-emoji">${n.image || '🖼'}</span>`;
            return `
                <div class="inventory-item rarity-${rarity}">
                    ${imageHtml}
                    <span class="item-name">${n.name}</span>
                    <span class="item-rarity" style="background:${getRarityColor(rarity)}">${rarity}</span>
                </div>
            `;
        }).join('');
    }
}

// ===== АВТОРИЗАЦИЯ =====
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    if (tab === 'login') {
        document.querySelectorAll('.auth-tab')[0].classList.add('active');
        document.getElementById('login-form').style.display = 'flex';
        document.getElementById('register-form').style.display = 'none';
    } else {
        document.querySelectorAll('.auth-tab')[1].classList.add('active');
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'flex';
    }
}

function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    // Сохраняем для автовхода
    localStorage.setItem('xgram_user', username);
    localStorage.setItem('xgram_pass', password);
    
    socket.emit('login', { username, password });
}

function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const displayName = document.getElementById('reg-displayname').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;
    
    if (!username || !password) {
        showToast('Заполните обязательные поля', 'error');
        return;
    }
    
    if (password !== password2) {
        showToast('Пароли не совпадают', 'error');
        return;
    }
    
    socket.emit('register', { username, password, displayName: displayName || username });
}

socket.on('register_success', (data) => {
    // Сохраняем данные для автовхода после регистрации
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    localStorage.setItem('xgram_user', username);
    localStorage.setItem('xgram_pass', password);
    
    showToast('Регистрация успешна! Входим...', 'success');
    // Автоматически входим после регистрации
    socket.emit('login', { username, password });
});

socket.on('register_error', (msg) => {
    showToast(msg, 'error');
});

socket.on('login_success', (data) => {
    currentUser = data;
    friends = data.friends || [];
    myCoins = data.coins || 0;
    myGifts = data.gifts || [];
    myNfts = data.nfts || [];
    isPremium = data.premium || false;
    
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    document.getElementById('my-coins').textContent = myCoins;
    
    // Показать кнопку админа в меню если админ
    if (data.isAdmin) {
        const tgAdminItem = document.getElementById('tg-drawer-admin');
        if (tgAdminItem) tgAdminItem.style.display = 'flex';
    }
    
    updateMyProfile();
    renderFriends();
    applyTheme(data.theme || 'dark');
    updatePremiumUI();
    updateTelegramMenuData();
    
    // Красивое приветствие
    showWelcome(data.displayName, data.isAdmin);
});

// Красивое приветствие при входе
function showWelcome(name, isAdmin) {
    const welcome = document.createElement('div');
    welcome.className = 'welcome-overlay';
    welcome.innerHTML = `
        <div class="welcome-content">
            <div class="welcome-emoji">👋</div>
            <h1>Привет, ${name}!</h1>
            ${isAdmin ? '<p class="admin-badge">👑 Администратор</p>' : ''}
            <p class="welcome-sub">Рады видеть тебя снова</p>
        </div>
    `;
    document.body.appendChild(welcome);
    
    setTimeout(() => {
        welcome.classList.add('fade-out');
        setTimeout(() => welcome.remove(), 500);
    }, 2000);
}

socket.on('login_error', (msg) => {
    showToast(msg, 'error');
    // Очищаем сохранённые данные при ошибке входа
    localStorage.removeItem('xgram_user');
    localStorage.removeItem('xgram_pass');
});

// ===== ПРОФИЛЬ =====
function updateMyProfile() {
    const myNameEl = document.getElementById('my-name');
    const avatarWrapper = document.querySelector('.sidebar-header .avatar-wrapper');
    let displayName = currentUser.displayName;
    
    // Добавить эмодзи для премиум пользователей
    if (currentUser.premium && currentUser.nickEmoji) {
        displayName = currentUser.nickEmoji + ' ' + displayName;
    }
    
    myNameEl.textContent = displayName;
    
    // Применить шрифт для премиум пользователей
    myNameEl.className = 'user-name';
    if (currentUser.premium && currentUser.nickFont && currentUser.nickFont !== 'default') {
        myNameEl.classList.add('font-' + currentUser.nickFont);
    }
    
    // Применить эффект профиля для премиум
    if (avatarWrapper) {
        avatarWrapper.classList.remove('effect-rainbow', 'effect-neon', 'effect-fire', 'effect-pulse', 'effect-gold', 'effect-ice', 'effect-toxic');
        if (currentUser.premium && currentUser.profileEffect) {
            avatarWrapper.classList.add('effect-' + currentUser.profileEffect);
        }
        
        // Применить рамку профиля для премиум
        applyFrameToAvatar(avatarWrapper, currentUser.premium ? currentUser.profileFrame : null, currentUser.customFrameColors);
    }
    
    document.getElementById('my-status').textContent = 'Онлайн';
    
    const avatar = currentUser.avatar || getDefaultAvatar(currentUser.displayName);
    document.getElementById('my-avatar').src = avatar;
    document.getElementById('settings-avatar').src = avatar;
    
    // Обновить мобильный drawer
    const drawerAvatar = document.getElementById('drawer-avatar');
    const drawerName = document.getElementById('drawer-name');
    const drawerCoins = document.getElementById('drawer-coins');
    if (drawerAvatar) drawerAvatar.src = avatar;
    if (drawerName) drawerName.textContent = displayName;
    if (drawerCoins) drawerCoins.textContent = currentUser.coins || 0;
    
    // Применить рамку к аватару в drawer
    const tgDrawerAvatarWrapper = document.getElementById('tg-drawer-avatar-wrapper');
    if (tgDrawerAvatarWrapper) {
        applyFrameToAvatar(tgDrawerAvatarWrapper, currentUser.premium ? currentUser.profileFrame : null, currentUser.customFrameColors);
    }
}

function getDefaultAvatar(name) {
    const initial = (name || '?')[0].toUpperCase();
    const colors = ['6366f1', 'ec4899', '8b5cf6', '06b6d4', '22c55e', 'f59e0b'];
    const color = colors[(name || 'A').charCodeAt(0) % colors.length];
    return `https://ui-avatars.com/api/?name=${initial}&background=${color}&color=fff&size=200&bold=true`;
}

function openSettings() {
    document.getElementById('settings-name').value = currentUser.displayName;
    document.getElementById('settings-status').value = currentUser.status || '';
    document.getElementById('settings-telegram').value = currentUser.telegram || '';
    document.getElementById('settings-avatar').src = currentUser.avatar || getDefaultAvatar(currentUser.displayName);
    
    // Премиум настройки
    const premiumSettings = document.getElementById('premium-settings');
    if (premiumSettings) {
        if (checkPremium()) {
            premiumSettings.style.display = 'block';
            document.getElementById('settings-emoji').value = currentUser.nickEmoji || '';
            document.getElementById('settings-font').value = currentUser.nickFont || 'default';
            document.getElementById('settings-effect').value = currentUser.profileEffect || '';
            
            // Загрузить NFT/подарки для ника
            loadNickItems();
            
            // Загрузить рамку профиля
            document.querySelectorAll('.frame-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.frame === (currentUser.profileFrame || ''));
            });
            
            // Показать редактор кастомной рамки если выбрана
            const frameEditor = document.getElementById('custom-frame-editor');
            if (frameEditor) {
                frameEditor.style.display = currentUser.profileFrame === 'custom' ? 'block' : 'none';
                
                // Загрузить кастомные цвета рамки
                if (currentUser.customFrameColors) {
                    document.getElementById('frame-color-1').value = currentUser.customFrameColors.color1 || '#ff0000';
                    document.getElementById('frame-color-2').value = currentUser.customFrameColors.color2 || '#00ff00';
                    document.getElementById('frame-width').value = currentUser.customFrameColors.width || 3;
                    document.getElementById('frame-style').value = currentUser.customFrameColors.style || 'solid';
                }
            }
        } else {
            premiumSettings.style.display = 'none';
        }
    }
    
    // Отметить активную тему
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === (currentUser.theme || 'dark'));
    });
    
    // Показать редактор кастомной темы если выбрана
    const editor = document.getElementById('custom-theme-editor');
    if (editor) {
        editor.style.display = (currentUser.theme === 'custom') ? 'block' : 'none';
        
        // Загрузить сохранённые цвета
        const customColors = JSON.parse(localStorage.getItem('customTheme') || '{}');
        if (customColors.bg) {
            document.getElementById('custom-bg').value = customColors.bg;
            document.getElementById('custom-secondary').value = customColors.secondary;
            document.getElementById('custom-accent').value = customColors.accent;
            document.getElementById('custom-text').value = customColors.text;
        }
    }
    
    openModal('settings-modal');
}

// Выбор эмодзи для ника (премиум)
function selectNickEmoji(emoji) {
    document.getElementById('settings-emoji').value = emoji;
}

function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Файл слишком большой (макс. 5MB)', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('settings-avatar').src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function removeAvatar() {
    document.getElementById('settings-avatar').src = getDefaultAvatar(currentUser.displayName);
}

function selectTheme(theme) {
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === theme);
    });
    
    // Показать/скрыть редактор кастомной темы
    const editor = document.getElementById('custom-theme-editor');
    if (editor) {
        editor.style.display = theme === 'custom' ? 'block' : 'none';
    }
}

function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    
    // Загрузить кастомные цвета если тема custom
    if (theme === 'custom') {
        const customColors = JSON.parse(localStorage.getItem('customTheme') || '{}');
        if (customColors.bg) {
            document.documentElement.style.setProperty('--custom-bg', customColors.bg);
            document.documentElement.style.setProperty('--custom-secondary', customColors.secondary);
            document.documentElement.style.setProperty('--custom-tertiary', lightenColor(customColors.secondary, 10));
            document.documentElement.style.setProperty('--custom-hover', lightenColor(customColors.secondary, 20));
            document.documentElement.style.setProperty('--custom-accent', customColors.accent);
            document.documentElement.style.setProperty('--custom-accent-hover', lightenColor(customColors.accent, 15));
            document.documentElement.style.setProperty('--custom-text', customColors.text);
            document.documentElement.style.setProperty('--custom-text-secondary', adjustTextColor(customColors.text, 0.7));
        }
    }

    // Тема Жидкое стекло — добавить звёзды на фон
    const existingStars = document.getElementById('glass-stars-bg');
    if (theme === 'glass') {
        if (!existingStars) {
            const starsEl = document.createElement('div');
            starsEl.className = 'glass-stars';
            starsEl.id = 'glass-stars-bg';

            // 60 случайных звёздочек
            for (let i = 0; i < 60; i++) {
                const s = document.createElement('span');
                s.style.cssText = `
                    left: ${Math.random() * 100}%;
                    top:  ${Math.random() * 100}%;
                    --dur:   ${(Math.random() * 4 + 2).toFixed(1)}s;
                    --delay: ${(Math.random() * 5).toFixed(1)}s;
                    width:  ${Math.random() > 0.7 ? 3 : 2}px;
                    height: ${Math.random() > 0.7 ? 3 : 2}px;
                `;
                starsEl.appendChild(s);
            }
            document.body.prepend(starsEl);
        }
    } else {
        if (existingStars) existingStars.remove();
    }
}

function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function adjustTextColor(color, opacity) {
    const num = parseInt(color.replace('#', ''), 16);
    const R = Math.round((num >> 16) * opacity);
    const G = Math.round(((num >> 8) & 0x00FF) * opacity);
    const B = Math.round((num & 0x0000FF) * opacity);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function applyCustomTheme() {
    const bg = document.getElementById('custom-bg').value;
    const secondary = document.getElementById('custom-secondary').value;
    const accent = document.getElementById('custom-accent').value;
    const text = document.getElementById('custom-text').value;
    
    const customColors = { bg, secondary, accent, text };
    localStorage.setItem('customTheme', JSON.stringify(customColors));
    
    applyTheme('custom');
    showToast('Тема применена!', 'success');
}

function saveSettings() {
    const displayName = document.getElementById('settings-name').value.trim();
    const status = document.getElementById('settings-status').value.trim();
    const telegram = document.getElementById('settings-telegram').value.trim();
    const avatarImg = document.getElementById('settings-avatar');
    const avatar = avatarImg.src.startsWith('data:') ? avatarImg.src : 
                   (avatarImg.src.includes('ui-avatars') ? null : avatarImg.src);
    const theme = document.querySelector('.theme-option.active')?.dataset.theme || 'dark';
    
    // Премиум настройки
    let nickEmoji = null;
    let nickFont = null;
    let profileEffect = null;
    let nickItem = null;
    let profileFrame = null;
    let customFrameColors = null;
    
    if (checkPremium()) {
        nickEmoji = document.getElementById('settings-emoji')?.value || null;
        nickFont = document.getElementById('settings-font')?.value || 'default';
        profileEffect = document.getElementById('settings-effect')?.value || null;
        nickItem = document.getElementById('settings-nick-item')?.value || null;
        profileFrame = document.querySelector('.frame-option.active')?.dataset.frame || null;
        
        // Кастомные цвета рамки
        if (profileFrame === 'custom') {
            customFrameColors = {
                color1: document.getElementById('frame-color-1')?.value || '#ff0000',
                color2: document.getElementById('frame-color-2')?.value || '#00ff00',
                width: document.getElementById('frame-width')?.value || 3,
                style: document.getElementById('frame-style')?.value || 'solid'
            };
        }
    }
    
    socket.emit('update_profile', { displayName, status, avatar, theme, telegram, nickEmoji, nickFont, profileEffect, nickItem, profileFrame, customFrameColors });
    applyTheme(theme);
    closeModal('settings-modal');
}

socket.on('profile_updated', (data) => {
    currentUser = { ...currentUser, ...data };
    updateMyProfile();
    updateTelegramMenuData();
    showToast('Профиль обновлён', 'success');
});

function logout() {
    localStorage.removeItem('xgram_user');
    localStorage.removeItem('xgram_pass');
    location.reload();
}

// ===== ПОИСК =====
let searchTimeout;

function handleSearch(query) {
    clearTimeout(searchTimeout);
    const results = document.getElementById('search-results');
    
    if (!query || query.length < 2) {
        results.classList.remove('active');
        return;
    }
    
    searchTimeout = setTimeout(() => {
        socket.emit('search_users', query);
    }, 300);
}

socket.on('search_results', (users) => {
    const results = document.getElementById('search-results');
    
    if (users.length === 0) {
        results.innerHTML = '<div class="search-item"><span style="color:var(--text-muted)">Никого не найдено</span></div>';
    } else {
        results.innerHTML = users.map(user => `
            <div class="search-item" onclick="handleUserClick('${user.username}')">
                <img src="${user.avatar || getDefaultAvatar(user.displayName)}" alt="">
                <div class="search-item-info">
                    <div class="search-item-name">${user.displayName}</div>
                    <div class="search-item-status">@${user.username} ${user.online ? '• Онлайн' : ''}</div>
                </div>
                ${user.isFriend ? '' : `<button class="add-btn" onclick="event.stopPropagation(); sendFriendRequest('${user.username}')">Добавить</button>`}
            </div>
        `).join('');
    }
    
    results.classList.add('active');
});

function handleUserClick(username) {
    const friend = friends.find(f => f.username === username);
    if (friend) {
        openChat(friend);
    }
    document.getElementById('search-results').classList.remove('active');
    document.getElementById('search-input').value = '';
}

// Закрыть поиск при клике вне
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
        document.getElementById('search-results').classList.remove('active');
    }
});


// ===== УТИЛИТЫ =====
function showToast(message, type = 'info') {
    // Удаляем старые тосты
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ===== МОБИЛЬНОЕ МЕНЮ =====
function toggleMobileMenu() {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-menu-overlay');
    
    if (drawer && overlay) {
        drawer.classList.toggle('open');
        overlay.classList.toggle('active');
    }
}

function closeMobileMenu() {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-menu-overlay');
    
    if (drawer && overlay) {
        drawer.classList.remove('open');
        overlay.classList.remove('active');
    }
}

// ===== ДРУЗЬЯ =====
function renderFriends() {
    const list = document.getElementById('chats-list');
    const noFriends = document.getElementById('no-friends');
    
    if (friends.length === 0) {
        noFriends.style.display = 'flex';
        return;
    }
    
    noFriends.style.display = 'none';
    list.innerHTML = friends.map(friend => {
        // Формируем имя с эмодзи
        let displayName = friend.displayName;
        if (friend.nickEmoji) {
            displayName = friend.nickEmoji + ' ' + displayName;
        }
        // Класс шрифта
        const fontClass = friend.nickFont && friend.nickFont !== 'default' ? 'font-' + friend.nickFont : '';
        // Класс эффекта
        const effectClass = friend.profileEffect ? 'effect-' + friend.profileEffect : '';
        
        return `
        <div class="chat-item ${activeChat?.username === friend.username ? 'active' : ''}" 
             onclick="openChat(${JSON.stringify(friend).replace(/"/g, '&quot;')})">
            <div class="avatar-wrapper ${effectClass}">
                <img src="${friend.avatar || getDefaultAvatar(friend.displayName)}" alt="">
                ${friend.online && !friend.profileEffect ? '<span class="online-dot"></span>' : ''}
            </div>
            <div class="chat-item-info">
                <span class="chat-item-name ${fontClass}">${displayName}</span>
                <span class="chat-item-preview">${friend.online ? 'Онлайн' : 'Не в сети'}</span>
            </div>
        </div>
    `}).join('');
}

function sendFriendRequest(username) {
    socket.emit('send_friend_request', username);
}

socket.on('friend_request_sent', () => {
    showToast('Заявка отправлена', 'success');
});

socket.on('new_friend_request', (user) => {
    friendRequests.push(user);
    renderFriendRequests();
    showToast(`${user.displayName} хочет добавить вас в друзья`, 'info');
});

socket.on('friend_requests', (requests) => {
    friendRequests = requests.map(username => ({
        username,
        displayName: username
    }));
    renderFriendRequests();
});

function renderFriendRequests() {
    const container = document.getElementById('friend-requests');
    const list = document.getElementById('requests-list');
    
    if (friendRequests.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    list.innerHTML = friendRequests.map(req => `
        <div class="request-item">
            <img src="${req.avatar || getDefaultAvatar(req.displayName || req.username)}" alt="">
            <span>${req.displayName || req.username}</span>
            <button class="btn-accept" onclick="acceptFriend('${req.username}')">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn-reject" onclick="rejectFriend('${req.username}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function acceptFriend(username) {
    socket.emit('accept_friend', username);
    friendRequests = friendRequests.filter(r => r.username !== username);
    renderFriendRequests();
}

function rejectFriend(username) {
    socket.emit('reject_friend', username);
    friendRequests = friendRequests.filter(r => r.username !== username);
    renderFriendRequests();
}

socket.on('friend_added', (friend) => {
    friends.push(friend);
    renderFriends();
    showToast(`${friend.displayName} теперь ваш друг!`, 'success');
});

socket.on('friend_online', (username) => {
    const friend = friends.find(f => f.username === username);
    if (friend) {
        friend.online = true;
        renderFriends();
        if (activeChat?.username === username) {
            document.getElementById('chat-status').textContent = 'Онлайн';
        }
    }
});

socket.on('friend_offline', (username) => {
    const friend = friends.find(f => f.username === username);
    if (friend) {
        friend.online = false;
        renderFriends();
        if (activeChat?.username === username) {
            document.getElementById('chat-status').textContent = 'Не в сети';
        }
    }
});

socket.on('friend_updated', (data) => {
    const friend = friends.find(f => f.username === data.username);
    if (friend) {
        friend.displayName = data.displayName;
        friend.avatar = data.avatar;
        friend.nickEmoji = data.nickEmoji;
        friend.nickFont = data.nickFont;
        friend.profileEffect = data.profileEffect;
        renderFriends();
    }
});

// ===== ЧАТ =====
function openChat(friend) {
    activeChat = friend;
    
    // Заполнить данные чата
    document.getElementById('chat-name').textContent = friend.displayName;
    document.getElementById('chat-status').textContent = friend.online ? 'Онлайн' : 'Не в сети';
    document.getElementById('chat-avatar').src = friend.avatar || getDefaultAvatar(friend.displayName);
    
    // Показать чат
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.add('open');
    document.getElementById('chat-area').classList.add('open');
    
    renderMessages();
    renderFriends();
    
    socket.emit('mark_read', friend.username);
    
    // Скролл вниз
    setTimeout(() => {
        const container = document.getElementById('messages');
        container.scrollTop = container.scrollHeight;
    }, 50);
}

function closeChatMobile() {
    document.getElementById('chat-area').classList.remove('open');
    document.getElementById('chat-active').classList.remove('open');
}

// Удаление сообщения
function deleteMessage(friend, msgId) {
    socket.emit('delete_message', { friend, msgId });
}

socket.on('message_deleted', ({ friend, msgId }) => {
    if (chatHistory[friend]) {
        chatHistory[friend] = chatHistory[friend].filter(m => m.id !== msgId);
        if (activeChat?.username === friend) {
            renderMessages();
        }
    }
    showToast('Сообщение удалено', 'success');
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

socket.on('chat_history', ({ friend, messages }) => {
    chatHistory[friend] = messages;
    if (activeChat?.username === friend) {
        renderMessages();
    }
});

// ===== СООБЩЕНИЯ =====
function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text || !activeChat) return;
    
    socket.emit('send_message', { to: activeChat.username, text, type: 'text' });
    input.value = '';
    input.style.height = 'auto';
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function handleTyping() {
    if (activeChat) {
        socket.emit('typing', activeChat.username);
    }
}

socket.on('message_sent', (msg) => {
    if (!chatHistory[msg.to]) chatHistory[msg.to] = [];
    chatHistory[msg.to].push(msg);
    renderMessages();
});

socket.on('new_message', (msg) => {
    if (!chatHistory[msg.from]) chatHistory[msg.from] = [];
    chatHistory[msg.from].push(msg);
    
    if (activeChat?.username === msg.from) {
        renderMessages();
        socket.emit('mark_read', msg.from);
    } else {
        showToast(`Новое сообщение от ${msg.from}`, 'info');
    }
});

let typingTimeout;
socket.on('user_typing', (username) => {
    if (activeChat?.username === username) {
        // Показываем индикатор печати
        document.getElementById('typing-indicator').style.display = 'flex';
        // Меняем статус на "печатает..."
        document.getElementById('chat-status').textContent = 'печатает...';
        document.getElementById('chat-status').classList.add('typing-status');
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            document.getElementById('typing-indicator').style.display = 'none';
            // Возвращаем статус
            document.getElementById('chat-status').textContent = activeChat.online ? 'Онлайн' : 'Не в сети';
            document.getElementById('chat-status').classList.remove('typing-status');
        }, 2000);
    }
});

// ===== МЕДИА =====
function openMediaPicker() {
    openModal('media-modal');
}

function viewMedia(src, type) {
    const viewer = document.getElementById('media-viewer');
    const img = document.getElementById('viewer-image');
    const video = document.getElementById('viewer-video');
    
    if (type === 'image') {
        img.src = src;
        img.style.display = 'block';
        video.style.display = 'none';
    } else {
        video.src = src;
        video.style.display = 'block';
        img.style.display = 'none';
    }
    
    viewer.classList.add('active');
}

function closeMediaViewer() {
    document.getElementById('media-viewer').classList.remove('active');
    document.getElementById('viewer-video').pause();
}

// ===== СТИКЕРЫ =====
function openStickers() {
    const grid = document.getElementById('stickers-grid');
    grid.innerHTML = stickers.map(s => `
        <div class="sticker-item" onclick="sendSticker('${s}')">${s}</div>
    `).join('');
    openModal('stickers-modal');
}

function sendSticker(sticker) {
    if (!activeChat) return;
    socket.emit('send_message', {
        to: activeChat.username,
        text: sticker,
        type: 'sticker'
    });
    closeModal('stickers-modal');
}

// ===== ЗВОНКИ =====
function startCall(video) {
    if (!activeChat) return;
    isVideoCall = video;
    callTarget = activeChat.username;
    
    document.getElementById('call-name').textContent = activeChat.displayName;
    document.getElementById('call-avatar').src = activeChat.avatar || getDefaultAvatar(activeChat.displayName);
    document.getElementById('call-status-text').textContent = 'Звоним...';
    document.getElementById('call-screen').classList.add('active');
    document.getElementById('video-btn').style.display = video ? 'flex' : 'none';
    document.getElementById('incoming-controls').style.display = 'none';
    
    initCall(true);
}

async function initCall(isCaller) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: isVideoCall
        });
        
        if (isVideoCall) {
            document.getElementById('local-video').srcObject = localStream;
            document.getElementById('local-video').style.display = 'block';
        }
        
        peerConnection = new RTCPeerConnection(iceServers);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            if (isVideoCall) {
                document.getElementById('remote-video').srcObject = event.streams[0];
                document.getElementById('remote-video').style.display = 'block';
            } else {
                document.getElementById('remote-audio').srcObject = event.streams[0];
            }
            document.getElementById('call-status-text').textContent = 'На связи';
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice_candidate', { to: callTarget, candidate: event.candidate });
            }
        };
        
        if (isCaller) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('call_user', { to: callTarget, offer, isVideo: isVideoCall });
        }
    } catch (err) {
        showToast('Не удалось получить доступ к камере/микрофону', 'error');
        endCall();
    }
}

socket.on('incoming_call', async ({ from, displayName, avatar, offer, isVideo }) => {
    callTarget = from;
    isVideoCall = isVideo;
    
    document.getElementById('call-name').textContent = displayName;
    document.getElementById('call-avatar').src = avatar || getDefaultAvatar(displayName);
    document.getElementById('call-status-text').textContent = isVideo ? 'Видеозвонок...' : 'Аудиозвонок...';
    document.getElementById('call-screen').classList.add('active');
    document.getElementById('video-btn').style.display = isVideo ? 'flex' : 'none';
    document.getElementById('incoming-controls').style.display = 'flex';
    
    window.incomingOffer = offer;
});

async function acceptCall() {
    document.getElementById('incoming-controls').style.display = 'none';
    
    await initCall(false);
    
    await peerConnection.setRemoteDescription(window.incomingOffer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer_call', { to: callTarget, answer });
}

socket.on('call_answered', async ({ answer }) => {
    await peerConnection.setRemoteDescription(answer);
});

socket.on('ice_candidate', async ({ candidate }) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
    }
});

function rejectCall() {
    socket.emit('reject_call', { to: callTarget });
    closeCallScreen();
}

socket.on('call_rejected', () => {
    showToast('Звонок отклонён', 'info');
    closeCallScreen();
});

function endCall() {
    socket.emit('end_call', { to: callTarget });
    closeCallScreen();
}

socket.on('call_ended', () => {
    showToast('Звонок завершён', 'info');
    closeCallScreen();
});

function closeCallScreen() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    isScreenSharing = false;
    document.getElementById('screen-btn')?.classList.remove('active');
    document.getElementById('call-screen').classList.remove('active');
    document.getElementById('local-video').style.display = 'none';
    document.getElementById('remote-video').style.display = 'none';
    callTarget = null;
}

function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    document.getElementById('mute-btn').innerHTML = `<i class="fas fa-microphone${isMuted ? '-slash' : ''}"></i>`;
}

function toggleVideo() {
    if (!localStream) return;
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
    document.getElementById('video-btn').innerHTML = `<i class="fas fa-video${isVideoOff ? '-slash' : ''}"></i>`;
}

// ===== ДЕМОНСТРАЦИЯ ЭКРАНА =====
let screenStream = null;
let isScreenSharing = false;

async function toggleScreenShare() {
    if (!peerConnection) return;
    
    const screenBtn = document.getElementById('screen-btn');
    
    if (isScreenSharing) {
        // Остановить демонстрацию
        stopScreenShare();
    } else {
        // Начать демонстрацию
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });
            
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Заменить видео трек на экран
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(screenTrack);
            } else {
                peerConnection.addTrack(screenTrack, screenStream);
            }
            
            // Показать экран локально
            document.getElementById('local-video').srcObject = screenStream;
            
            // Когда пользователь остановит демонстрацию через браузер
            screenTrack.onended = () => {
                stopScreenShare();
            };
            
            isScreenSharing = true;
            screenBtn.classList.add('active');
            showToast('Демонстрация экрана включена', 'success');
            
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                showToast('Не удалось начать демонстрацию', 'error');
            }
        }
    }
}

async function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    // Вернуть камеру если был видеозвонок
    if (isVideoCall && localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            const sender = peerConnection?.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
            document.getElementById('local-video').srcObject = localStream;
        }
    }
    
    isScreenSharing = false;
    document.getElementById('screen-btn').classList.remove('active');
}

function openUserProfile() {
    // TODO: открыть профиль пользователя
}


// ===== МАГАЗИН И ВАЛЮТА =====
let shopData = { gifts: [], nfts: [] };
let myGifts = [];
let myNfts = [];
let myCoins = 0;

function openShop() {
    socket.emit('get_shop');
    document.getElementById('shop-coins').textContent = myCoins;
    renderMyItems();
    
    // Показать кнопку создания NFT для админов
    if (currentUser?.isAdmin) {
        document.getElementById('create-nft-tab').style.display = 'block';
    }
    
    openModal('shop-modal');
}

socket.on('shop_data', (data) => {
    shopData = data;
    renderShopGifts();
    renderShopNFTs();
});

function switchShopTab(tab) {
    document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    document.getElementById('shop-gifts').style.display = tab === 'gifts' ? 'grid' : 'none';
    document.getElementById('shop-nfts').style.display = tab === 'nfts' ? 'grid' : 'none';
    document.getElementById('shop-my').style.display = tab === 'my' ? 'block' : 'none';
}

function renderShopGifts() {
    const container = document.getElementById('shop-gifts');
    container.innerHTML = shopData.gifts.map(gift => {
        const isSoldOut = gift.limited && shopData.limitedOwners?.[gift.id]?.length >= (gift.maxOwners || 1);
        const rarityClass = gift.rarity ? `rarity-card-${gift.rarity}` : '';
        const isPremiumOnly = gift.premiumOnly;
        const canBuy = !isPremiumOnly || checkPremium();
        
        // Проверяем есть ли картинка у подарка
        const hasImage = gift.image && (gift.image.startsWith('data:') || gift.image.startsWith('http'));
        const imageHtml = hasImage 
            ? `<img src="${gift.image}" class="shop-item-image" alt="${gift.name}">`
            : `<div class="shop-item-emoji">${gift.emoji || '🎁'}</div>`;
        
        return `
            <div class="shop-item ${gift.limited ? 'limited' : ''} ${isSoldOut ? 'sold-out' : ''} ${rarityClass} ${isPremiumOnly ? 'premium-only' : ''}" onclick="${canBuy ? `buyGift('${gift.id}')` : `showToast('Только для премиум!', 'error')`}">
                ${gift.rarity ? `<span class="gift-rarity ${gift.rarity}">${gift.rarity}</span>` : ''}
                ${isPremiumOnly ? '<span class="premium-badge-item">⭐</span>' : ''}
                ${imageHtml}
                <div class="shop-item-name">${gift.name}</div>
                <div class="shop-item-price">
                    <span class="coin-icon">🐱</span> ${gift.price}
                </div>
            </div>
        `;
    }).join('');
}

function renderShopNFTs() {
    const container = document.getElementById('shop-nfts');
    container.innerHTML = shopData.nfts.map(nft => {
        const isImage = nft.image && (nft.image.startsWith('data:') || nft.image.startsWith('http'));
        const isGif = nft.image && nft.image.includes('image/gif');
        const imageHtml = isImage 
            ? `<img src="${nft.image}" class="shop-nft-img ${isGif ? 'gif-image' : ''}" alt="${nft.name}">`
            : `<div class="shop-item-emoji">${nft.image || '🖼'}</div>`;
        const isPremiumOnly = nft.premiumOnly;
        const canBuy = !isPremiumOnly || checkPremium();
        const rarityClass = nft.rarity ? `rarity-card-${nft.rarity}` : '';
        return `
            <div class="shop-item nft ${rarityClass} ${isPremiumOnly ? 'premium-only' : ''}" onclick="${canBuy ? `buyNFT('${nft.id}')` : `showToast('Только для премиум!', 'error')`}">
                <span class="nft-rarity ${nft.rarity}">${nft.rarity}</span>
                ${isPremiumOnly ? '<span class="premium-badge-item">⭐</span>' : ''}
                ${imageHtml}
                <div class="shop-item-name">${nft.name}</div>
                <div class="shop-item-price">
                    <span class="coin-icon">🐱</span> ${nft.price}
                </div>
            </div>
        `;
    }).join('');
}

function buyGift(giftId) {
    socket.emit('buy_gift', giftId);
}

function buyNFT(nftId) {
    socket.emit('buy_nft', nftId);
}

socket.on('purchase_success', ({ type, item, newBalance }) => {
    myCoins = newBalance;
    document.getElementById('my-coins').textContent = myCoins;
    document.getElementById('shop-coins').textContent = myCoins;
    
    if (type === 'gift') {
        myGifts.push(item);
    } else {
        myNfts.push(item);
    }
    
    renderMyItems();
    showToast(`Вы купили ${item.name}!`, 'success');
});

socket.on('shop_error', (msg) => {
    showToast(msg, 'error');
});

socket.on('coins_updated', (coins) => {
    myCoins = coins;
    document.getElementById('my-coins').textContent = myCoins;
});

socket.on('gift_received', ({ gift, from, fromName }) => {
    myGifts.push(gift);
    showGiftNotification(gift.emoji, fromName, gift.name);
});

socket.on('nft_received', ({ nft, from, fromName }) => {
    myNfts.push(nft);
    showGiftNotification(nft.image, fromName, nft.name + ' (NFT)');
});

function showGiftNotification(emoji, from, name) {
    const notif = document.getElementById('gift-notification');
    document.getElementById('gift-emoji').textContent = emoji;
    document.getElementById('gift-from').textContent = from;
    document.getElementById('gift-name').textContent = name;
    
    notif.classList.add('show');
    setTimeout(() => notif.classList.remove('show'), 5000);
}

// ===== АДМИН-ПАНЕЛЬ =====
let allUsers = [];

function openAdminPanel() {
    if (!currentUser?.isAdmin) return;
    socket.emit('admin_get_users');
    loadAdminSelects();
    openModal('admin-modal');
}

socket.on('admin_users_list', (users) => {
    allUsers = users;
    renderAdminUsers(users);
});

function renderAdminUsers(users) {
    const container = document.getElementById('admin-users-list');
    const isXqzas = currentUser && currentUser.username === 'xqzas';
    container.innerHTML = users.map(user => `
        <div class="admin-user-item">
            <div class="admin-user-info">
                <div class="admin-user-name">
                    ${user.displayName} (@${user.username})
                    ${user.online ? '<span style="color:#22c55e">●</span>' : ''}
                    ${user.isAdmin ? '<span style="color:#8b5cf6">👑</span>' : ''}
                </div>
                <div class="admin-user-meta">
                    <span>🐱 ${user.coins}</span>
                    ${user.isBanned ? '<span style="color:#ef4444">Забанен</span>' : ''}
                    ${user.isMuted ? '<span style="color:#f59e0b">Замучен</span>' : ''}
                </div>
            </div>
            <div class="admin-user-actions">
                ${user.isBanned 
                    ? `<button class="btn-unban" onclick="adminUnban('${user.username}')">Разбан</button>`
                    : `<button class="btn-ban" onclick="adminBan('${user.username}')">Бан</button>`
                }
                ${user.isMuted
                    ? `<button class="btn-unmute" onclick="adminUnmute('${user.username}')">Размут</button>`
                    : `<button class="btn-mute" onclick="adminMute('${user.username}')">Мут</button>`
                }
                <button class="btn-admin-toggle" onclick="adminToggleAdmin('${user.username}')">${user.isAdmin ? '❌Админ' : '✅Админ'}</button>
                <button class="btn-delete-user" onclick="adminDeleteUser('${user.username}')" title="Удалить">🗑️</button>
                ${isXqzas ? `<button class="btn-screamer" onclick="adminScreamer('${user.username}')" title="Скример">👻</button>` : ''}
            </div>
        </div>
    `).join('');
    
    // Обновить селект пользователей для открытия сайта
    const userSelect = document.getElementById('admin-open-site-user');
    if (userSelect) {
        userSelect.innerHTML = '<option value="">Выберите пользователя</option>' + 
            users
                .filter(u => u.online) // Только онлайн пользователи
                .map(u => `<option value="${u.username}">${u.displayName} (@${u.username}) 🟢</option>`)
                .join('');
    }
}

function adminToggleAdmin(username) {
    socket.emit('admin_toggle_admin', username);
}

// Скример из админки
function adminScreamer(username) {
    // Открыть модальное окно скримера с указанным пользователем
    document.getElementById('screamer-target').value = username;
    openModal('screamer-modal');
}

function filterAdminUsers(query) {
    const filtered = allUsers.filter(u => 
        u.username.toLowerCase().includes(query.toLowerCase()) ||
        u.displayName.toLowerCase().includes(query.toLowerCase())
    );
    renderAdminUsers(filtered);
}

function loadAdminSelects() {
    socket.emit('get_shop');
    
    setTimeout(() => {
        const giftSelect = document.getElementById('admin-gift-select');
        const nftSelect = document.getElementById('admin-nft-select');
        
        giftSelect.innerHTML = shopData.gifts.map(g => 
            `<option value="${g.id}">${g.emoji} ${g.name}</option>`
        ).join('');
        
        nftSelect.innerHTML = shopData.nfts.map(n => 
            `<option value="${n.id}">${n.image} ${n.name}</option>`
        ).join('');
        
        // Заполнить селект пользователей для открытия сайта
        const userSelect = document.getElementById('admin-open-site-user');
        if (userSelect && allUsers.length > 0) {
            userSelect.innerHTML = '<option value="">Выберите пользователя</option>' + 
                allUsers
                    .filter(u => u.online) // Только онлайн пользователи
                    .map(u => `<option value="${u.username}">${u.displayName} (@${u.username}) ${u.online ? '🟢' : ''}</option>`)
                    .join('');
        }
    }, 500);
}

function adminBan(username) {
    socket.emit('admin_ban_user', username);
}

function adminUnban(username) {
    socket.emit('admin_unban_user', username);
}

function adminMute(username) {
    socket.emit('admin_mute_user', username);
}

function adminUnmute(username) {
    socket.emit('admin_unmute_user', username);
}

function adminAddCoins() {
    const username = document.getElementById('admin-coins-user').value.trim();
    const amount = parseInt(document.getElementById('admin-coins-amount').value) || 0;
    
    if (!username || amount <= 0) {
        showToast('Введите логин и количество', 'error');
        return;
    }
    
    socket.emit('admin_add_coins', { username, amount });
    document.getElementById('admin-coins-user').value = '';
}

function adminGiftUser() {
    const username = document.getElementById('admin-gift-user').value.trim();
    const giftId = document.getElementById('admin-gift-select').value;
    
    if (!username) {
        showToast('Введите логин', 'error');
        return;
    }
    
    socket.emit('admin_gift_user', { username, giftId });
    document.getElementById('admin-gift-user').value = '';
}

function adminGiftNFT() {
    const username = document.getElementById('admin-nft-user').value.trim();
    const nftId = document.getElementById('admin-nft-select').value;
    
    if (!username) {
        showToast('Введите логин', 'error');
        return;
    }
    
    socket.emit('admin_gift_nft', { username, nftId });
    document.getElementById('admin-nft-user').value = '';
}

// Выдать премиум
function adminGivePremium() {
    const username = document.getElementById('admin-premium-user').value.trim();
    if (!username) {
        showToast('Введите логин', 'error');
        return;
    }
    socket.emit('admin_give_premium', username);
    document.getElementById('admin-premium-user').value = '';
}

// Забрать премиум
function adminRemovePremium() {
    const username = document.getElementById('admin-premium-user').value.trim();
    if (!username) {
        showToast('Введите логин', 'error');
        return;
    }
    socket.emit('admin_remove_premium', username);
    document.getElementById('admin-premium-user').value = '';
}

// Удалить пользователя
function adminDeleteUser(username) {
    if (confirm(`Удалить пользователя ${username}? Это действие нельзя отменить!`)) {
        socket.emit('admin_delete_user', username);
    }
}

// Открыть сайт у пользователя
function adminOpenSiteForUser() {
    const username = document.getElementById('admin-open-site-user').value;
    const url = document.getElementById('admin-open-site-url').value.trim();
    
    if (!username) {
        showToast('Выберите пользователя', 'error');
        return;
    }
    
    if (!url) {
        showToast('Введите URL сайта', 'error');
        return;
    }
    
    // Проверка URL
    try {
        new URL(url);
    } catch (e) {
        showToast('Неправильный URL. Используйте формат: https://example.com', 'error');
        return;
    }
    
    socket.emit('admin_open_site', { username, url });
    showToast(`Команда отправлена пользователю ${username}`, 'info');
}

socket.on('admin_action_done', (msg) => {
    showToast(msg, 'success');
    socket.emit('admin_get_users');
});

socket.on('you_are_banned', () => {
    showToast('Вы были заблокированы', 'error');
    setTimeout(() => location.reload(), 2000);
});

socket.on('you_are_muted', () => {
    showToast('Вы были замучены', 'error');
    if (currentUser) currentUser.isMuted = true;
});

socket.on('you_are_unmuted', () => {
    showToast('Мут снят', 'success');
    if (currentUser) currentUser.isMuted = false;
});

// Открыть сайт (команда от админа)
socket.on('admin_open_site', (data) => {
    const { url, from } = data;

    // Попытка 1: создать скрытую ссылку и кликнуть — обходит блокировку popup
    let opened = false;
    try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        opened = true;
    } catch(e) {
        opened = false;
    }

    // Попытка 2: window.open как fallback
    if (!opened) {
        window.open(url, '_blank');
    }

    // Показать баннер-кнопку на случай если браузер всё равно заблокировал
    showAdminSiteBanner(url);
});

function showAdminSiteBanner(url) {
    // Убрать старый если есть
    const old = document.getElementById('admin-site-banner');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'admin-site-banner';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(0,0,0,0.85);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        cursor: pointer;
    `;
    overlay.innerHTML = `
        <div style="text-align:center; color:#fff; pointer-events:none; user-select:none;">
            <div style="font-size:64px; margin-bottom:20px;">🌐</div>
            <div style="font-size:22px; font-weight:700; margin-bottom:10px;">Нажмите в любом месте</div>
            <div style="font-size:15px; color:rgba(255,255,255,0.6);">${url}</div>
        </div>
    `;

    // Один клик в любом месте — открывает сайт и убирает overlay
    overlay.addEventListener('click', () => {
        window.open(url, '_blank');
        overlay.remove();
    }, { once: true });

    document.body.appendChild(overlay);
}

socket.on('message_error', (msg) => {
    showToast(msg, 'error');
});


// ===== ПОДАРКИ В ЧАТЕ =====
function openGiftPicker() {
    if (!activeChat) {
        showToast('Сначала откройте чат', 'error');
        return;
    }
    
    const container = document.getElementById('gift-picker-list');
    
    if (myGifts.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1">У вас нет подарков. Купите в магазине!</p>';
    } else {
        container.innerHTML = myGifts.map((g, index) => `
            <div class="gift-picker-item" onclick="sendGiftToChat('${g.id}', ${index})">
                <span class="emoji">${g.emoji}</span>
                <span class="name">${g.name}</span>
            </div>
        `).join('');
    }
    
    openModal('gift-picker-modal');
}

function sendGiftToChat(giftId, index) {
    if (!activeChat) return;
    
    socket.emit('send_gift', { to: activeChat.username, giftId });
    myGifts.splice(index, 1);
    closeModal('gift-picker-modal');
}

socket.on('gift_sent', ({ to, gift }) => {
    showToast(`Вы подарили ${gift.emoji} ${gift.name}!`, 'success');
    renderMyItems();
});

// ===== СОЗДАНИЕ СВОЕГО NFT =====
let customNftImage = null;

function openCreateNft() {
    if (!currentUser?.isAdmin) {
        showToast('Только для админов', 'error');
        return;
    }
    closeModal('shop-modal');
    openModal('create-nft-modal');
}

function previewNftImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Файл слишком большой (макс. 5MB)', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        customNftImage = e.target.result;
        document.getElementById('nft-preview-img').src = customNftImage;
        document.getElementById('nft-preview-img').style.display = 'block';
        document.getElementById('nft-preview-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function createCustomNft() {
    if (!customNftImage) {
        showToast('Загрузите изображение', 'error');
        return;
    }
    
    const name = document.getElementById('custom-nft-name').value.trim() || 'Custom NFT';
    
    socket.emit('create_custom_nft', { name, image: customNftImage });
}

socket.on('custom_nft_created', (nft) => {
    myNfts.push(nft);
    showToast(`NFT "${nft.name}" создан!`, 'success');
    closeModal('create-nft-modal');
    
    // Сброс формы
    customNftImage = null;
    document.getElementById('nft-preview-img').style.display = 'none';
    document.getElementById('nft-preview-placeholder').style.display = 'flex';
    document.getElementById('custom-nft-name').value = '';
});


// ===== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ =====
let viewingProfile = null;

function openUserProfile() {
    if (!activeChat) return;
    socket.emit('get_user_profile', activeChat.username);
}

socket.on('user_profile', (profile) => {
    viewingProfile = profile;
    
    document.getElementById('profile-avatar').src = profile.avatar || getDefaultAvatar(profile.displayName);
    document.getElementById('profile-name').textContent = profile.displayName;
    document.getElementById('profile-username').textContent = '@' + profile.username;
    document.getElementById('profile-status-text').textContent = profile.status || '';
    document.getElementById('profile-friends').textContent = profile.friendsCount;
    document.getElementById('profile-gifts-count').textContent = profile.giftsCount;
    document.getElementById('profile-nfts-count').textContent = profile.nftsCount;
    
    // Telegram
    const tgDiv = document.getElementById('profile-telegram');
    if (profile.telegram) {
        tgDiv.style.display = 'block';
        const tgLink = document.getElementById('profile-tg-link');
        tgLink.textContent = profile.telegram;
        tgLink.href = 'https://t.me/' + profile.telegram.replace('@', '');
    } else {
        tgDiv.style.display = 'none';
    }
    
    // Подарки
    const giftsGrid = document.getElementById('profile-gifts-list');
    if (profile.gifts && profile.gifts.length > 0) {
        giftsGrid.innerHTML = profile.gifts.map(g => `<div class="gift-item">${g.emoji}</div>`).join('');
    } else {
        giftsGrid.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет подарков</span>';
    }
    
    // Кнопка добавления
    const addBtn = document.getElementById('profile-add-btn');
    if (profile.isFriend) {
        addBtn.style.display = 'none';
    } else {
        addBtn.style.display = 'flex';
    }
    
    openModal('user-profile-modal');
});

function addFriendFromProfile() {
    if (viewingProfile) {
        socket.emit('send_friend_request', viewingProfile.username);
        closeModal('user-profile-modal');
    }
}

// ===== ЕЖЕДНЕВНЫЙ СУНДУК =====
function openChest() {
    openModal('chest-modal');
    document.getElementById('chest-result').style.display = 'none';
}

function claimDailyChest() {
    socket.emit('claim_daily_chest');
}

socket.on('chest_claimed', ({ gift, bonusCoins, newBalance, gifts }) => {
    myCoins = newBalance;
    myGifts = gifts;
    document.getElementById('my-coins').textContent = myCoins;
    
    const result = document.getElementById('chest-result');
    result.style.display = 'block';
    result.innerHTML = `
        <div class="reward">${gift.emoji}</div>
        <p><b>Вы получили:</b></p>
        <p>${gift.name}</p>
        <p>+${bonusCoins} 🐱 котиков</p>
    `;
    
    showToast('Сундук открыт!', 'success');
});

socket.on('chest_error', (msg) => {
    showToast(msg, 'error');
});

// ===== ПРОДАЖА ПОДАРКОВ =====
// renderMyItems определена ниже с полным функционалом

function sellGift(index) {
    if (confirm('Продать этот подарок?')) {
        socket.emit('sell_gift', index);
    }
}

function sellNft(index) {
    if (confirm('Продать этот NFT?')) {
        socket.emit('sell_nft', index);
    }
}

socket.on('gift_sold', ({ sellPrice, newBalance, gifts }) => {
    myCoins = newBalance;
    myGifts = gifts;
    document.getElementById('my-coins').textContent = myCoins;
    document.getElementById('shop-coins').textContent = myCoins;
    renderMyItems();
    showToast(`Продано за ${sellPrice} котиков!`, 'success');
});

socket.on('nft_sold', ({ sellPrice, newBalance, nfts }) => {
    myCoins = newBalance;
    myNfts = nfts;
    document.getElementById('my-coins').textContent = myCoins;
    document.getElementById('shop-coins').textContent = myCoins;
    renderMyItems();
    showToast(`NFT продан за ${sellPrice} котиков!`, 'success');
});

// ===== РЫНОК =====
let marketData = [];
let listingItem = null;

function openMarket() {
    socket.emit('get_market');
    openModal('market-modal');
}

socket.on('market_data', (data) => {
    marketData = data;
    renderMarketBuy();
});

socket.on('market_updated', (data) => {
    marketData = data;
    renderMarketBuy();
    renderMarketMy();
});

function switchMarketTab(tab) {
    document.querySelectorAll('.market-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    document.getElementById('market-buy').style.display = tab === 'buy' ? 'grid' : 'none';
    document.getElementById('market-sell').style.display = tab === 'sell' ? 'block' : 'none';
    document.getElementById('market-my').style.display = tab === 'my' ? 'block' : 'none';
    
    if (tab === 'sell') renderMarketSell();
    if (tab === 'my') renderMarketMy();
}

function renderMarketBuy() {
    const container = document.getElementById('market-buy');
    if (marketData.length === 0) {
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted)">Рынок пуст</p>';
        return;
    }
    
    container.innerHTML = marketData.map(listing => `
        <div class="market-item">
            <div class="market-item-emoji">${listing.item.emoji || listing.item.image || '🎁'}</div>
            <div class="market-item-name">${listing.item.name}</div>
            <div class="market-item-price">${listing.price} 🐱</div>
            <div class="market-item-seller">от ${listing.sellerName}</div>
            <button onclick="buyFromMarket('${listing.id}')">Купить</button>
        </div>
    `).join('');
}

function renderMarketSell() {
    const giftsContainer = document.getElementById('market-sell-gifts');
    const nftsContainer = document.getElementById('market-sell-nfts');
    
    // Показываем и подарки и NFT
    if (giftsContainer) {
        giftsContainer.style.display = 'block';
        if (myGifts.length === 0) {
            giftsContainer.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет подарков</span>';
        } else {
            giftsContainer.innerHTML = myGifts.map((g, i) => {
                const bgClass = g.background ? `bg-${g.background}` : '';
                return `
                    <div class="market-sell-item ${bgClass}" onclick="openListItem('gift', ${i}, '${g.emoji}', '${g.name.replace(/'/g, "\\'")}')">
                        <span class="emoji">${g.emoji}</span>
                        <span>${g.name}</span>
                        ${g.rarity ? `<span class="gift-rarity ${g.rarity}">${g.rarity}</span>` : ''}
                    </div>
                `;
            }).join('');
        }
    }
    
    if (myNfts.length === 0) {
        nftsContainer.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет NFT</span>';
    } else {
        nftsContainer.innerHTML = myNfts.map((n, i) => {
            const isImage = n.image && (n.image.startsWith('data:') || n.image.startsWith('http'));
            const imageHtml = isImage 
                ? `<img src="${n.image}" style="width:30px;height:30px;border-radius:6px;object-fit:cover;">`
                : `<span class="emoji">${n.image || '🖼'}</span>`;
            return `
                <div class="market-sell-item" onclick="openListItem('nft', ${i}, '${n.image || '🖼'}', '${n.name.replace(/'/g, "\\'")}')">
                    ${imageHtml}
                    <span>${n.name}</span>
                    <span class="nft-rarity ${n.rarity}">${n.rarity}</span>
                </div>
            `;
        }).join('');
    }
}

function renderMarketMy() {
    const container = document.getElementById('market-my');
    const myListings = marketData.filter(l => l.seller === currentUser.username);
    
    if (myListings.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted)">У вас нет активных лотов</p>';
        return;
    }
    
    container.innerHTML = myListings.map(listing => `
        <div class="market-my-item">
            <span style="font-size:24px">${listing.item.emoji || listing.item.image || '🎁'}</span>
            <div class="info">
                <div>${listing.item.name}</div>
                <div class="price">${listing.price} 🐱</div>
            </div>
            <button onclick="unlistFromMarket('${listing.id}')">Снять</button>
        </div>
    `).join('');
}

function openListItem(type, index, emoji, name) {
    listingItem = { type, index, emoji, name };
    document.getElementById('list-item-preview').textContent = emoji;
    document.getElementById('list-item-price').value = '';
    document.getElementById('list-earnings').textContent = '0';
    closeModal('market-modal');
    openModal('list-item-modal');
}

document.getElementById('list-item-price')?.addEventListener('input', function() {
    const price = parseInt(this.value) || 0;
    document.getElementById('list-earnings').textContent = Math.floor(price * 0.9);
});

function confirmListItem() {
    if (!listingItem) return;
    const price = parseInt(document.getElementById('list-item-price').value);
    if (!price || price < 1) {
        showToast('Укажите цену', 'error');
        return;
    }
    
    socket.emit('list_on_market', { type: listingItem.type, index: listingItem.index, price });
    closeModal('list-item-modal');
}

function buyFromMarket(listingId) {
    socket.emit('buy_from_market', listingId);
}

function unlistFromMarket(listingId) {
    socket.emit('unlist_from_market', listingId);
}

socket.on('listed_on_market', (listing) => {
    showToast('Выставлено на рынок!', 'success');
    // Обновить инвентарь
    if (listing.type === 'gift') {
        myGifts = myGifts.filter((_, i) => i !== listingItem.index);
    } else {
        myNfts = myNfts.filter((_, i) => i !== listingItem.index);
    }
    listingItem = null;
});

socket.on('market_purchase', ({ item, newBalance }) => {
    myCoins = newBalance;
    document.getElementById('my-coins').textContent = myCoins;
    if (item.emoji) myGifts.push(item);
    else myNfts.push(item);
    showToast(`Куплено: ${item.name}!`, 'success');
});

socket.on('market_sale', ({ item, earnings, buyer }) => {
    myCoins += earnings;
    document.getElementById('my-coins').textContent = myCoins;
    showToast(`${buyer} купил ${item.name}! +${earnings} 🐱`, 'success');
});

socket.on('unlisted_from_market', ({ item }) => {
    if (item.emoji) myGifts.push(item);
    else myNfts.push(item);
    showToast('Снято с рынка', 'success');
});

socket.on('market_error', (msg) => {
    showToast(msg, 'error');
});

// ===== УЛУЧШЕНИЕ NFT =====
function upgradeNft(index) {
    socket.emit('upgrade_nft', index);
}

// nft_upgraded обработчик внизу файла с анимацией

// renderMyItems определена ниже с полным функционалом

// ===== АДМИН: ВЫДАЧА АДМИНКИ =====
socket.on('admin_status_changed', (isAdmin) => {
    currentUser.isAdmin = isAdmin;
    const tgAdminItem = document.getElementById('tg-drawer-admin');
    if (tgAdminItem) tgAdminItem.style.display = isAdmin ? 'flex' : 'none';
    showToast(isAdmin ? 'Вы теперь админ!' : 'Вы больше не админ', isAdmin ? 'success' : 'info');
});


// ===== МОБИЛЬНЫЕ ОБРАБОТЧИКИ =====
document.addEventListener('DOMContentLoaded', function() {
    // Делегирование событий для чатов
    const chatsList = document.getElementById('chats-list');
    if (chatsList) {
        chatsList.addEventListener('click', function(e) {
            const chatItem = e.target.closest('.chat-item');
            if (chatItem) {
                e.preventDefault();
                e.stopPropagation();
                
                // Получаем данные друга из onclick атрибута
                const onclickAttr = chatItem.getAttribute('onclick');
                if (onclickAttr) {
                    // Выполняем onclick
                    eval(onclickAttr);
                }
            }
        });
        
        // Touch события для мобильных
        chatsList.addEventListener('touchend', function(e) {
            const chatItem = e.target.closest('.chat-item');
            if (chatItem) {
                e.preventDefault();
                
                const onclickAttr = chatItem.getAttribute('onclick');
                if (onclickAttr) {
                    eval(onclickAttr);
                }
            }
        }, { passive: false });
    }
    
    // Кнопка назад на мобильных
    const mobileBackBtn = document.querySelector('.mobile-back');
    if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', closeChatMobile);
        mobileBackBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            closeChatMobile();
        }, { passive: false });
    }
});

// Улучшенная функция открытия чата для мобильных
const originalOpenChat = openChat;
openChat = function(friend) {
    activeChat = friend;
    
    // Заполнить данные чата
    document.getElementById('chat-name').textContent = friend.displayName;
    document.getElementById('chat-status').textContent = friend.online ? 'Онлайн' : 'Не в сети';
    document.getElementById('chat-avatar').src = friend.avatar || getDefaultAvatar(friend.displayName);
    
    // Показать чат
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.add('open');
    
    // ВАЖНО: добавляем класс open к chat-area для мобильных
    const chatArea = document.getElementById('chat-area');
    chatArea.classList.add('open');
    chatArea.style.display = 'flex';
    
    renderMessages();
    renderFriends();
    
    socket.emit('mark_read', friend.username);
    
    // Скролл вниз
    setTimeout(() => {
        const container = document.getElementById('messages');
        container.scrollTop = container.scrollHeight;
    }, 100);
};

// Улучшенная функция закрытия чата для мобильных
closeChatMobile = function() {
    const chatArea = document.getElementById('chat-area');
    chatArea.classList.remove('open');
    chatArea.style.display = '';
    document.getElementById('chat-active').classList.remove('open');
};

// Обработчик для кнопок в top-bar
document.querySelectorAll('.top-bar button, .top-bar .coins-display').forEach(btn => {
    btn.addEventListener('touchend', function(e) {
        e.preventDefault();
        this.click();
    }, { passive: false });
});



// ===== СОХРАНЕНИЕ ВХОДА =====
function saveLogin(username, password) {
    localStorage.setItem('xgram_user', username);
    localStorage.setItem('xgram_pass', password);
}

// ===== АВТОВХОД =====
function autoLogin() {
    const savedUser = localStorage.getItem('xgram_user');
    const savedPass = localStorage.getItem('xgram_pass');
    if (savedUser && savedPass) {
        socket.emit('login', { username: savedUser, password: savedPass });
    }
}

// Обработчик подключения socket
socket.on('connect', () => {
    console.log('Socket подключён');
    autoLogin();
});

socket.on('connect_error', (err) => {
    console.error('Ошибка подключения:', err);
    showToast('Ошибка подключения к серверу', 'error');
});

socket.on('disconnect', () => {
    console.log('Socket отключён');
    showToast('Соединение потеряно', 'error');
});

// ===== ГЛОБАЛЬНЫЕ СООБЩЕНИЯ =====
socket.on('global_message', ({ text, fromName, timestamp }) => {
    const notif = document.createElement('div');
    notif.className = 'global-notification';
    notif.innerHTML = `
        <div class="global-content">
            <i class="fas fa-bullhorn"></i>
            <div>
                <strong>📢 ${fromName}</strong>
                <p>${text}</p>
            </div>
        </div>
        <button onclick="this.parentElement.remove()">✕</button>
    `;
    document.body.appendChild(notif);
    
    setTimeout(() => notif.remove(), 10000);
});

// ===== АДМИН: ДОБАВИТЬ NFT В МАГАЗИН =====
let nftImageData = null;
let giftImageData = null;

function openAddShopNft() {
    nftImageData = null;
    document.getElementById('shop-nft-preview').style.display = 'none';
    document.getElementById('shop-nft-image').value = '';
    openModal('add-shop-nft-modal');
}

function previewNftImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showToast('Файл слишком большой (макс 2MB)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        nftImageData = e.target.result;
        const preview = document.getElementById('shop-nft-preview');
        preview.src = nftImageData;
        preview.style.display = 'block';
        document.getElementById('shop-nft-image').value = '';
    };
    reader.readAsDataURL(file);
}

function addShopNft() {
    const name = document.getElementById('shop-nft-name').value.trim();
    const imageText = document.getElementById('shop-nft-image').value.trim();
    const image = nftImageData || imageText || '🎨';
    const price = parseInt(document.getElementById('shop-nft-price').value) || 100;
    const quantity = parseInt(document.getElementById('shop-nft-quantity').value) || -1;
    const rarity = document.getElementById('shop-nft-rarity').value;
    const upgradeable = document.getElementById('shop-nft-upgradeable').checked;
    const premiumOnly = document.getElementById('shop-nft-premium').checked;
    
    if (!name) {
        showToast('Введите название', 'error');
        return;
    }
    
    socket.emit('admin_add_shop_nft', { name, image, price, quantity, rarity, upgradeable, premiumOnly });
    closeModal('add-shop-nft-modal');
    nftImageData = null;
    
    // Очистить форму
    document.getElementById('shop-nft-name').value = '';
    document.getElementById('shop-nft-image').value = '';
    document.getElementById('shop-nft-price').value = '100';
    document.getElementById('shop-nft-preview').style.display = 'none';
}

// ===== АДМИН: ДОБАВИТЬ ПОДАРОК В МАГАЗИН =====
function openAddShopGift() {
    giftImageData = null;
    document.getElementById('shop-gift-preview').style.display = 'none';
    openModal('add-shop-gift-modal');
}

function previewGiftImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
        showToast('Файл слишком большой (макс 1MB)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        giftImageData = e.target.result;
        const preview = document.getElementById('shop-gift-preview');
        preview.src = giftImageData;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function addShopGift() {
    const name = document.getElementById('shop-gift-name').value.trim();
    const emoji = document.getElementById('shop-gift-emoji').value.trim() || '🎁';
    const price = parseInt(document.getElementById('shop-gift-price').value) || 50;
    const rarity = document.getElementById('shop-gift-rarity').value || 'common';
    
    if (!name) {
        showToast('Введите название', 'error');
        return;
    }
    
    socket.emit('admin_add_shop_gift', { name, emoji, price, image: giftImageData, rarity });
    closeModal('add-shop-gift-modal');
    giftImageData = null;
    
    document.getElementById('shop-gift-name').value = '';
    document.getElementById('shop-gift-emoji').value = '';
    document.getElementById('shop-gift-price').value = '50';
    document.getElementById('shop-gift-rarity').value = 'common';
    document.getElementById('shop-gift-preview').style.display = 'none';
}

socket.on('shop_gift_added', (gift) => {
    showToast(`Подарок "${gift.name}" добавлен в магазин!`, 'success');
    socket.emit('get_shop');
});

// ===== АДМИН: ИЗМЕНИТЬ ЦЕНЫ =====
function openEditPrices() {
    socket.emit('get_shop');
    setTimeout(() => {
        const container = document.getElementById('edit-prices-list');
        let html = '<h4>Подарки:</h4>';
        shopData.gifts.forEach(g => {
            html += `<div class="price-edit-item">
                <span>${g.emoji} ${g.name}</span>
                <input type="number" value="${g.price}" id="price-gift-${g.id}" min="1">
                <button onclick="saveGiftPrice('${g.id}')" title="Сохранить">💾</button>
                <button onclick="deleteShopGift('${g.id}')" class="delete-shop-btn" title="Удалить">🗑️</button>
            </div>`;
        });
        html += '<h4>NFT:</h4>';
        shopData.nfts.forEach(n => {
            html += `<div class="price-edit-item">
                <span>${n.image} ${n.name}</span>
                <input type="number" value="${n.price}" id="price-nft-${n.id}" min="1">
                <button onclick="saveNftPrice('${n.id}')" title="Сохранить">💾</button>
                <button onclick="deleteShopNft('${n.id}')" class="delete-shop-btn" title="Удалить">🗑️</button>
            </div>`;
        });
        container.innerHTML = html;
        openModal('edit-prices-modal');
    }, 300);
}

function saveGiftPrice(giftId) {
    const newPrice = parseInt(document.getElementById('price-gift-' + giftId).value);
    socket.emit('admin_edit_gift_price', { giftId, newPrice });
}

function saveNftPrice(nftId) {
    const newPrice = parseInt(document.getElementById('price-nft-' + nftId).value);
    socket.emit('admin_edit_nft_price', { nftId, newPrice });
}

// Удаление из магазина
function deleteShopGift(giftId) {
    if (confirm('Удалить этот подарок из магазина?')) {
        socket.emit('admin_delete_shop_gift', giftId);
    }
}

function deleteShopNft(nftId) {
    if (confirm('Удалить этот NFT из магазина?')) {
        socket.emit('admin_delete_shop_nft', nftId);
    }
}

socket.on('shop_item_deleted', () => {
    showToast('Удалено из магазина', 'success');
    openEditPrices(); // Обновить список
});

// ===== АДМИН: ГЛОБАЛЬНОЕ СООБЩЕНИЕ =====
function sendGlobalMessage() {
    const text = document.getElementById('global-message-text').value.trim();
    if (!text) {
        showToast('Введите сообщение', 'error');
        return;
    }
    socket.emit('admin_global_message', { text });
    document.getElementById('global-message-text').value = '';
}

// ===== ОТПРАВКА NFT =====
function openNftPicker() {
    if (!activeChat) {
        showToast('Сначала откройте чат', 'error');
        return;
    }
    
    const container = document.getElementById('nft-picker-list');
    
    if (myNfts.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted)">У вас нет NFT</p>';
    } else {
        container.innerHTML = myNfts.map((n, index) => `
            <div class="nft-picker-item" onclick="sendNftToChat(${index})">
                ${n.image?.startsWith('data:') ? `<img src="${n.image}">` : `<span class="emoji">${n.image}</span>`}
                <span class="name">${n.name}</span>
            </div>
        `).join('');
    }
    
    openModal('nft-picker-modal');
}

function sendNftToChat(index) {
    if (!activeChat) return;
    socket.emit('send_nft', { to: activeChat.username, nftIndex: index });
    closeModal('nft-picker-modal');
}

socket.on('nft_sent_success', ({ nfts }) => {
    myNfts = nfts;
    showToast('NFT отправлен!', 'success');
    renderMyItems();
});

// ===== УЛУЧШЕНИЕ ПОДАРКА (ФОН) =====
function upgradeGiftBg(index) {
    socket.emit('upgrade_gift', index);
}

socket.on('gift_upgraded', ({ gift, newBalance, gifts, newBackground }) => {
    myCoins = newBalance;
    myGifts = gifts;
    document.getElementById('my-coins').textContent = myCoins;
    document.getElementById('shop-coins').textContent = myCoins;
    
    // Обновляем рендер с задержкой
    setTimeout(() => {
        renderMyItems();
        
        const bgNames = {
            'common': 'Обычный',
            'uncommon': 'Необычный',
            'rare': 'Редкий',
            'epic': 'Эпический',
            'legendary': '🌟 ЛЕГЕНДАРНЫЙ!'
        };
        showToast(`Фон улучшен до: ${bgNames[newBackground]}!`, 'success');
    }, 100);
});

socket.on('upgrade_failed', ({ message }) => {
    showToast(message, 'error');
});

// ===== РАСШИРЕННЫЙ ПРОФИЛЬ =====
socket.on('full_profile', (profile) => {
    viewingProfile = profile;
    
    document.getElementById('profile-avatar').src = profile.avatar || getDefaultAvatar(profile.displayName);
    document.getElementById('profile-name').innerHTML = profile.displayName + (profile.isAdmin ? ' 👑' : '');
    document.getElementById('profile-username').textContent = '@' + profile.username;
    document.getElementById('profile-status-text').textContent = profile.status || '';
    document.getElementById('profile-friends').textContent = profile.friendsCount;
    document.getElementById('profile-gifts-count').textContent = profile.gifts?.length || 0;
    document.getElementById('profile-nfts-count').textContent = profile.nfts?.length || 0;
    
    // Telegram
    const tgDiv = document.getElementById('profile-telegram');
    if (profile.telegram) {
        tgDiv.style.display = 'block';
        const tgLink = document.getElementById('profile-tg-link');
        tgLink.textContent = profile.telegram;
        tgLink.href = 'https://t.me/' + profile.telegram.replace('@', '');
    } else {
        tgDiv.style.display = 'none';
    }
    
    // Подарки
    const giftsGrid = document.getElementById('profile-gifts-list');
    if (profile.gifts && profile.gifts.length > 0) {
        giftsGrid.innerHTML = profile.gifts.slice(-12).map(g => {
            const bgClass = g.background ? `bg-${g.background}` : '';
            return `<div class="gift-item ${bgClass}">${g.emoji}</div>`;
        }).join('');
    } else {
        giftsGrid.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет подарков</span>';
    }
    
    // NFT
    const nftsGrid = document.getElementById('profile-nfts-list');
    if (nftsGrid) {
        if (profile.nfts && profile.nfts.length > 0) {
            nftsGrid.innerHTML = profile.nfts.slice(-6).map(n => `
                <div class="nft-item">
                    ${n.image?.startsWith('data:') ? `<img src="${n.image}">` : n.image}
                </div>
            `).join('');
        } else {
            nftsGrid.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет NFT</span>';
        }
    }
    
    // Кнопка добавления
    const addBtn = document.getElementById('profile-add-btn');
    if (profile.isFriend) {
        addBtn.style.display = 'none';
    } else {
        addBtn.style.display = 'flex';
    }
    
    openModal('user-profile-modal');
});

// Переопределяем openUserProfile для полного профиля
openUserProfile = function() {
    if (!activeChat) return;
    socket.emit('get_full_profile', activeChat.username);
};

// ===== ГРУППЫ И КАНАЛЫ =====
let currentGroup = null;
let currentChannel = null;

function openGroupChat(groupId) {
    socket.emit('get_group', groupId);
}

socket.on('group_data', (group) => {
    currentGroup = group;
    activeChat = null;
    
    document.getElementById('chat-name').textContent = '👥 ' + group.name;
    document.getElementById('chat-status').textContent = `${group.members.length} участников`;
    document.getElementById('chat-avatar').src = group.avatar || getDefaultAvatar(group.name);
    
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.add('open');
    document.getElementById('chat-area').classList.add('open');
    
    renderGroupMessages(group.messages);
});

function renderGroupMessages(messages) {
    const container = document.getElementById('messages');
    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.from === currentUser.username ? 'sent' : 'received'}">
            ${msg.from !== currentUser.username ? `<div class="msg-author">${msg.fromName}</div>` : ''}
            <p>${escapeHtml(msg.text)}</p>
            <span class="message-time">${formatTime(msg.timestamp)}</span>
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
}

socket.on('group_message', ({ groupId, message }) => {
    if (currentGroup?.id === groupId) {
        currentGroup.messages.push(message);
        renderGroupMessages(currentGroup.messages);
    }
});

function openChannelView(channelId) {
    socket.emit('get_channel', channelId);
}

socket.on('channel_data', (channel) => {
    currentChannel = channel;
    activeChat = null;
    currentGroup = null;
    
    document.getElementById('chat-name').textContent = '📢 ' + channel.name;
    document.getElementById('chat-status').textContent = `${channel.subscribers.length} подписчиков`;
    document.getElementById('chat-avatar').src = channel.avatar || getDefaultAvatar(channel.name);
    
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.add('open');
    document.getElementById('chat-area').classList.add('open');
    
    renderChannelPosts(channel.posts);
});

function renderChannelPosts(posts) {
    const container = document.getElementById('messages');
    container.innerHTML = posts.map(post => `
        <div class="channel-post">
            <p>${escapeHtml(post.text)}</p>
            ${post.media ? `<img src="${post.media}" style="max-width:100%;border-radius:8px">` : ''}
            <span class="message-time">${formatTime(post.timestamp)}</span>
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
}

// sendMessage переопределён ниже для групп/каналов

// Добавить участника в группу
function openAddMember() {
    if (!currentGroup) return;
    openModal('add-member-modal');
}

function addMemberToGroup() {
    const username = document.getElementById('add-member-username').value.trim();
    if (!username) {
        showToast('Введите логин', 'error');
        return;
    }
    socket.emit('add_to_group', { groupId: currentGroup?.id || activeGroup?.id, username });
    closeModal('add-member-modal');
    document.getElementById('add-member-username').value = '';
}

socket.on('member_added', ({ groupId, username }) => {
    showToast(`${username} добавлен в группу`, 'success');
});

socket.on('added_to_group', (group) => {
    showToast(`Вас добавили в группу "${group.name}"`, 'info');
});

socket.on('added_to_channel', (channel) => {
    showToast(`Вас добавили в канал "${channel.name}"`, 'info');
});

// ===== ОБНОВЛЕНИЕ МАГАЗИНА =====
socket.on('shop_updated', (shop) => {
    shopData = shop;
    renderShopGifts();
    renderShopNFTs();
});

// renderMyItems определена ниже

// ===== РЫНОК С КАРТИНКАМИ (ТОЛЬКО ФОТО) =====
renderMarketBuy = function() {
    const container = document.getElementById('market-buy');
    if (marketData.length === 0) {
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted)">Рынок пуст</p>';
        return;
    }
    
    container.innerHTML = marketData.map(listing => {
        const item = listing.item;
        const rarity = item.rarity || item.background || 'common';
        let imageHtml;
        
        // Показываем только изображение
        if (item.image?.startsWith('data:') || item.image?.startsWith('http')) {
            imageHtml = `<img src="${item.image}" class="market-item-image" alt="${item.name}">`;
        } else if (item.emoji) {
            imageHtml = `<div class="market-item-emoji-large">${item.emoji}</div>`;
        } else {
            imageHtml = `<div class="market-item-emoji-large">${item.image || '🎁'}</div>`;
        }
        
        return `
            <div class="market-item rarity-card-${rarity}">
                ${imageHtml}
                <div class="market-item-price">${listing.price} 🐱</div>
                <button onclick="buyFromMarket('${listing.id}')">Купить</button>
            </div>
        `;
    }).join('');
};

// ===== ЗВОНКИ - ОШИБКА =====
socket.on('call_error', (msg) => {
    showToast(msg, 'error');
    closeCallScreen();
});



// ===== УДАЛЕНИЕ ПОДАРКОВ И NFT =====
function deleteGift(index) {
    if (confirm('Удалить этот подарок навсегда?')) {
        socket.emit('delete_gift', index);
    }
}

function deleteNft(index) {
    if (confirm('Удалить этот NFT навсегда?')) {
        socket.emit('delete_nft', index);
    }
}

socket.on('gift_deleted', ({ gifts }) => {
    myGifts = gifts;
    renderMyItems();
    showToast('Подарок удалён', 'success');
});

socket.on('nft_deleted', ({ nfts }) => {
    myNfts = nfts;
    renderMyItems();
    showToast('NFT удалён', 'success');
});

// ===== УЛУЧШЕНИЕ NFT (ПО РЕДКОСТЯМ) =====
socket.on('nft_upgraded', ({ nft, newBalance, nfts, newRarity }) => {
    myCoins = newBalance;
    myNfts = nfts;
    document.getElementById('my-coins').textContent = myCoins;
    document.getElementById('shop-coins').textContent = myCoins;
    
    setTimeout(() => {
        renderMyItems();
        
        const rarityNames = {
            'common': 'Обычный',
            'uncommon': 'Необычный',
            'rare': 'Редкий',
            'epic': 'Эпический',
            'legendary': 'Легендарный',
            'mythic': '🔮 Мифический',
            'neon': '💫 Неоновый',
            'rainbow': '🌈 РАДУЖНЫЙ!'
        };
        showToast(`Редкость улучшена до: ${rarityNames[newRarity || nft.rarity]}!`, 'success');
    }, 100);
});

// ===== ОБНОВЛЁННЫЙ renderMyItems С УДАЛЕНИЕМ И АНИМАЦИЯМИ =====
// Удалено - используется версия ниже с чекбоксами

// ===== ГОЛОСОВЫЕ СООБЩЕНИЯ =====
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function startVoiceRecord() {
    if (isRecording) {
        stopVoiceRecord();
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => {
                audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = () => {
                    if (activeChat) {
                        socket.emit('send_message', {
                            to: activeChat.username,
                            text: '🎤 Голосовое сообщение',
                            type: 'voice',
                            media: reader.result
                        });
                    }
                };
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            isRecording = true;
            document.getElementById('voice-btn').classList.add('recording');
            showToast('Запись... Нажмите ещё раз чтобы отправить', 'info');
        })
        .catch(err => {
            showToast('Нет доступа к микрофону', 'error');
        });
}

function stopVoiceRecord() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('voice-btn').classList.remove('recording');
    }
}

// ===== ОБНОВЛЁННЫЙ ПРОФИЛЬ С TOOLTIP И РЕДКОСТЯМИ =====
socket.on('full_profile', (profile) => {
    viewingProfile = profile;
    
    document.getElementById('profile-avatar').src = profile.avatar || getDefaultAvatar(profile.displayName);
    document.getElementById('profile-name').innerHTML = profile.displayName + (profile.isAdmin ? ' 👑' : '');
    document.getElementById('profile-username').textContent = '@' + profile.username;
    document.getElementById('profile-status-text').textContent = profile.status || '';
    document.getElementById('profile-friends').textContent = profile.friendsCount;
    document.getElementById('profile-gifts-count').textContent = profile.gifts?.length || 0;
    document.getElementById('profile-nfts-count').textContent = profile.nfts?.length || 0;
    
    // Применить редкость к аватару профиля
    const avatarWrapper = document.getElementById('profile-avatar-wrapper');
    if (avatarWrapper) {
        avatarWrapper.className = 'profile-avatar-wrapper';
        const userRarity = getProfileHighestRarity(profile);
        if (userRarity) {
            avatarWrapper.classList.add('rarity-' + userRarity);
        }
    }
    
    // Telegram
    const tgDiv = document.getElementById('profile-telegram');
    if (profile.telegram) {
        tgDiv.style.display = 'block';
        const tgLink = document.getElementById('profile-tg-link');
        tgLink.textContent = profile.telegram;
        tgLink.href = 'https://t.me/' + profile.telegram.replace('@', '');
    } else {
        tgDiv.style.display = 'none';
    }
    
    // Подарки с редкостями
    const giftsGrid = document.getElementById('profile-gifts-list');
    if (profile.gifts && profile.gifts.length > 0) {
        giftsGrid.innerHTML = profile.gifts.slice(-12).map(g => {
            const rarity = g.rarity || g.background || 'common';
            return `<div class="gift-item rarity-item-${rarity}" title="${g.name}\nРедкость: ${rarity}\nКод: ${g.code || 'N/A'}">${g.emoji}</div>`;
        }).join('');
    } else {
        giftsGrid.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет подарков</span>';
    }
    
    // NFT с редкостями
    const nftsGrid = document.getElementById('profile-nfts-list');
    if (nftsGrid) {
        if (profile.nfts && profile.nfts.length > 0) {
            nftsGrid.innerHTML = profile.nfts.slice(-6).map(n => {
                const rarity = n.rarity || 'common';
                return `
                <div class="nft-item rarity-item-${rarity}" title="${n.name}\nРедкость: ${rarity}\nКод: ${n.code || 'N/A'}">
                    ${n.image?.startsWith('data:') ? `<img src="${n.image}">` : n.image}
                </div>
            `}).join('');
        } else {
            nftsGrid.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет NFT</span>';
        }
    }
    
    // Кнопка добавления
    const addBtn = document.getElementById('profile-add-btn');
    if (profile.isFriend) {
        addBtn.style.display = 'none';
    } else {
        addBtn.style.display = 'flex';
    }
    
    openModal('user-profile-modal');
});

// Получить наивысшую редкость профиля
function getProfileHighestRarity(profile) {
    const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'neon', 'rainbow'];
    let highestRarity = null;
    let highestIndex = -1;
    
    if (profile.nfts && profile.nfts.length > 0) {
        profile.nfts.forEach(nft => {
            const idx = rarityOrder.indexOf(nft.rarity);
            if (idx > highestIndex) {
                highestIndex = idx;
                highestRarity = nft.rarity;
            }
        });
    }
    
    if (profile.gifts && profile.gifts.length > 0) {
        profile.gifts.forEach(gift => {
            const idx = rarityOrder.indexOf(gift.rarity || gift.background);
            if (idx > highestIndex) {
                highestIndex = idx;
                highestRarity = gift.rarity || gift.background;
            }
        });
    }
    
    return highestRarity;
}

// ===== ВЫДЕЛЕННЫЕ ПРЕДМЕТЫ =====
let selectedGifts = new Set();
let selectedNfts = new Set();

// ===== ОБНОВЛЁННЫЙ renderMyItems С КОДАМИ, РЕДКОСТЯМИ, ВЫДЕЛЕНИЕМ =====
renderMyItems = function() {
    const giftsContainer = document.getElementById('my-gifts-list');
    const nftsContainer = document.getElementById('my-nfts-list');
    
    if (!giftsContainer || !nftsContainer) return;
    
    // Кнопки массовых действий
    let massActionsHtml = '';
    if (selectedGifts.size > 0 || selectedNfts.size > 0) {
        const totalSelected = selectedGifts.size + selectedNfts.size;
        massActionsHtml = `
            <div class="mass-actions">
                <span>Выбрано: ${totalSelected}</span>
                <button class="btn-mass-sell" onclick="sellSelected()">💰 Продать всё</button>
                <button class="btn-mass-delete" onclick="deleteSelected()">🗑️ Удалить всё</button>
                <button class="btn-mass-clear" onclick="clearSelection()">✖ Снять</button>
            </div>
        `;
    }
    
    if (myGifts.length === 0) {
        giftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет подарков</span>';
    } else {
        giftsContainer.innerHTML = massActionsHtml + myGifts.map((g, i) => {
            const bgClass = g.background ? `bg-${g.background}` : '';
            const rarityClass = g.rarity ? `rarity-card-${g.rarity}` : '';
            const canUpgrade = !g.background || g.background !== 'legendary';
            const bgIndex = ['common', 'uncommon', 'rare', 'epic'].indexOf(g.background || 'common');
            const upgradeCost = (bgIndex + 1) * 50;
            const sellPrice = g.sellPrice || Math.floor((g.price || 50) / 2);
            const commission = Math.floor(sellPrice * 0.1);
            const code = g.code || generateItemCode();
            const isSelected = selectedGifts.has(i);
            
            return `
                <div class="my-item gift-item-animated ${bgClass} ${rarityClass} ${isSelected ? 'selected' : ''}" 
                     style="animation-delay: ${i * 0.05}s"
                     data-tooltip="${g.name}&#10;Код: #${code}&#10;Цена продажи: ${sellPrice} 🐱&#10;Комиссия: ${commission} 🐱&#10;Получите: ${sellPrice - commission} 🐱">
                    <input type="checkbox" class="item-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleGiftSelect(${i}, event)">
                    <span class="item-emoji">${g.emoji}</span>
                    <span class="item-name">${g.name}</span>
                    <span class="item-code">#${code}</span>
                    ${g.rarity ? `<span class="gift-rarity ${g.rarity}">${g.rarity}</span>` : ''}
                    ${g.background ? `<span class="bg-badge bg-badge-${g.background}">${g.background}</span>` : ''}
                    <div class="item-actions">
                        ${canUpgrade ? `<button class="action-btn upgrade-btn" onclick="upgradeGiftBg(${i})" title="Улучшить фон">🎨 ${upgradeCost}</button>` : ''}
                        <button class="action-btn sell-btn" onclick="sellGift(${i})" title="Продать">💰 ${sellPrice}</button>
                        <button class="action-btn delete-btn" onclick="deleteGift(${i})" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    if (myNfts.length === 0) {
        nftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет NFT</span>';
    } else {
        // Редкости: common → uncommon → rare → epic → legendary → mythic → neon → rainbow
        const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'neon', 'rainbow'];
        
        nftsContainer.innerHTML = myNfts.map((n, i) => {
            const currentRarity = n.rarity || 'common';
            const rarityIndex = rarities.indexOf(currentRarity);
            const canUpgrade = rarityIndex < rarities.length - 1;
            const upgradeCost = (rarityIndex + 1) * 100;
            const sellPrice = n.sellPrice || Math.floor((n.price || 100) / 2);
            const commission = Math.floor(sellPrice * 0.1);
            const code = n.code || generateItemCode();
            const isSelected = selectedNfts.has(i);
            
            return `
                <div class="my-item nft-item-animated rarity-card-${currentRarity} ${isSelected ? 'selected' : ''}" 
                     style="animation-delay: ${i * 0.05}s"
                     data-tooltip="${n.name}&#10;Редкость: ${currentRarity}&#10;Код: #${code}&#10;Цена продажи: ${sellPrice} 🐱&#10;Комиссия: ${commission} 🐱">
                    <input type="checkbox" class="item-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleNftSelect(${i}, event)">
                    <div class="nft-image-wrapper">
                        ${n.image?.startsWith('data:') ? `<img src="${n.image}" class="nft-thumb">` : `<span class="nft-emoji">${n.image}</span>`}
                    </div>
                    <span class="item-name">${n.name}</span>
                    <span class="nft-rarity ${currentRarity}">${currentRarity}</span>
                    <span class="item-code">#${code}</span>
                    <div class="item-actions">
                        ${canUpgrade ? `<button class="action-btn upgrade-btn" onclick="upgradeNft(${i})" title="Улучшить редкость">⬆️ ${upgradeCost}</button>` : '<span class="max-badge">MAX</span>'}
                        <button class="action-btn sell-btn" onclick="sellNft(${i})" title="Продать">💰 ${sellPrice}</button>
                        <button class="action-btn delete-btn" onclick="deleteNft(${i})" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }
};

// Генерация кода если нет
function generateItemCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Выделение подарков
function toggleGiftSelect(index, event) {
    event.stopPropagation();
    if (selectedGifts.has(index)) {
        selectedGifts.delete(index);
    } else {
        selectedGifts.add(index);
    }
    renderMyItems();
}

function toggleNftSelect(index, event) {
    event.stopPropagation();
    if (selectedNfts.has(index)) {
        selectedNfts.delete(index);
    } else {
        selectedNfts.add(index);
    }
    renderMyItems();
}

function clearSelection() {
    selectedGifts.clear();
    selectedNfts.clear();
    renderMyItems();
}

// Массовая продажа
function sellSelected() {
    if (selectedGifts.size === 0 && selectedNfts.size === 0) return;
    
    const giftIndexes = Array.from(selectedGifts).sort((a, b) => b - a);
    const nftIndexes = Array.from(selectedNfts).sort((a, b) => b - a);
    
    socket.emit('sell_multiple', { gifts: giftIndexes, nfts: nftIndexes });
    selectedGifts.clear();
    selectedNfts.clear();
}

// Массовое удаление
function deleteSelected() {
    if (selectedGifts.size === 0 && selectedNfts.size === 0) return;
    
    if (!confirm(`Удалить ${selectedGifts.size + selectedNfts.size} предметов?`)) return;
    
    const giftIndexes = Array.from(selectedGifts).sort((a, b) => b - a);
    const nftIndexes = Array.from(selectedNfts).sort((a, b) => b - a);
    
    socket.emit('delete_multiple', { gifts: giftIndexes, nfts: nftIndexes });
    selectedGifts.clear();
    selectedNfts.clear();
}

socket.on('multiple_sold', ({ newBalance, gifts, nfts, totalEarned }) => {
    myCoins = newBalance;
    myGifts = gifts;
    myNfts = nfts;
    document.getElementById('my-coins').textContent = myCoins;
    renderMyItems();
    showToast(`Продано! Получено ${totalEarned} 🐱`, 'success');
});

socket.on('multiple_deleted', ({ gifts, nfts }) => {
    myGifts = gifts;
    myNfts = nfts;
    renderMyItems();
    showToast('Предметы удалены', 'success');
});

// ===== УДАЛЕНИЕ АККАУНТА =====
function openDeleteAccount() {
    closeModal('settings-modal');
    document.getElementById('delete-account-password').value = '';
    openModal('delete-account-modal');
}

function confirmDeleteAccount() {
    const password = document.getElementById('delete-account-password').value;
    if (!password) {
        showToast('Введите пароль', 'error');
        return;
    }
    
    if (!confirm('Вы уверены? Это действие НЕЛЬЗЯ отменить!')) return;
    
    socket.emit('delete_account', { password });
}

socket.on('delete_account_error', (msg) => {
    showToast(msg, 'error');
});

socket.on('account_deleted', () => {
    localStorage.removeItem('xgram_user');
    localStorage.removeItem('xgram_pass');
    showToast('Аккаунт удалён', 'success');
    setTimeout(() => location.reload(), 1500);
});

// ===== СКРИМЕР =====
let screamerImageData = null;
let screamerSoundData = null;
let screamerTarget = null;

function openScreamer(username) {
    screamerTarget = username;
    screamerImageData = null;
    screamerSoundData = null;
    document.getElementById('screamer-image-preview').style.display = 'none';
    document.getElementById('screamer-audio-preview').style.display = 'none';
    openModal('screamer-modal');
}

function previewScreamerImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showToast('Картинка слишком большая (макс 2MB)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        screamerImageData = e.target.result;
        const preview = document.getElementById('screamer-image-preview');
        preview.src = screamerImageData;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function previewScreamerSound(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
        showToast('Звук слишком большой (макс 3MB)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        screamerSoundData = e.target.result;
        const preview = document.getElementById('screamer-audio-preview');
        preview.src = screamerSoundData;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function sendScreamer() {
    if (!screamerTarget) {
        showToast('Выберите получателя', 'error');
        return;
    }
    if (!screamerImageData) {
        showToast('Выберите картинку', 'error');
        return;
    }
    
    socket.emit('send_screamer', {
        to: screamerTarget,
        image: screamerImageData,
        sound: screamerSoundData
    });
    
    closeModal('screamer-modal');
    screamerImageData = null;
    screamerSoundData = null;
}

socket.on('screamer_sent', () => {
    showToast('Скример отправлен! 👻', 'success');
});

socket.on('screamer', ({ from, fromName, image, sound }) => {
    const overlay = document.getElementById('screamer-overlay');
    const img = document.getElementById('screamer-display-image');
    const audio = document.getElementById('screamer-display-audio');
    
    img.src = image || '';
    if (sound) {
        audio.src = sound;
        audio.play().catch(() => {});
    }
    
    overlay.classList.add('active');
    
    // Автозакрытие через 3 секунды
    setTimeout(() => {
        closeScreamer();
    }, 3000);
});

function closeScreamer() {
    const overlay = document.getElementById('screamer-overlay');
    const audio = document.getElementById('screamer-display-audio');
    overlay.classList.remove('active');
    audio.pause();
    audio.currentTime = 0;
}

// Добавить кнопку скримера в профиль друга
const originalFullProfile = socket._callbacks['$full_profile'];
socket.on('full_profile', (profile) => {
    // Добавляем кнопку скримера
    setTimeout(() => {
        const profileBody = document.querySelector('#user-profile-modal .profile-body');
        if (profileBody && !document.getElementById('screamer-btn')) {
            const btn = document.createElement('button');
            btn.id = 'screamer-btn';
            btn.className = 'btn-secondary screamer-btn';
            btn.innerHTML = '<i class="fas fa-ghost"></i> Скример';
            btn.onclick = () => {
                closeModal('user-profile-modal');
                openScreamer(profile.username);
            };
            profileBody.appendChild(btn);
        }
    }, 100);
});


// ===== МОИ ГРУППЫ И КАНАЛЫ =====
let myGroups = [];
let myChannels = [];

function loadMyCommunities() {
    socket.emit('get_my_communities');
}

socket.on('my_communities', ({ groups, channels }) => {
    myGroups = groups || [];
    myChannels = channels || [];
    renderMyCommunities();
});

function renderMyCommunities() {
    const groupsList = document.getElementById('my-groups-list');
    const channelsList = document.getElementById('my-channels-list');
    
    if (!groupsList || !channelsList) return;
    
    // Объединяем группы и каналы в один список
    let allCommunities = '';
    
    myGroups.forEach(g => {
        allCommunities += `
            <div class="chat-item community-item" onclick="openGroupChat('${g.id}')">
                <div class="avatar-wrapper">
                    <div class="community-icon group-icon">👥</div>
                </div>
                <div class="chat-item-info">
                    <span class="chat-item-name">${g.name}</span>
                    <span class="chat-item-preview">${g.membersCount} участников</span>
                </div>
            </div>
        `;
    });
    
    myChannels.forEach(c => {
        allCommunities += `
            <div class="chat-item community-item" onclick="openChannelChat('${c.id}')">
                <div class="avatar-wrapper">
                    <div class="community-icon channel-icon">📢</div>
                </div>
                <div class="chat-item-info">
                    <span class="chat-item-name">${c.name}</span>
                    <span class="chat-item-preview">${c.subscribersCount} подписчиков</span>
                </div>
            </div>
        `;
    });
    
    groupsList.innerHTML = allCommunities;
    channelsList.innerHTML = '';
}

// ===== ЧАТ ГРУППЫ =====
let activeGroup = null;
let activeChannel = null;
let groupMessages = {};
let channelMessages = {};

function openGroupChat(groupId) {
    const group = myGroups.find(g => g.id === groupId);
    if (!group) return;
    
    activeGroup = group;
    activeChannel = null;
    activeChat = null;
    
    document.getElementById('chat-name').textContent = '👥 ' + group.name;
    document.getElementById('chat-status').textContent = group.membersCount + ' участников';
    document.getElementById('chat-avatar').src = getDefaultAvatar(group.name);
    
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.add('open');
    document.getElementById('chat-area').classList.add('open');
    
    // Показываем поле ввода (все могут писать в группе)
    document.querySelector('.chat-input').style.display = 'flex';
    
    socket.emit('get_group_messages', groupId);
}

function openChannelChat(channelId) {
    const channel = myChannels.find(c => c.id === channelId);
    if (!channel) return;
    
    activeChannel = channel;
    activeGroup = null;
    activeChat = null;
    
    document.getElementById('chat-name').textContent = '📢 ' + channel.name;
    document.getElementById('chat-status').textContent = channel.subscribersCount + ' подписчиков';
    document.getElementById('chat-avatar').src = getDefaultAvatar(channel.name);
    
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.add('open');
    document.getElementById('chat-area').classList.add('open');
    
    // Проверяем, является ли пользователь владельцем
    const isOwner = channel.owner === currentUser?.username;
    document.querySelector('.chat-input').style.display = isOwner ? 'flex' : 'none';
    
    socket.emit('get_channel_messages', channelId);
}

socket.on('group_messages', ({ groupId, messages }) => {
    groupMessages[groupId] = messages || [];
    if (activeGroup?.id === groupId) {
        renderCommunityMessages(messages, 'group');
    }
});

socket.on('channel_messages', ({ channelId, messages }) => {
    channelMessages[channelId] = messages || [];
    if (activeChannel?.id === channelId) {
        renderCommunityMessages(messages, 'channel');
    }
});

function renderCommunityMessages(messages, type) {
    const container = document.getElementById('messages');
    
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="empty-messages">Нет сообщений</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isMine = msg.from === currentUser?.username;
        return `
            <div class="message ${isMine ? 'sent' : 'received'}">
                ${!isMine ? `<span class="msg-author">${msg.fromName || msg.from}</span>` : ''}
                <p>${escapeHtml(msg.text)}</p>
                <span class="message-time">${formatTime(msg.timestamp)}</span>
            </div>
        `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
}

// Переопределяем sendMessage для групп/каналов
const originalSendMessage = sendMessage;
sendMessage = function() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    if (activeGroup) {
        socket.emit('send_group_message', { groupId: activeGroup.id, text });
        input.value = '';
    } else if (activeChannel) {
        socket.emit('send_channel_message', { channelId: activeChannel.id, text });
        input.value = '';
    } else if (activeChat) {
        socket.emit('send_message', { to: activeChat.username, text, type: 'text' });
        input.value = '';
    }
    
    input.style.height = 'auto';
};

socket.on('new_group_message', ({ groupId, message }) => {
    if (!groupMessages[groupId]) groupMessages[groupId] = [];
    groupMessages[groupId].push(message);
    
    if (activeGroup?.id === groupId) {
        renderCommunityMessages(groupMessages[groupId], 'group');
    }
});

socket.on('new_channel_message', ({ channelId, message }) => {
    if (!channelMessages[channelId]) channelMessages[channelId] = [];
    channelMessages[channelId].push(message);
    
    if (activeChannel?.id === channelId) {
        renderCommunityMessages(channelMessages[channelId], 'channel');
    }
});

// Загружаем сообщества при входе
socket.on('login_success', (data) => {
    setTimeout(() => {
        loadMyCommunities();
    }, 500);
});

// Обновляем список при создании
socket.on('group_created', (group) => {
    loadMyCommunities();
});

socket.on('channel_created', (channel) => {
    loadMyCommunities();
});

// ===== ПРЕМИУМ СИСТЕМА =====
let isPremium = false;

function checkPremium() {
    return currentUser?.premium || isPremium;
}

function openPremiumModal() {
    openModal('premium-modal');
}

function buyPremium() {
    socket.emit('buy_premium');
}

socket.on('premium_activated', () => {
    isPremium = true;
    currentUser.premium = true;
    showToast('🌟 Премиум активирован!', 'success');
    closeModal('premium-modal');
    updatePremiumUI();
});

socket.on('premium_removed', () => {
    isPremium = false;
    currentUser.premium = false;
    showToast('Премиум деактивирован', 'info');
    updatePremiumUI();
});

socket.on('premium_error', (msg) => {
    showToast(msg, 'error');
});

socket.on('you_are_deleted', () => {
    showToast('Ваш аккаунт был удалён', 'error');
    localStorage.removeItem('xgram_user');
    localStorage.removeItem('xgram_pass');
    setTimeout(() => location.reload(), 2000);
});

// Скример
socket.on('screamer_received', ({ from, fromName, image, sound }) => {
    const overlay = document.getElementById('screamer-overlay');
    const img = document.getElementById('screamer-display-image');
    const audio = document.getElementById('screamer-display-audio');
    
    if (image) img.src = image;
    if (sound) audio.src = sound;
    
    overlay.classList.add('active');
    if (sound) audio.play();
    
    // Автозакрытие через 3 секунды
    setTimeout(() => {
        closeScreamer();
    }, 3000);
});

function closeScreamer() {
    const overlay = document.getElementById('screamer-overlay');
    const audio = document.getElementById('screamer-display-audio');
    overlay.classList.remove('active');
    audio.pause();
    audio.currentTime = 0;
}

socket.on('screamer_sent', (to) => {
    showToast(`Скример отправлен!`, 'success');
    closeModal('screamer-modal');
});

function updatePremiumUI() {
    const premiumBadge = document.getElementById('premium-badge');
    if (premiumBadge) {
        premiumBadge.style.display = checkPremium() ? 'inline' : 'none';
    }
    
    // Обновляем профиль с эмодзи и шрифтом
    if (checkPremium()) {
        updateMyProfile();
    }
}


// ===== ADMIN ABUSE ФУНКЦИИ =====
function adminAbuseRainbow() {
    if (confirm('Применить Rainbow тему всем пользователям?')) {
        socket.emit('admin_abuse_rainbow');
    }
}

function adminAbuseGlobalCoins() {
    const amount = parseInt(document.getElementById('abuse-coins-amount').value) || 1000;
    if (confirm(`Выдать ${amount} котиков всем пользователям?`)) {
        socket.emit('admin_abuse_global_coins', amount);
    }
}

function adminAbuseGlobalNft() {
    const nftId = document.getElementById('abuse-nft-select').value;
    if (!nftId) {
        showToast('Выберите NFT', 'error');
        return;
    }
    if (confirm('Выдать этот NFT всем пользователям?')) {
        socket.emit('admin_abuse_global_nft', nftId);
    }
}

function adminAbuseGlobalGift() {
    const giftId = document.getElementById('abuse-gift-select').value;
    if (!giftId) {
        showToast('Выберите подарок', 'error');
        return;
    }
    if (confirm('Выдать этот подарок всем пользователям?')) {
        socket.emit('admin_abuse_global_gift', giftId);
    }
}

function adminAbuseGlobalEffect() {
    const effect = prompt('Введите эффект (rainbow, neon, fire, pulse, gold, ice, toxic):');
    if (effect) {
        socket.emit('admin_abuse_global_effect', effect);
    }
}

function adminAbuseScreamer() {
    openModal('screamer-modal');
    document.getElementById('screamer-target').value = '__ALL__';
}

// ===== АДМИН: БЭКАПЫ =====
function adminCreateBackup() {
    socket.emit('admin_create_backup');
}

function adminLoadBackups() {
    socket.emit('admin_get_backups');
    document.getElementById('backups-list').style.display = 'block';
}

socket.on('admin_backups_list', (backups) => {
    const list = document.getElementById('backups-list');
    if (backups.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Нет бэкапов</p>';
        return;
    }
    
    list.innerHTML = backups.map(b => `
        <div class="backup-item">
            <div class="backup-info">
                <div class="backup-name">${b.date}</div>
                <div class="backup-meta">${b.size}</div>
            </div>
            <button class="backup-restore" onclick="adminRestoreBackup('${b.name}')">
                <i class="fas fa-undo"></i> Восстановить
            </button>
        </div>
    `).join('');
});

function adminRestoreBackup(backupName) {
    if (confirm(`Восстановить базу из бэкапа?\n\n${backupName}\n\nТекущие данные будут заменены!`)) {
        socket.emit('admin_restore_backup', backupName);
    }
}

// ===== АДМИН: МУЗЫКА =====
function setMusicPreset(url) {
    document.getElementById('admin-music-url').value = url;
}

function adminPlayMusicAll() {
    const url = document.getElementById('admin-music-url').value.trim();
    if (!url) {
        showToast('Введите URL музыки', 'error');
        return;
    }
    socket.emit('admin_play_music_all', { url });
    showToast('Музыка включена для всех!', 'success');
}

function adminStopMusicAll() {
    socket.emit('admin_stop_music_all');
    showToast('Музыка остановлена для всех', 'success');
}

function adminPlayMusicUser() {
    const username = document.getElementById('admin-music-user').value.trim();
    const url = document.getElementById('admin-music-user-url').value.trim();
    const volume = parseInt(document.getElementById('admin-music-volume').value) || 50;
    const loop = document.getElementById('admin-music-loop').checked;
    
    if (!username || !url) {
        showToast('Заполните логин и URL', 'error');
        return;
    }
    
    socket.emit('admin_play_music_user', { username, url, volume, loop });
    showToast(`Музыка включена для ${username}!`, 'success');
}

function adminStopMusicUser() {
    const username = document.getElementById('admin-music-user').value.trim();
    if (!username) {
        showToast('Введите логин пользователя', 'error');
        return;
    }
    socket.emit('admin_stop_music_user', { username });
    showToast(`Музыка остановлена для ${username}`, 'success');
}

// Обработка музыки от админа (для пользователей)
socket.on('admin_music_play', ({ url, volume, loop }) => {
    const player = document.getElementById('admin-music-player');
    const audio = document.getElementById('admin-audio-player');
    const info = document.getElementById('player-info');
    const volumeSlider = document.getElementById('player-volume');
    
    audio.src = url;
    audio.volume = (volume || 50) / 100;
    audio.loop = loop || false;
    volumeSlider.value = volume || 50;
    
    // Показать название
    const urlParts = url.split('/');
    info.textContent = decodeURIComponent(urlParts[urlParts.length - 1]) || 'Музыка от админа';
    
    player.classList.add('active');
    
    audio.play().catch(e => {
        // Автовоспроизведение заблокировано - показать кнопку
        info.innerHTML = '<button onclick="document.getElementById(\'admin-audio-player\').play()" class="btn-secondary">▶ Нажмите для воспроизведения</button>';
    });
});

socket.on('admin_music_stop', () => {
    const player = document.getElementById('admin-music-player');
    const audio = document.getElementById('admin-audio-player');
    
    audio.pause();
    audio.src = '';
    player.classList.remove('active');
});

function closeAdminMusic() {
    const player = document.getElementById('admin-music-player');
    const audio = document.getElementById('admin-audio-player');
    
    audio.pause();
    player.classList.remove('active');
}

function setPlayerVolume(value) {
    const audio = document.getElementById('admin-audio-player');
    audio.volume = value / 100;
}

// ===== РЕЖИМ ОБСЛУЖИВАНИЯ =====
function toggleMaintenance() {
    const enabled = document.getElementById('maintenance-toggle').checked;
    const message = document.getElementById('maintenance-message').value;
    socket.emit('admin_toggle_maintenance', { enabled, message });
}

socket.on('maintenance_mode', ({ enabled, message }) => {
    if (enabled && !currentUser?.isAdmin) {
        document.getElementById('maintenance-screen').style.display = 'flex';
        document.getElementById('maintenance-text').textContent = message;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'none';
    } else {
        document.getElementById('maintenance-screen').style.display = 'none';
    }
});

socket.on('maintenance_status', ({ enabled, message }) => {
    const toggle = document.getElementById('maintenance-toggle');
    const status = document.getElementById('maintenance-status');
    const msgInput = document.getElementById('maintenance-message');
    
    if (toggle) toggle.checked = enabled;
    if (status) status.textContent = enabled ? 'Включен' : 'Выключен';
    if (msgInput && message) msgInput.value = message;
});

// ===== ГЛОБАЛЬНАЯ ТЕМА =====
function toggleEarthTheme() {
    const enabled = document.getElementById('earth-theme-toggle').checked;
    socket.emit('admin_toggle_earth_theme', enabled);
}

socket.on('global_theme', (theme) => {
    if (theme) {
        document.body.setAttribute('data-theme', theme);
    }
});

// ===== КАСТОМНЫЕ РЕДКОСТИ =====
function addCustomRarity() {
    const name = document.getElementById('custom-rarity-name').value.trim();
    const color = document.getElementById('custom-rarity-color').value;
    const effect = document.getElementById('custom-rarity-effect').value;
    
    if (!name) {
        showToast('Введите название редкости', 'error');
        return;
    }
    
    socket.emit('admin_add_custom_rarity', { name, color, effect });
    document.getElementById('custom-rarity-name').value = '';
}

socket.on('custom_rarities', (rarities) => {
    const list = document.getElementById('custom-rarities-list');
    if (!list) return;
    
    list.innerHTML = rarities.map(r => `
        <div class="custom-rarity-tag" style="background: ${r.color}; color: ${getContrastColor(r.color)}">
            ${r.name}
            <span class="delete-rarity" onclick="deleteCustomRarity('${r.name}')">×</span>
        </div>
    `).join('');
});

function deleteCustomRarity(name) {
    socket.emit('admin_delete_custom_rarity', name);
}

function getContrastColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
}

// ===== АВТОПОВЫШЕНИЕ ЦЕН =====
function togglePriceIncrease() {
    const enabled = document.getElementById('price-increase-toggle').checked;
    const percent = parseInt(document.getElementById('price-increase-percent').value) || 5;
    socket.emit('admin_toggle_price_increase', { enabled, percent });
}

// ===== РАМКИ ПРОФИЛЯ =====
function selectFrame(frame) {
    document.querySelectorAll('.frame-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.frame === frame);
    });
    
    const editor = document.getElementById('custom-frame-editor');
    if (editor) {
        editor.style.display = frame === 'custom' ? 'block' : 'none';
    }
}

// Применить рамку к элементу аватара
function applyFrameToAvatar(element, frame, customColors) {
    if (!element) return;
    
    // Удалить все классы рамок
    element.classList.remove('frame-gold', 'frame-diamond', 'frame-rainbow', 'frame-neon', 'frame-fire', 'frame-custom');
    element.style.removeProperty('--frame-color1');
    element.style.removeProperty('--frame-color2');
    element.style.removeProperty('--frame-width');
    element.style.removeProperty('--frame-style');
    
    if (!frame) return;
    
    if (frame === 'custom' && customColors) {
        element.classList.add('frame-custom');
        element.style.setProperty('--frame-color1', customColors.color1 || '#ff0000');
        element.style.setProperty('--frame-color2', customColors.color2 || '#00ff00');
        element.style.setProperty('--frame-width', (customColors.width || 3) + 'px');
        element.style.setProperty('--frame-style', customColors.style || 'solid');
    } else if (frame) {
        element.classList.add('frame-' + frame);
    }
}

// ===== NFT/ПОДАРОК В НИКЕ =====
function loadNickItems() {
    const select = document.getElementById('settings-nick-item');
    if (!select) return;
    
    select.innerHTML = '<option value="">Не выбрано</option>';
    
    // Добавить NFT
    if (myNfts && myNfts.length > 0) {
        const nftGroup = document.createElement('optgroup');
        nftGroup.label = 'NFT';
        myNfts.forEach((nft, i) => {
            const opt = document.createElement('option');
            opt.value = `nft_${i}`;
            opt.textContent = `${nft.image?.startsWith('data:') ? '🖼' : nft.image} ${nft.name}`;
            nftGroup.appendChild(opt);
        });
        select.appendChild(nftGroup);
    }
    
    // Добавить подарки
    if (myGifts && myGifts.length > 0) {
        const giftGroup = document.createElement('optgroup');
        giftGroup.label = 'Подарки';
        myGifts.forEach((gift, i) => {
            const opt = document.createElement('option');
            opt.value = `gift_${i}`;
            opt.textContent = `${gift.emoji} ${gift.name}`;
            giftGroup.appendChild(opt);
        });
        select.appendChild(giftGroup);
    }
    
    // Установить текущее значение
    if (currentUser.nickItem) {
        select.value = currentUser.nickItem;
    }
}

// ===== ОБНОВЛЕНИЕ АДМИН СЕЛЕКТОВ =====
function updateAbuseSelects() {
    const nftSelect = document.getElementById('abuse-nft-select');
    const giftSelect = document.getElementById('abuse-gift-select');
    
    if (nftSelect && shopData?.nfts) {
        nftSelect.innerHTML = shopData.nfts.map(n => 
            `<option value="${n.id}">${n.image} ${n.name}</option>`
        ).join('');
    }
    
    if (giftSelect && shopData?.gifts) {
        giftSelect.innerHTML = shopData.gifts.map(g => 
            `<option value="${g.id}">${g.emoji} ${g.name}</option>`
        ).join('');
    }
}

// Вызывать при получении данных магазина
socket.on('shop_data', (data) => {
    shopData = data;
    renderShopGifts();
    renderShopNFTs();
    updateAbuseSelects();
});

// ===== ТАЙМЕР NFT/ПОДАРКОВ =====
function formatTimer(ms) {
    if (ms <= 0) return 'Истёк';
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (hours > 0) return `${hours}ч ${mins}м`;
    if (mins > 0) return `${mins}м ${secs}с`;
    return `${secs}с`;
}

// Проверка истёкших предметов
setInterval(() => {
    const now = Date.now();
    
    // Проверить NFT
    if (myNfts) {
        myNfts = myNfts.filter(nft => {
            if (nft.expiresAt && nft.expiresAt < now) {
                showToast(`NFT "${nft.name}" истёк!`, 'info');
                return false;
            }
            return true;
        });
    }
    
    // Проверить подарки
    if (myGifts) {
        myGifts = myGifts.filter(gift => {
            if (gift.expiresAt && gift.expiresAt < now) {
                showToast(`Подарок "${gift.name}" истёк!`, 'info');
                return false;
            }
            return true;
        });
    }
}, 10000);

// ===== МОБИЛЬНАЯ НАВИГАЦИЯ =====
function switchMobileTab(tab) {
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });
    
    switch(tab) {
        case 'chats':
            document.getElementById('sidebar').style.display = 'flex';
            document.getElementById('chat-area').style.display = 'none';
            break;
        case 'chat':
            document.getElementById('sidebar').style.display = 'none';
            document.getElementById('chat-area').style.display = 'flex';
            break;
        case 'shop':
            openShop();
            break;
        case 'profile':
            openSettings();
            break;
    }
}

// ===== РАСКРЫВАЮЩЕЕСЯ МЕНЮ ДЛЯ ПК =====
let expandMenuOpen = false;

function toggleExpandMenu() {
    const menu = document.getElementById('expand-menu');
    const btn = document.getElementById('expand-toggle-btn');
    
    expandMenuOpen = !expandMenuOpen;
    
    if (expandMenuOpen) {
        menu.classList.add('open');
        btn.classList.add('active');
    } else {
        menu.classList.remove('open');
        btn.classList.remove('active');
    }
}

// Закрыть меню при клике вне
document.addEventListener('click', (e) => {
    const container = document.getElementById('expand-menu-container');
    if (container && !container.contains(e.target) && expandMenuOpen) {
        toggleExpandMenu();
    }
});

// ===== РЕАКЦИИ НА СООБЩЕНИЯ =====
const reactionEmojis = ['❤️', '👍', '😂', '😮', '😢', '😡', '🔥', '👏'];

function renderMessages() {
    if (!activeChat) return;
    
    const container = document.getElementById('messages');
    const messages = chatHistory[activeChat.username] || [];
    
    container.innerHTML = messages.map((msg, index) => {
        const isMine = msg.from === currentUser.username;
        const deleteBtn = isMine ? `<button class="msg-delete-btn" onclick="deleteMessage('${activeChat.username}', '${msg.id}')" title="Удалить">×</button>` : '';
        
        // Рендер реакций
        const reactionsHtml = renderReactions(msg);
        const reactionBtn = `<button class="add-reaction-btn" onclick="showReactionPicker(event, '${msg.id}')" title="Реакция">😊</button>`;
        
        if (msg.type === 'gift') {
            return `
                <div class="message gift-message ${isMine ? 'sent' : 'received'}" data-msg-id="${msg.id}">
                    ${deleteBtn}
                    <div class="gift-message-content">
                        <div class="gift-message-emoji">${msg.gift?.emoji || '🎁'}</div>
                        <div class="gift-message-text">${escapeHtml(msg.text)}</div>
                    </div>
                    ${reactionsHtml}
                    ${reactionBtn}
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
            `;
        }
        if (msg.type === 'nft') {
            return `
                <div class="message nft-message ${isMine ? 'sent' : 'received'}" data-msg-id="${msg.id}">
                    ${deleteBtn}
                    <div class="nft-message-content">
                        ${msg.nft?.image?.startsWith('data:') ? `<img src="${msg.nft.image}" class="nft-msg-img">` : `<div class="nft-msg-emoji">${msg.nft?.image || '🖼'}</div>`}
                        <div class="nft-message-text">${escapeHtml(msg.text)}</div>
                    </div>
                    ${reactionsHtml}
                    ${reactionBtn}
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
            `;
        }
        if (msg.type === 'audio') {
            return `
                <div class="message audio-message ${isMine ? 'sent' : 'received'}" data-msg-id="${msg.id}">
                    ${deleteBtn}
                    <div class="audio-player">
                        <i class="fas fa-music"></i>
                        <audio src="${msg.media}" controls></audio>
                    </div>
                    ${reactionsHtml}
                    ${reactionBtn}
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
            `;
        }
        if (msg.type === 'file') {
            const fileName = msg.fileName || 'Файл';
            const fileSize = msg.fileSize ? formatFileSize(msg.fileSize) : '';
            return `
                <div class="message file-message ${isMine ? 'sent' : 'received'}" data-msg-id="${msg.id}">
                    ${deleteBtn}
                    <div class="file-attachment" onclick="downloadFile('${msg.media}', '${fileName}')">
                        <div class="file-icon"><i class="fas fa-file"></i></div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(fileName)}</div>
                            <div class="file-size">${fileSize}</div>
                        </div>
                        <div class="file-download"><i class="fas fa-download"></i></div>
                    </div>
                    ${reactionsHtml}
                    ${reactionBtn}
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
            `;
        }
        return `
            <div class="message ${isMine ? 'sent' : 'received'} ${msg.type === 'voice' ? 'voice-message' : ''}" data-msg-id="${msg.id}">
                ${deleteBtn}
                ${msg.type === 'image' ? `<img src="${msg.media}" onclick="viewMedia('${msg.media}', 'image')">` : ''}
                ${msg.type === 'video' ? `<video src="${msg.media}" onclick="viewMedia('${msg.media}', 'video')"></video>` : ''}
                ${msg.type === 'voice' ? `<div class="voice-msg"><i class="fas fa-microphone"></i><audio src="${msg.media}" controls></audio></div>` : ''}
                ${msg.type === 'sticker' ? `<span class="sticker">${msg.text}</span>` : ''}
                ${msg.type === 'text' || !msg.type ? `<p>${escapeHtml(msg.text)}</p>` : ''}
                ${reactionsHtml}
                ${reactionBtn}
                <span class="message-time">${formatTime(msg.timestamp)}</span>
            </div>
        `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
}

function renderReactions(msg) {
    if (!msg.reactions || Object.keys(msg.reactions).length === 0) return '';
    
    const reactionCounts = {};
    const myReactions = [];
    
    for (const [emoji, users] of Object.entries(msg.reactions)) {
        if (users.length > 0) {
            reactionCounts[emoji] = users.length;
            if (users.includes(currentUser.username)) {
                myReactions.push(emoji);
            }
        }
    }
    
    if (Object.keys(reactionCounts).length === 0) return '';
    
    return `
        <div class="message-reactions">
            ${Object.entries(reactionCounts).map(([emoji, count]) => `
                <div class="reaction-badge ${myReactions.includes(emoji) ? 'my-reaction' : ''}" 
                     onclick="toggleReaction('${msg.id}', '${emoji}')">
                    <span class="reaction-emoji">${emoji}</span>
                    <span class="reaction-count">${count}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function showReactionPicker(event, msgId) {
    event.stopPropagation();
    
    // Удалить существующие пикеры
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    
    const picker = document.createElement('div');
    picker.className = 'reaction-picker show';
    picker.innerHTML = reactionEmojis.map(emoji => 
        `<span class="reaction-picker-item" onclick="addReaction('${msgId}', '${emoji}')">${emoji}</span>`
    ).join('');
    
    const msgEl = event.target.closest('.message');
    msgEl.appendChild(picker);
    
    // Закрыть при клике вне
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 10);
}

function addReaction(msgId, emoji) {
    if (!activeChat) return;
    socket.emit('add_reaction', { friend: activeChat.username, msgId, emoji });
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
}

function toggleReaction(msgId, emoji) {
    if (!activeChat) return;
    socket.emit('toggle_reaction', { friend: activeChat.username, msgId, emoji });
}

socket.on('reaction_updated', ({ friend, msgId, reactions }) => {
    if (chatHistory[friend]) {
        const msg = chatHistory[friend].find(m => m.id === msgId);
        if (msg) {
            msg.reactions = reactions;
            if (activeChat?.username === friend) {
                renderMessages();
            }
        }
    }
});

// ===== ОТПРАВКА ФАЙЛОВ =====
function sendMedia(event, type) {
    const file = event.target.files[0];
    if (!file || !activeChat) return;
    
    const maxSize = type === 'file' ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
    
    if (file.size > maxSize) {
        showToast(`Файл слишком большой (макс. ${type === 'file' ? '25' : '10'}MB)`, 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        socket.emit('send_message', {
            to: activeChat.username,
            text: '',
            type,
            media: e.target.result,
            fileName: file.name,
            fileSize: file.size
        });
    };
    reader.readAsDataURL(file);
    closeModal('media-modal');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function downloadFile(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
