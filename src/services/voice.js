// src/services/voice.js
// Centralized service for Flask backend communication (Whisper, Piper, AI roasts).
// Designed for high resilience: never freezes the Pixi ticker or crashes if backend is offline.

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
const BACKEND_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) || (
    isDev
        ? "http://localhost:5000"
        : "https://central-vienium.onrender.com"
);
const REQUEST_TIMEOUT_MS = 5000;

// Local fallback roasts matching Central Vienium comedic style
const LOCAL_FALLBACK_ROASTS = {
    LEVEL1_START: [
        "Custody protocol CV-07 is active. Try not to embarrass your species.",
        "Welcome to Sector CV-07. Please file all collision reports in triplicate.",
    ],
    PLAYER_MISSED: [
        "That was certainly a tactical decision.",
        "The alien saw that coming from another galaxy.",
        "Space is 99.9% empty, but you are really proving it.",
    ],
    ALIEN_HIT: [
        "Congratulations. You have successfully annoyed the alien.",
        "That alien definitely felt that.",
        "Target liquidated. Custodial fees applied.",
    ],
    POWER_UP: [
        "Emergency thrusters engaged! Running away at 175% velocity.",
        "Ion overdrive active. Try not to crash into a meteor.",
    ],
    GOLDEN_SPAWN: [
        "Priority contraband vessel detected! Neutralize it for sector clearance!",
    ],
    GOLDEN_HIT: [
        "Golden ship neutralized! Sector CV-07 custody clearance filed.",
    ],
    LEVEL1_COMPLETE: [
        "Against all available evidence, you survived Sector CV-07.",
        "Central Vienium dispatch is moderately stunned. Proceeding to evaluation.",
    ],
    MAZE_START: [
        "Welcome to the relationship maze. Try not to get lost immediately.",
        "Cooperative evaluation grid active. One ship, two heads. Try to agree.",
    ],
    MAZE_DISAGREE: [
        "Left. No, right. Excellent teamwork.",
        "Your navigation committee has failed to reach consensus.",
        "The vessel has stopped because you two cannot agree on a direction.",
    ],
    MAZE_AGREE: [
        "Interesting. You coordinated for three seconds.",
        "Consensus achieved! The laws of physics are pleasantly surprised.",
    ],
    MAZE_WALL: [
        "Wall detected. Strategy questionable.",
        "The maze is not difficult. Your communication is.",
    ],
    FACING_GOOD: [
        "Remarkable. Both test subjects are acknowledging each other's existence.",
        "Optimal team alignment detected. Keep looking toward each other.",
    ],
    FACING_WRONG: [
        "Perhaps looking at your teammate would be useful.",
        "Your partner is over there. Just saying.",
        "The alien recommends turning toward each other before hitting a wall.",
    ],
    FACE_LOST: [
        "I appear to have misplaced one human. Please return to observation range.",
        "Central Vienium observation lost visual on one crew member.",
    ],
    MAZE_STUCK: [
        "This maze is not exactly advanced alien architecture.",
        "The walls do not move. You, however, are not moving either.",
    ],
    MAZE_COMPLETE: [
        "Against all available evidence, you coordinated.",
        "Central Vienium is deeply confused. Mission accepted.",
    ],
    SUBWAY_START: [
        "Congratulations. You escaped the maze. Unfortunately, you are now under arrest!",
        "Welcome to the Central Vienium Transit Authority. Run.",
    ],
    SUBWAY_VOICE: [
        "Voice command recognized. Try not to scream.",
        "Decent vocal projection. Now dodge the next obstacle.",
    ],
    SUBWAY_ESCALATE: [
        "Transit speed increasing. Please remain calm.",
        "You appear to be improving... I dislike this development.",
    ],
    SUBWAY_CAUGHT: [
        "Enough. Central Vienium Transit Police has intercepted the runners.",
        "Custody enforced! That was an admirable sprint, humans.",
    ],

    PLAYER_DOWN: [
        "Central Vienium is reconsidering your recruitment.",
        "That could have gone better. Substantially better.",
    ],
    PLAYER_LOST: [
        "Custody enforced permanently. Better luck in the next life cycle.",
    ],
    UNKNOWN: [
        "Central Vienium has several questions about that decision.",
    ],
};

class VoiceService {
    constructor() {
        this.backendAvailable = null; // null = unverified, true/false
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingPromise = null;
        this.currentAudio = null;
        this.isSpeaking = false;
        this.lastRoastTimes = {};
        this.audioUnlocked = false;
        this.audioCtx = null;

        // Auto-unlock on first user interaction anywhere
        if (typeof window !== "undefined") {
            const autoUnlock = () => {
                this.unlockAudio();
                window.removeEventListener("pointerdown", autoUnlock);
                window.removeEventListener("keydown", autoUnlock);
            };
            window.addEventListener("pointerdown", autoUnlock, { once: true, capture: true });
            window.addEventListener("keydown", autoUnlock, { once: true, capture: true });
        }
    }

    unlockAudio() {
        this.audioUnlocked = true;
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx && this.audioCtx.state === "suspended") {
                this.audioCtx.resume().catch(() => {});
            }
        } catch (e) {}

        if (this.currentAudio && this.currentAudio.paused) {
            this.currentAudio.volume = 0.85;
            this.currentAudio.play().catch(() => {});
        }
        return true;
    }

    stopSpeaking() {
        if (this._currentSpeakResolver) {
            try { this._currentSpeakResolver(true); } catch (e) {}
            this._currentSpeakResolver = null;
        }
        // Stop AudioContext source if active
        if (this._currentSource) {
            try {
                this._currentSource.stop();
            } catch (e) {}
            this._currentSource = null;
        }
        // Stop Audio element fallback if active
        if (this.currentAudio) {
            try {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
            } catch (e) {}
            this.currentAudio = null;
        }
        this.isSpeaking = false;
    }

    // Helper: fetch with timeout
    async _fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }

    // Check if Flask backend is currently responsive
    async checkHealth() {
        try {
            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/health`, {}, 2000);
            if (res.ok) {
                const data = await res.json();
                this.backendAvailable = data.status === "ok";
                return this.backendAvailable;
            }
        } catch (e) {
            // Backend offline
        }
        this.backendAvailable = false;
        return false;
    }

    // Request alien commentary text from /api/roast or local fallback
    async requestRoast(event, context = {}) {
        const category = (event || "UNKNOWN").toUpperCase();

        try {
            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/roast`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event: category, context }),
            }, 3000);

            if (res.ok) {
                const data = await res.json();
                if (data && data.text) {
                    return data.text;
                }
            }
        } catch (err) {
            // Backend unreachable, silent fallback
        }

        // Return curated local fallback roast
        const list = LOCAL_FALLBACK_ROASTS[category] || LOCAL_FALLBACK_ROASTS.UNKNOWN;
        return list[Math.floor(Math.random() * list.length)];
    }

    // Synthesize text with Piper via /api/speak and play WAV audio
    // Uses AudioContext (decodeAudioData + BufferSource) so playback works
    // even when the browser's autoplay gate has closed on the user gesture —
    // AudioContext stays unlocked for the lifetime of the page once resumed.
    async speak(text) {
        if (!text || typeof text !== "string") return false;

        const normalized = text.trim();
        if (!normalized) return false;

        // Ensure AudioContext is created and resumed
        if (!this.audioCtx) {
            try {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn("AudioContext unavailable, falling back to Audio element:", e);
            }
        }
        if (this.audioCtx && this.audioCtx.state === "suspended") {
            await this.audioCtx.resume().catch(() => {});
        }

        try {
            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/speak`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: normalized }),
            }, 8000);

            if (!res.ok) {
                console.warn("Piper synthesis returned non-OK status:", res.status);
                return false;
            }

            const arrayBuffer = await res.arrayBuffer();

            // Stop any currently playing alien speech
            this.stopSpeaking();

            // Prefer AudioContext playback (immune to autoplay policy after unlock)
            const playPromise = (this.audioCtx && this.audioCtx.state !== "closed")
                ? new Promise((resolve) => {
                    this._currentSpeakResolver = resolve;
                    this.audioCtx.decodeAudioData(arrayBuffer, (audioBuffer) => {
                        const source = this.audioCtx.createBufferSource();
                        const gainNode = this.audioCtx.createGain();
                        gainNode.gain.value = 0.9;
                        source.buffer = audioBuffer;
                        source.connect(gainNode);
                        gainNode.connect(this.audioCtx.destination);

                        this.isSpeaking = true;
                        this._currentSource = source;

                        source.onended = () => {
                            this.isSpeaking = false;
                            this._currentSource = null;
                            if (this._currentSpeakResolver === resolve) {
                                this._currentSpeakResolver = null;
                            }
                            resolve(true);
                        };

                        source.start(0);
                    }, (decodeErr) => {
                        console.warn("AudioContext decodeAudioData failed, falling back:", decodeErr);
                        this._speakViaAudioElement(arrayBuffer).then((res) => {
                            if (this._currentSpeakResolver === resolve) {
                                this._currentSpeakResolver = null;
                            }
                            resolve(res);
                        });
                    });
                })
                : this._speakViaAudioElement(arrayBuffer);

            return Promise.race([
                playPromise,
                new Promise((resolve) => setTimeout(() => {
                    if (this._currentSpeakResolver) {
                        try { this._currentSpeakResolver(true); } catch (e) {}
                        this._currentSpeakResolver = null;
                    }
                    resolve(true);
                }, 12000))
            ]);

        } catch (err) {
            console.warn("VoiceService.speak error (continuing without audio):", err);
            return false;
        }
    }

    // Fallback: play ArrayBuffer as audio via blob URL + Audio element
    async _speakViaAudioElement(arrayBuffer) {
        try {
            const blob = new Blob([arrayBuffer], { type: "audio/wav" });
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.volume = 0.9;
            this.currentAudio = audio;
            this.isSpeaking = true;

            return new Promise((resolve) => {
                let cleaned = false;
                const cleanup = () => {
                    if (cleaned) return;
                    cleaned = true;
                    this.isSpeaking = false;
                    URL.revokeObjectURL(audioUrl);
                    if (this.currentAudio === audio) this.currentAudio = null;
                    resolve(true);
                };
                audio.onended = cleanup;
                audio.onerror = cleanup;
                audio.play().catch((e) => {
                    console.warn("Audio element fallback autoplay blocked:", e);
                    cleanup();
                });
            });
        } catch (e) {
            this.isSpeaking = false;
            return false;
        }
    }

    // Speak commentary and return the text (so caller can update HUD simultaneously)
    async commentate(event, context = {}) {
        const text = await this.requestRoast(event, context);
        // Trigger speech asynchronously without blocking caller
        this.speak(text).catch(() => {});
        return text;
    }

    // Start 2-5s microphone recording for player speech input
    async startRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
            return true;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            return true;
        } catch (err) {
            console.warn("Microphone access denied or unavailable:", err);
            return false;
        }
    }

    // Stop microphone recording and return audio Blob
    async stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const mimeType = this.mediaRecorder.mimeType || "audio/webm";
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                // Clean up media tracks so recording indicator turns off
                if (this.mediaRecorder.stream) {
                    this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
                }
                this.mediaRecorder = null;
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    // Transcribe audio Blob using /api/transcribe (Whisper)
    async transcribeAudio(audioBlob) {
        if (!audioBlob) return "";

        try {
            const formData = new FormData();
            formData.append("audio", audioBlob, "speech.webm");

            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/transcribe`, {
                method: "POST",
                body: formData,
            }, 8000);

            if (res.ok) {
                const data = await res.json();
                return data.text || "";
            }
        } catch (err) {
            console.warn("Transcription failed or backend offline:", err);
        }
        return "";
    }

    // Start live command listening for Level 3 Subway Pursuit
    // Supports Whisper via backend + optional Web Speech API + Web Audio API loudness/amplitude
    startCommandRecognition({ onCommand, onVolume, onError }) {
        this.stopCommandRecognition();

        let active = true;
        let audioContext = null;
        let analyser = null;
        let stream = null;
        let recognition = null;
        let volumeRaf = null;

        const normalizeCommand = (text) => {
            if (!text || typeof text !== "string") return null;
            const lower = text.toLowerCase();
            if (lower.includes("left")) return "LEFT";
            if (lower.includes("right")) return "RIGHT";
            if (lower.includes("jump") || lower.includes("hop") || lower.includes("up") || lower.includes("leap")) return "JUMP";
            if (lower.includes("duck") || lower.includes("down") || lower.includes("slide") || lower.includes("crouch")) return "DUCK";
            return null;
        };

        // 1. Set up Web Audio API for RMS loudness
        navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
            if (!active) {
                micStream.getTracks().forEach((t) => t.stop());
                return;
            }
            stream = micStream;
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const checkVolume = () => {
                if (!active) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                const normalizedVol = Math.min(1.0, avg / 128.0);
                if (typeof onVolume === "function") {
                    onVolume(normalizedVol);
                }
                volumeRaf = requestAnimationFrame(checkVolume);
            };
            checkVolume();

            // 2. Set up continuous short-clip recorder for Whisper
            const recorder = new MediaRecorder(stream);
            let chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            recorder.onstop = async () => {
                if (!active || chunks.length === 0) return;
                const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
                chunks = [];
                // Transcribe with Whisper
                const transcript = await this.transcribeAudio(blob);
                const cmd = normalizeCommand(transcript);
                if (cmd && typeof onCommand === "function") {
                    onCommand(cmd, transcript);
                }
                // Cycle short clip recording
                if (active && recorder.state === "inactive") {
                    try {
                        recorder.start();
                        setTimeout(() => {
                            if (active && recorder.state === "recording") recorder.stop();
                        }, 1200);
                    } catch (e) {}
                }
            };

            recorder.start();
            setTimeout(() => {
                if (active && recorder.state === "recording") recorder.stop();
            }, 1200);

            // 3. Local Web Speech API recognition complement
            const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRec) {
                recognition = new SpeechRec();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = "en-US";
                recognition.onresult = (evt) => {
                    for (let i = evt.resultIndex; i < evt.results.length; i++) {
                        const transcript = evt.results[i][0].transcript;
                        const cmd = normalizeCommand(transcript);
                        if (cmd && typeof onCommand === "function") {
                            onCommand(cmd, transcript);
                        }
                    }
                };
                recognition.onerror = () => {};
                recognition.onend = () => {
                    if (active) {
                        try { recognition.start(); } catch (e) {}
                    }
                };
                try { recognition.start(); } catch (e) {}
            }
        }).catch((err) => {
            console.warn("Microphone listening failed or permission denied:", err);
            if (typeof onError === "function") onError(err);
        });

        this._commandCleanup = () => {
            active = false;
            if (volumeRaf) cancelAnimationFrame(volumeRaf);
            if (recognition) {
                try { recognition.stop(); } catch (e) {}
            }
            if (audioContext && audioContext.state !== "closed") {
                audioContext.close();
            }
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
            }
        };

        return this._commandCleanup;
    }

    stopCommandRecognition() {
        if (typeof this._commandCleanup === "function") {
            this._commandCleanup();
            this._commandCleanup = null;
        }
    }
}

export const voice = new VoiceService();

