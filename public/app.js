// ===== ИНИЦИАЛИЗАЦИЯ =====
const socket = io();

// Состояние приложения
let currentUser = null;
let activeChat = null;
let friends = [];
let chatHistory = {};
let friendRequests = [];

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
    
    // Показать кнопку админа если админ
    if (data.isAdmin) {
        document.getElementById('admin-btn').style.display = 'flex';
    }
    
    updateMyProfile();
    renderFriends();
    applyTheme(data.theme || 'dark');
    updatePremiumUI();
    
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
        avatarWrapper.classList.remove('effect-rainbow', 'effect-neon', 'effect-fire', 'effect-pulse');
        if (currentUser.premium && currentUser.profileEffect) {
            avatarWrapper.classList.add('effect-' + currentUser.profileEffect);
        }
    }
    
    document.getElementById('my-status').textContent = 'Онлайн';
    
    const avatar = currentUser.avatar || getDefaultAvatar(currentUser.displayName);
    document.getElementById('my-avatar').src = avatar;
    document.getElementById('settings-avatar').src = avatar;
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
    if (checkPremium()) {
        nickEmoji = document.getElementById('settings-emoji')?.value || null;
        nickFont = document.getElementById('settings-font')?.value || 'default';
        profileEffect = document.getElementById('settings-effect')?.value || null;
    }
    
    socket.emit('update_profile', { displayName, status, avatar, theme, telegram, nickEmoji, nickFont, profileEffect });
    applyTheme(theme);
    closeModal('settings-modal');
}

socket.on('profile_updated', (data) => {
    currentUser = { ...currentUser, ...data };
    updateMyProfile();
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

function renderMessages() {
    if (!activeChat) return;
    
    const container = document.getElementById('messages');
    const messages = chatHistory[activeChat.username] || [];
    
    container.innerHTML = messages.map((msg, index) => {
        const isMine = msg.from === currentUser.username;
        const deleteBtn = isMine ? `<button class="msg-delete-btn" onclick="deleteMessage('${activeChat.username}', '${msg.id}')" title="Удалить">×</button>` : '';
        
        if (msg.type === 'gift') {
            return `
                <div class="message gift-message ${isMine ? 'sent' : 'received'}">
                    ${deleteBtn}
                    <div class="gift-message-content">
                        <div class="gift-message-emoji">${msg.gift?.emoji || '🎁'}</div>
                        <div class="gift-message-text">${escapeHtml(msg.text)}</div>
                    </div>
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
            `;
        }
        if (msg.type === 'nft') {
            return `
                <div class="message nft-message ${isMine ? 'sent' : 'received'}">
                    ${deleteBtn}
                    <div class="nft-message-content">
                        ${msg.nft?.image?.startsWith('data:') ? `<img src="${msg.nft.image}" class="nft-msg-img">` : `<div class="nft-msg-emoji">${msg.nft?.image || '🖼'}</div>`}
                        <div class="nft-message-text">${escapeHtml(msg.text)}</div>
                    </div>
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
            `;
        }
        return `
            <div class="message ${isMine ? 'sent' : 'received'} ${msg.type === 'voice' ? 'voice-message' : ''}">
                ${deleteBtn}
                ${msg.type === 'image' ? `<img src="${msg.media}" onclick="viewMedia('${msg.media}', 'image')">` : ''}
                ${msg.type === 'video' ? `<video src="${msg.media}" onclick="viewMedia('${msg.media}', 'video')"></video>` : ''}
                ${msg.type === 'voice' ? `<div class="voice-msg"><i class="fas fa-microphone"></i><audio src="${msg.media}" controls></audio></div>` : ''}
                ${msg.type === 'sticker' ? `<span class="sticker">${msg.text}</span>` : ''}
                ${msg.type === 'text' || !msg.type ? `<p>${escapeHtml(msg.text)}</p>` : ''}
                <span class="message-time">${formatTime(msg.timestamp)}</span>
            </div>
        `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
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

function sendMedia(event, type) {
    const file = event.target.files[0];
    if (!file || !activeChat) return;
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('Файл слишком большой (макс. 10MB)', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        socket.emit('send_message', {
            to: activeChat.username,
            text: '',
            type,
            media: e.target.result
        });
    };
    reader.readAsDataURL(file);
    closeModal('media-modal');
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
        return `
            <div class="shop-item ${gift.limited ? 'limited' : ''} ${isSoldOut ? 'sold-out' : ''} ${rarityClass} ${isPremiumOnly ? 'premium-only' : ''}" onclick="${canBuy ? `buyGift('${gift.id}')` : `showToast('Только для премиум!', 'error')`}">
                ${gift.rarity ? `<span class="gift-rarity ${gift.rarity}">${gift.rarity}</span>` : ''}
                ${isPremiumOnly ? '<span class="premium-badge-item">⭐</span>' : ''}
                <div class="shop-item-emoji">${gift.emoji}</div>
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
            : `<div class="shop-item-emoji">${nft.image}</div>`;
        const isPremiumOnly = nft.premiumOnly;
        const canBuy = !isPremiumOnly || checkPremium();
        return `
            <div class="shop-item nft ${isPremiumOnly ? 'premium-only' : ''}" onclick="${canBuy ? `buyNFT('${nft.id}')` : `showToast('Только для премиум!', 'error')`}">
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
    document.getElementById('admin-btn').style.display = isAdmin ? 'flex' : 'none';
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

// ===== РЫНОК С КАРТИНКАМИ =====
renderMarketBuy = function() {
    const container = document.getElementById('market-buy');
    if (marketData.length === 0) {
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted)">Рынок пуст</p>';
        return;
    }
    
    container.innerHTML = marketData.map(listing => {
        const item = listing.item;
        const bgClass = item.background ? `bg-${item.background}` : '';
        let imageHtml;
        
        if (item.image?.startsWith('data:')) {
            imageHtml = `<img src="${item.image}" class="market-item-img">`;
        } else {
            imageHtml = `<div class="market-item-emoji ${bgClass}">${item.emoji || item.image || '🎁'}</div>`;
        }
        
        return `
            <div class="market-item">
                ${imageHtml}
                <div class="market-item-name">${item.name}</div>
                ${item.rarity ? `<span class="nft-rarity ${item.rarity}">${item.rarity}</span>` : ''}
                <div class="market-item-price">${listing.price} 🐱</div>
                <div class="market-item-seller">от ${listing.sellerName}</div>
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

// ===== ОБНОВЛЁННЫЙ ПРОФИЛЬ С TOOLTIP =====
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
    
    // Подарки с tooltip
    const giftsGrid = document.getElementById('profile-gifts-list');
    if (profile.gifts && profile.gifts.length > 0) {
        giftsGrid.innerHTML = profile.gifts.slice(-12).map(g => {
            const bgClass = g.background ? `bg-${g.background}` : '';
            return `<div class="gift-item ${bgClass}" title="${g.name}\nКод: ${g.code || 'N/A'}">${g.emoji}</div>`;
        }).join('');
    } else {
        giftsGrid.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет подарков</span>';
    }
    
    // NFT с tooltip
    const nftsGrid = document.getElementById('profile-nfts-list');
    if (nftsGrid) {
        if (profile.nfts && profile.nfts.length > 0) {
            nftsGrid.innerHTML = profile.nfts.slice(-6).map(n => `
                <div class="nft-item rarity-${n.rarity}" title="${n.name}\nРедкость: ${n.rarity}\nКод: ${n.code || 'N/A'}\nУровень: ${n.level || 1}">
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

// ===== РЕНДЕР NFT В МАГАЗИНЕ С НОВЫМИ РЕДКОСТЯМИ =====
renderShopNFTs = function() {
    const container = document.getElementById('shop-nfts');
    container.innerHTML = shopData.nfts.map(nft => `
        <div class="shop-item nft rarity-card-${nft.rarity}" onclick="buyNFT('${nft.id}')">
            <span class="nft-rarity ${nft.rarity}">${nft.rarity}</span>
            <div class="shop-item-emoji">${nft.image}</div>
            <div class="shop-item-name">${nft.name}</div>
            <div class="shop-item-price">
                <span class="coin-icon">🐱</span> ${nft.price}
            </div>
        </div>
    `).join('');
};



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
