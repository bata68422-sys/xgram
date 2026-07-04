// ===== СИСТЕМА ЗВОНКОВ WebRTC =====

// WebRTC конфигурация
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

let peerConnection = null;
let localStream = null;
let callTarget = null;
let isVideoCall = false;
let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;

// Начать звонок
async function startCall(isVideo) {
    if (!activeChat) {
        showToast('Выберите чат для звонка', 'error');
        return;
    }
    
    try {
        isVideoCall = isVideo;
        callTarget = activeChat;
        
        // Запрос доступа к медиа устройствам
        const constraints = {
            audio: true,
            video: isVideo ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } : false
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Создать peer connection
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Добавить локальный стрим
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Обработчики событий
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice_candidate', {
                    to: callTarget,
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.style.display = 'block';
            }
        };
        
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateCallStatus('Подключен');
            } else if (peerConnection.connectionState === 'disconnected') {
                endCall();
            }
        };
        
        // Создать offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправить offer другому пользователю
        socket.emit('call_user', {
            to: callTarget,
            offer: offer,
            isVideo: isVideo
        });
        
        // Показать экран звонка
        showCallScreen(callTarget, isVideo, 'outgoing');
        
        // Показать локальное видео если видеозвонок
        if (isVideo) {
            const localVideo = document.getElementById('local-video');
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.style.display = 'block';
            }
        }
        
    } catch (error) {
        console.error('Ошибка при создании звонка:', error);
        showToast('Не удалось получить доступ к камере/микрофону', 'error');
        endCall();
    }
}

// Принять входящий звонок
async function answerCall(from, offer, isVideo) {
    try {
        callTarget = from;
        isVideoCall = isVideo;
        
        // Запрос доступа к медиа устройствам
        const constraints = {
            audio: true,
            video: isVideo ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } : false
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Создать peer connection
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Добавить локальный стрим
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Обработчики событий
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice_candidate', {
                    to: callTarget,
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.style.display = 'block';
            }
        };
        
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateCallStatus('Подключен');
            } else if (peerConnection.connectionState === 'disconnected') {
                endCall();
            }
        };
        
        // Установить remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Создать answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Отправить answer
        socket.emit('call_answer', {
            to: callTarget,
            answer: answer
        });
        
        // Показать экран звонка
        showCallScreen(callTarget, isVideo, 'connected');
        
        // Показать локальное видео если видеозвонок
        if (isVideo) {
            const localVideo = document.getElementById('local-video');
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.style.display = 'block';
            }
        }
        
    } catch (error) {
        console.error('Ошибка при приеме звонка:', error);
        showToast('Не удалось ответить на звонок', 'error');
        rejectCall();
    }
}

// Отклонить звонок
function rejectCall() {
    if (callTarget) {
        socket.emit('call_rejected', { to: callTarget });
    }
    hideCallScreen();
}

// Завершить звонок
function endCall() {
    // Остановить локальный стрим
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Закрыть peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Уведомить другого пользователя
    if (callTarget) {
        socket.emit('call_ended', { to: callTarget });
    }
    
    // Скрыть экран звонка
    hideCallScreen();
    
    // Сбросить состояние
    callTarget = null;
    isVideoCall = false;
    isMuted = false;
    isVideoOff = false;
    isScreenSharing = false;
}

// Переключить микрофон
function toggleMute() {
    if (!localStream) return;
    
    isMuted = !isMuted;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !isMuted;
    }
    
    const muteBtn = document.querySelector('.mute-btn');
    if (muteBtn) {
        muteBtn.innerHTML = `<i class="fas fa-microphone${isMuted ? '-slash' : ''}"></i>`;
        muteBtn.style.background = isMuted ? 'var(--danger)' : 'var(--bg-tertiary)';
    }
}

// Переключить видео
function toggleVideo() {
    if (!localStream || !isVideoCall) return;
    
    isVideoOff = !isVideoOff;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !isVideoOff;
    }
    
    const videoBtn = document.querySelector('.video-btn');
    if (videoBtn) {
        videoBtn.innerHTML = `<i class="fas fa-video${isVideoOff ? '-slash' : ''}"></i>`;
        videoBtn.style.background = isVideoOff ? 'var(--danger)' : 'var(--bg-tertiary)';
    }
    
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
        localVideo.style.display = isVideoOff ? 'none' : 'block';
    }
}

// Демонстрация экрана
async function toggleScreenShare() {
    if (!peerConnection) return;
    
    try {
        if (!isScreenSharing) {
            // Начать демонстрацию экрана
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });
            
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Заменить видео трек
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
            
            // Когда пользователь останавливает демонстрацию
            screenTrack.onended = () => {
                toggleScreenShare();
            };
            
            isScreenSharing = true;
            
            const screenBtn = document.querySelector('.screen-btn');
            if (screenBtn) {
                screenBtn.classList.add('active');
                screenBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            }
            
        } else {
            // Остановить демонстрацию экрана
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
            
            isScreenSharing = false;
            
            const screenBtn = document.querySelector('.screen-btn');
            if (screenBtn) {
                screenBtn.classList.remove('active');
                screenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
            }
        }
    } catch (error) {
        console.error('Ошибка при демонстрации экрана:', error);
        showToast('Не удалось начать демонстрацию экрана', 'error');
    }
}

// Показать экран звонка
function showCallScreen(username, isVideo, status) {
    const callScreen = document.getElementById('call-screen');
    const callName = document.getElementById('call-name');
    const callAvatar = document.getElementById('call-avatar');
    const callStatusText = document.getElementById('call-status-text');
    
    if (!callScreen) return;
    
    // Получить информацию о пользователе
    const friend = friends.find(f => f.username === username);
    const displayName = friend ? friend.displayName : username;
    const avatar = friend ? (friend.avatar || getDefaultAvatar(displayName)) : getDefaultAvatar(username);
    
    if (callName) callName.textContent = displayName;
    if (callAvatar) callAvatar.src = avatar;
    
    // Установить статус
    if (status === 'outgoing') {
        if (callStatusText) callStatusText.textContent = isVideo ? 'Видеозвонок...' : 'Звоним...';
    } else if (status === 'incoming') {
        if (callStatusText) callStatusText.textContent = isVideo ? 'Входящий видеозвонок' : 'Входящий звонок';
    } else if (status === 'connected') {
        if (callStatusText) callStatusText.textContent = 'Подключен';
    }
    
    callScreen.classList.add('active');
    
    // Показать правильные кнопки
    const callControls = document.querySelector('.call-controls');
    const incomingControls = document.querySelector('.incoming-controls');
    
    if (status === 'incoming') {
        if (callControls) callControls.style.display = 'none';
        if (incomingControls) incomingControls.style.display = 'flex';
    } else {
        if (callControls) callControls.style.display = 'flex';
        if (incomingControls) incomingControls.style.display = 'none';
    }
}

// Скрыть экран звонка
function hideCallScreen() {
    const callScreen = document.getElementById('call-screen');
    if (callScreen) {
        callScreen.classList.remove('active');
    }
    
    const remoteVideo = document.getElementById('remote-video');
    const localVideo = document.getElementById('local-video');
    
    if (remoteVideo) {
        remoteVideo.style.display = 'none';
        remoteVideo.srcObject = null;
    }
    if (localVideo) {
        localVideo.style.display = 'none';
        localVideo.srcObject = null;
    }
}

// Обновить статус звонка
function updateCallStatus(status) {
    const callStatusText = document.getElementById('call-status-text');
    if (callStatusText) {
        callStatusText.textContent = status;
    }
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ SOCKET.IO =====

// Входящий звонок
socket.on('incoming_call', ({ from, offer, isVideo }) => {
    if (peerConnection) {
        // Если уже идет звонок, отклонить
        socket.emit('call_rejected', { to: from });
        return;
    }
    
    const friend = friends.find(f => f.username === from);
    const displayName = friend ? friend.displayName : from;
    
    showCallScreen(from, isVideo, 'incoming');
    
    // Воспроизвести звук звонка
    playRingtone();
    
    // Сохранить offer для ответа
    window.incomingCallOffer = offer;
    window.incomingCallFrom = from;
    window.incomingCallIsVideo = isVideo;
});

// Ответ на звонок
socket.on('call_answered', async ({ answer }) => {
    if (peerConnection) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            updateCallStatus('Подключен');
            stopRingtone();
        } catch (error) {
            console.error('Ошибка при установке remote description:', error);
        }
    }
});

// ICE кандидат
socket.on('ice_candidate', async ({ candidate }) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Ошибка при добавлении ICE candidate:', error);
        }
    }
});

// Звонок завершен
socket.on('call_ended', () => {
    endCall();
    showToast('Звонок завершен', 'info');
});

// Звонок отклонен
socket.on('call_rejected', () => {
    endCall();
    showToast('Звонок отклонен', 'error');
});

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

let ringtoneAudio = null;

function playRingtone() {
    stopRingtone();
    // Создать простой beep звук используя Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440;
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    
    ringtoneAudio = { oscillator, gainNode, audioContext };
    
    // Остановить через 30 секунд
    setTimeout(() => {
        stopRingtone();
    }, 30000);
}

function stopRingtone() {
    if (ringtoneAudio) {
        ringtoneAudio.oscillator.stop();
        ringtoneAudio.audioContext.close();
        ringtoneAudio = null;
    }
}

// Обработчик для кнопки ответа на входящий звонок
function acceptIncomingCall() {
    stopRingtone();
    if (window.incomingCallOffer && window.incomingCallFrom) {
        answerCall(window.incomingCallFrom, window.incomingCallOffer, window.incomingCallIsVideo);
        window.incomingCallOffer = null;
        window.incomingCallFrom = null;
        window.incomingCallIsVideo = null;
    }
}

// Обработчик для кнопки отклонения входящего звонка
function rejectIncomingCall() {
    stopRingtone();
    if (window.incomingCallFrom) {
        socket.emit('call_rejected', { to: window.incomingCallFrom });
        window.incomingCallOffer = null;
        window.incomingCallFrom = null;
        window.incomingCallIsVideo = null;
    }
    hideCallScreen();
}
