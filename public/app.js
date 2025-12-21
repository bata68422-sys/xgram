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
    
    showToast(`Добро пожаловать, ${data.displayName}!`, 'success');
});

socket.on('login_error', (msg) => {
    showToast(msg, 'error');
    // Очищаем сохранённые данные при ошибке входа
    localStorage.removeItem('xgram_user');
    localStorage.removeItem('xgram_pass');
});

// ===== ПРОФИЛЬ =====
function updateMyProfile() {
    document.getElementById('my-name').textContent = currentUser.displayName;
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
    
    socket.emit('update_profile', { displayName, status, avatar, theme, telegram });
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
    list.innerHTML = friends.map(friend => `
        <div class="chat-item ${activeChat?.username === friend.username ? 'active' : ''}" 
             onclick="openChat(${JSON.stringify(friend).replace(/"/g, '&quot;')})">
            <div class="avatar-wrapper">
                <img src="${friend.avatar || getDefaultAvatar(friend.displayName)}" alt="">
                ${friend.online ? '<span class="online-dot"></span>' : ''}
            </div>
            <div class="chat-item-info">
                <span class="chat-item-name">${friend.displayName}</span>
                <span class="chat-item-preview">${friend.online ? 'Онлайн' : 'Не в сети'}</span>
            </div>
        </div>
    `).join('');
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
            <div class="message ${isMine ? 'sent' : 'received'}">
                ${deleteBtn}
                ${msg.type === 'image' ? `<img src="${msg.media}" onclick="viewMedia('${msg.media}', 'image')">` : ''}
                ${msg.type === 'video' ? `<video src="${msg.media}" onclick="viewMedia('${msg.media}', 'video')"></video>` : ''}
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
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
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
        document.getElementById('typing-indicator').style.display = 'flex';
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            document.getElementById('typing-indicator').style.display = 'none';
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
        return `
            <div class="shop-item ${gift.limited ? 'limited' : ''} ${isSoldOut ? 'sold-out' : ''}" onclick="buyGift('${gift.id}')">
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
    container.innerHTML = shopData.nfts.map(nft => `
        <div class="shop-item nft" onclick="buyNFT('${nft.id}')">
            <span class="nft-rarity ${nft.rarity}">${nft.rarity}</span>
            <div class="shop-item-emoji">${nft.image}</div>
            <div class="shop-item-name">${nft.name}</div>
            <div class="shop-item-price">
                <span class="coin-icon">🐱</span> ${nft.price}
            </div>
        </div>
    `).join('');
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
            </div>
        </div>
    `).join('');
}

function adminToggleAdmin(username) {
    socket.emit('admin_toggle_admin', username);
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
function renderMyItems() {
    const giftsContainer = document.getElementById('my-gifts-list');
    const nftsContainer = document.getElementById('my-nfts-list');
    
    if (myGifts.length === 0) {
        giftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет подарков</span>';
    } else {
        giftsContainer.innerHTML = myGifts.map((g, i) => `
            <div class="my-item">
                ${g.emoji} ${g.name}
                <span class="sell-price">+${g.sellPrice || Math.floor(g.price/2)}🐱</span>
                <button class="sell-btn" onclick="sellGift(${i})">Продать</button>
            </div>
        `).join('');
    }
    
    if (myNfts.length === 0) {
        nftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет NFT</span>';
    } else {
        nftsContainer.innerHTML = myNfts.map((n, i) => `
            <div class="my-item nft">
                ${n.isCustom && n.image?.startsWith('data:') ? `<img src="${n.image}" style="width:30px;height:30px;border-radius:6px">` : n.image}
                ${n.name}
                <span class="nft-rarity ${n.rarity}">${n.rarity}</span>
                <span class="sell-price">+${n.sellPrice || Math.floor(n.price/2)}🐱</span>
                <button class="sell-btn" onclick="sellNft(${i})">Продать</button>
            </div>
        `).join('');
    }
}

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

// ===== ГРУППЫ И КАНАЛЫ =====
let createType = 'group';

function openCreateGroup() {
    openModal('create-group-modal');
}

function switchCreateType(type) {
    createType = type;
    document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('channel-desc-group').style.display = type === 'channel' ? 'block' : 'none';
}

function createGroupOrChannel() {
    const name = document.getElementById('create-name').value.trim();
    if (!name) {
        showToast('Введите название', 'error');
        return;
    }
    
    if (createType === 'group') {
        socket.emit('create_group', { name });
    } else {
        const description = document.getElementById('create-description').value.trim();
        socket.emit('create_channel', { name, description });
    }
    
    closeModal('create-group-modal');
    document.getElementById('create-name').value = '';
    document.getElementById('create-description').value = '';
}

socket.on('group_created', (group) => {
    showToast(`Группа "${group.name}" создана!`, 'success');
});

socket.on('channel_created', (channel) => {
    showToast(`Канал "${channel.name}" создан!`, 'success');
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
    
    if (myGifts.length === 0) {
        giftsContainer.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет подарков</span>';
    } else {
        giftsContainer.innerHTML = myGifts.map((g, i) => `
            <div class="market-sell-item" onclick="openListItem('gift', ${i}, '${g.emoji}', '${g.name}')">
                <span class="emoji">${g.emoji}</span>
                <span>${g.name}</span>
            </div>
        `).join('');
    }
    
    if (myNfts.length === 0) {
        nftsContainer.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Нет NFT</span>';
    } else {
        nftsContainer.innerHTML = myNfts.map((n, i) => `
            <div class="market-sell-item" onclick="openListItem('nft', ${i}, '${n.image || '🖼'}', '${n.name}')">
                <span class="emoji">${n.image || '🖼'}</span>
                <span>${n.name}</span>
            </div>
        `).join('');
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

socket.on('nft_upgraded', ({ nft, newBalance, nfts }) => {
    myCoins = newBalance;
    myNfts = nfts;
    document.getElementById('my-coins').textContent = myCoins;
    renderMyItems();
    showToast(`${nft.name} улучшен до уровня ${nft.level}!`, 'success');
});

// Обновить renderMyItems для показа уровня и кнопки улучшения
const oldRenderMyItems = renderMyItems;
renderMyItems = function() {
    const giftsContainer = document.getElementById('my-gifts-list');
    const nftsContainer = document.getElementById('my-nfts-list');
    
    if (!giftsContainer || !nftsContainer) return;
    
    if (myGifts.length === 0) {
        giftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет подарков</span>';
    } else {
        giftsContainer.innerHTML = myGifts.map((g, i) => `
            <div class="my-item">
                ${g.emoji} ${g.name}
                <span class="sell-price">+${g.sellPrice || Math.floor(g.price/2)}🐱</span>
                <button class="sell-btn" onclick="sellGift(${i})">Продать</button>
            </div>
        `).join('');
    }
    
    if (myNfts.length === 0) {
        nftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет NFT</span>';
    } else {
        nftsContainer.innerHTML = myNfts.map((n, i) => {
            const level = n.level || 1;
            const canUpgrade = n.upgradeable && level < (n.maxLevel || 5);
            const upgradeCost = level * 100;
            return `
                <div class="my-item nft">
                    ${n.isCustom && n.image?.startsWith('data:') ? `<img src="${n.image}" style="width:30px;height:30px;border-radius:6px">` : n.image}
                    ${n.name}
                    ${n.level ? `<span class="nft-level">Lv.${n.level}</span>` : ''}
                    <span class="nft-rarity ${n.rarity}">${n.rarity}</span>
                    ${canUpgrade ? `<button class="sell-btn upgrade-btn" onclick="upgradeNft(${i})">⬆️ ${upgradeCost}🐱</button>` : ''}
                    <button class="sell-btn" onclick="sellNft(${i})">Продать</button>
                </div>
            `;
        }).join('');
    }
};

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
function openAddShopNft() {
    openModal('add-shop-nft-modal');
}

function addShopNft() {
    const name = document.getElementById('shop-nft-name').value.trim();
    const image = document.getElementById('shop-nft-image').value.trim();
    const price = parseInt(document.getElementById('shop-nft-price').value) || 100;
    const quantity = parseInt(document.getElementById('shop-nft-quantity').value) || -1;
    const rarity = document.getElementById('shop-nft-rarity').value;
    const upgradeable = document.getElementById('shop-nft-upgradeable').checked;
    
    if (!name) {
        showToast('Введите название', 'error');
        return;
    }
    
    socket.emit('admin_add_shop_nft', { name, image: image || '🎨', price, quantity, rarity, upgradeable });
    closeModal('add-shop-nft-modal');
    
    // Очистить форму
    document.getElementById('shop-nft-name').value = '';
    document.getElementById('shop-nft-image').value = '';
    document.getElementById('shop-nft-price').value = '100';
}

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
    renderMyItems();
    
    const bgNames = {
        'common': 'Обычный',
        'uncommon': 'Необычный',
        'rare': 'Редкий',
        'epic': 'Эпический',
        'legendary': '🌟 ЛЕГЕНДАРНЫЙ!'
    };
    showToast(`Фон улучшен до: ${bgNames[newBackground]}!`, 'success');
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

// Модифицируем sendMessage для групп
const originalSendMessage = sendMessage;
sendMessage = function() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    if (currentGroup) {
        socket.emit('send_group_message', { groupId: currentGroup.id, text, type: 'text' });
        input.value = '';
    } else if (currentChannel && currentChannel.isAdmin) {
        socket.emit('post_to_channel', { channelId: currentChannel.id, text });
        input.value = '';
    } else if (activeChat) {
        socket.emit('send_message', { to: activeChat.username, text, type: 'text' });
        input.value = '';
    }
};

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
    socket.emit('add_to_group', { groupId: currentGroup.id, username });
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

// ===== ОБНОВЛЕНИЕ renderMyItems ДЛЯ ФОНОВ =====
renderMyItems = function() {
    const giftsContainer = document.getElementById('my-gifts-list');
    const nftsContainer = document.getElementById('my-nfts-list');
    
    if (!giftsContainer || !nftsContainer) return;
    
    if (myGifts.length === 0) {
        giftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет подарков</span>';
    } else {
        giftsContainer.innerHTML = myGifts.map((g, i) => {
            const bgClass = g.background ? `bg-${g.background}` : '';
            const canUpgrade = !g.background || g.background !== 'legendary';
            const upgradeCost = (['common', 'uncommon', 'rare', 'epic'].indexOf(g.background || 'common') + 1) * 50;
            return `
                <div class="my-item ${bgClass}">
                    ${g.emoji} ${g.name}
                    ${g.background ? `<span class="bg-badge">${g.background}</span>` : ''}
                    <span class="sell-price">+${g.sellPrice || Math.floor(g.price/2)}🐱</span>
                    ${canUpgrade ? `<button class="upgrade-btn" onclick="upgradeGiftBg(${i})">🎨 ${upgradeCost}🐱</button>` : ''}
                    <button class="sell-btn" onclick="sellGift(${i})">Продать</button>
                </div>
            `;
        }).join('');
    }
    
    if (myNfts.length === 0) {
        nftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет NFT</span>';
    } else {
        nftsContainer.innerHTML = myNfts.map((n, i) => {
            const level = n.level || 1;
            const canUpgrade = n.upgradeable && level < (n.maxLevel || 5);
            const upgradeCost = level * 100;
            return `
                <div class="my-item nft">
                    ${n.image?.startsWith('data:') ? `<img src="${n.image}" style="width:30px;height:30px;border-radius:6px">` : n.image}
                    ${n.name}
                    ${n.level ? `<span class="nft-level">Lv.${n.level}</span>` : ''}
                    <span class="nft-rarity ${n.rarity}">${n.rarity}</span>
                    ${canUpgrade ? `<button class="upgrade-btn" onclick="upgradeNft(${i})">⬆️ ${upgradeCost}🐱</button>` : ''}
                    <button class="sell-btn" onclick="sellNft(${i})">Продать</button>
                </div>
            `;
        }).join('');
    }
};

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

// ===== УЛУЧШЕНИЕ NFT (ФИОЛЕТОВОЕ СВЕЧЕНИЕ) =====
socket.on('nft_upgraded', ({ nft, newBalance, nfts }) => {
    myCoins = newBalance;
    myNfts = nfts;
    document.getElementById('my-coins').textContent = myCoins;
    renderMyItems();
    
    // Красивая анимация улучшения
    showUpgradeAnimation(nft);
});

function showUpgradeAnimation(nft) {
    const overlay = document.createElement('div');
    overlay.className = 'upgrade-animation-overlay';
    overlay.innerHTML = `
        <div class="upgrade-animation-content">
            <div class="upgrade-particles"></div>
            <div class="upgrade-nft-display ${nft.level >= 3 ? 'glow-purple' : ''}">
                ${nft.image?.startsWith('data:') ? `<img src="${nft.image}">` : `<span>${nft.image}</span>`}
            </div>
            <div class="upgrade-text">
                <h2>⬆️ УЛУЧШЕНО!</h2>
                <p>${nft.name}</p>
                <p class="upgrade-level">Уровень ${nft.level || 1}</p>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Создаём частицы
    const particles = overlay.querySelector('.upgrade-particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 0.5 + 's';
        particle.style.background = `hsl(${260 + Math.random() * 40}, 80%, 60%)`;
        particles.appendChild(particle);
    }
    
    setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 500);
    }, 2500);
}

// ===== ОБНОВЛЁННЫЙ renderMyItems С УДАЛЕНИЕМ И АНИМАЦИЯМИ =====
renderMyItems = function() {
    const giftsContainer = document.getElementById('my-gifts-list');
    const nftsContainer = document.getElementById('my-nfts-list');
    
    if (!giftsContainer || !nftsContainer) return;
    
    if (myGifts.length === 0) {
        giftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет подарков</span>';
    } else {
        giftsContainer.innerHTML = myGifts.map((g, i) => {
            const bgClass = g.background ? `bg-${g.background}` : '';
            const canUpgrade = !g.background || g.background !== 'legendary';
            const upgradeCost = (['common', 'uncommon', 'rare', 'epic'].indexOf(g.background || 'common') + 1) * 50;
            return `
                <div class="my-item gift-item-animated ${bgClass}" style="animation-delay: ${i * 0.05}s">
                    <span class="item-emoji">${g.emoji}</span>
                    <span class="item-name">${g.name}</span>
                    ${g.background ? `<span class="bg-badge bg-badge-${g.background}">${g.background}</span>` : ''}
                    <div class="item-actions">
                        ${canUpgrade ? `<button class="action-btn upgrade-btn" onclick="upgradeGiftBg(${i})" title="Улучшить фон">🎨 ${upgradeCost}</button>` : ''}
                        <button class="action-btn sell-btn" onclick="sellGift(${i})" title="Продать">💰 ${g.sellPrice || Math.floor(g.price/2)}</button>
                        <button class="action-btn delete-btn" onclick="deleteGift(${i})" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    if (myNfts.length === 0) {
        nftsContainer.innerHTML = '<span style="color:var(--text-muted)">Нет NFT</span>';
    } else {
        nftsContainer.innerHTML = myNfts.map((n, i) => {
            const level = n.level || 1;
            const canUpgrade = n.upgradeable !== false && level < (n.maxLevel || 5);
            const upgradeCost = level * 100;
            const glowClass = level >= 3 ? 'nft-glow-purple' : level >= 2 ? 'nft-glow-blue' : '';
            return `
                <div class="my-item nft-item-animated ${glowClass}" style="animation-delay: ${i * 0.05}s">
                    <div class="nft-image-wrapper">
                        ${n.image?.startsWith('data:') ? `<img src="${n.image}" class="nft-thumb">` : `<span class="nft-emoji">${n.image}</span>`}
                        ${level > 1 ? `<span class="nft-level-badge">Lv.${level}</span>` : ''}
                    </div>
                    <span class="item-name">${n.name}</span>
                    <span class="nft-rarity ${n.rarity}">${n.rarity}</span>
                    <div class="item-actions">
                        ${canUpgrade ? `<button class="action-btn upgrade-btn" onclick="upgradeNft(${i})" title="Улучшить">⬆️ ${upgradeCost}</button>` : ''}
                        <button class="action-btn sell-btn" onclick="sellNft(${i})" title="Продать">💰</button>
                        <button class="action-btn delete-btn" onclick="deleteNft(${i})" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }
};

