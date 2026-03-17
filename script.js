const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');
const closeBtn = document.getElementById('close-widget');
const voiceStatus = document.getElementById('voice-status');

const API_BASE = ''; // Relative path because we serve via the same FastAPI server

// Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
const synth = window.speechSynthesis;
let voices = [];
let hasWelcomed = false;

function setVoiceStatus(text, isError = false) {
    if (!voiceStatus) return;
    voiceStatus.textContent = text;
    voiceStatus.style.color = isError ? '#ff4b2b' : 'var(--gold)';
}

function loadVoices() {
    voices = synth.getVoices();
    console.log("Voices loaded:", voices.length);
}

// Listen for 'open-winesbot' signal from parent to trigger greeting
window.addEventListener('message', (event) => {
    if (event.data === 'open-winesbot' && !hasWelcomed) {
        hasWelcomed = true;
        console.log("Bot opened, triggering greeting...");
        // Small delay to ensure synthesis is ready
        setTimeout(() => {
            speak("Welcome to Wine Bot. I am your personal sommelier. How can I assist you with wine today?");
        }, 300);
    }
});

if (synth) {
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
    }
    loadVoices();
}

let isRecording = false;

if (recognition) {
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        userInput.value = transcript;
        setVoiceStatus("Listening...");
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        setVoiceStatus("Error: " + event.error, true);
        voiceBtn.classList.remove('recording');
        isRecording = false;
    };

    recognition.onend = () => {
        console.log("Speech Recognition Ended. isRecording:", isRecording);
        voiceBtn.classList.remove('recording');
        if (isRecording) { 
            isRecording = false;
            const text = userInput.value.trim();
            if (text) {
                setVoiceStatus("Processing...");
                sendMessage(true); // Voice-to-voice
            } else {
                setVoiceStatus("Tap to speak");
            }
        } else {
            setVoiceStatus("Tap to speak");
        }
    };
}

voiceBtn.addEventListener('click', () => {
    if (!recognition) {
        alert("Speech Recognition not supported. Please use Chrome/Edge on http://localhost:8000");
        return;
    }

    if (isRecording) {
        recognition.stop();
    } else {
        if (synth) synth.cancel(); // INTERRUPTION: Stop bot from speaking when user starts talking
        userInput.value = '';
        try {
            recognition.start();
            isRecording = true;
            voiceBtn.classList.add('recording');
            setVoiceStatus("Listening...");
        } catch (e) {
            console.error("Recognition Start Error:", e);
            setVoiceStatus("Check connection", true);
        }
    }
});

function speak(text) {
    if (!synth) return;
    synth.cancel(); 
    
    setVoiceStatus("WinesBot is speaking...");
    const utterance = new SpeechSynthesisUtterance(text);
    
    const getBestVoice = () => {
        if (voices.length === 0) voices = synth.getVoices();
        let v = voices.find(v => (v.name.includes('Google') || v.name.includes('Premium')) && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria')));
        if (v) return v;
        v = voices.find(v => v.name.includes('Google') || v.name.includes('Premium'));
        if (v) return v;
        v = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria') || v.name.includes('Google UK English Female'));
        if (v) return v;
        return voices[0];
    };

    const voice = getBestVoice();
    if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
    }
    
    utterance.onend = () => {
        setVoiceStatus("Tap to speak");
    };

    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    synth.speak(utterance);
}

closeBtn.addEventListener('click', () => {
    if (synth) synth.cancel();
    if (recognition) recognition.stop();
    window.parent.postMessage('close-winesbot', '*');
});

// Chat functions
async function sendMessage(shouldSpeak = false) {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    userInput.value = '';

    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await response.json();
        appendMessage('bot', data.response);
        
        if (shouldSpeak) {
            speak(data.response);
        }
    } catch (error) {
        console.error("Error sending message:", error);
        appendMessage('bot', "The cellar is currently locked. Please try again soon. 🍷");
    }
}

function appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = `<div class="content">${text}</div>`;
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

sendBtn.addEventListener('click', () => sendMessage(false));
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage(false);
});
