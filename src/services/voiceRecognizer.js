// src/services/voiceRecognizer.js
// Voice command adapter for Central Vienium Level 3 Subway Runner.
// Supports browser Web Speech API (active experiment) and Whisper (fully intact backup).
// Provides continuous listening, auto-restart, strict normalization, deduplication,
// and real-time debug state reporting.

import { voice } from "./voice.js";

// Valid vocabulary strictly allowed for Level 3
export const VALID_COMMANDS = Object.freeze(["LEFT", "RIGHT", "UP", "DOWN", "JUMP", "DUCK"]);

/**
 * Normalizes speech transcript:
 * - lowercase
 * - trim whitespace
 * - remove punctuation
 * - normalize repeated whitespace
 */
export function normalizeTranscript(text) {
    if (!text || typeof text !== "string") return "";
    return text
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Extracts valid Level 3 commands from normalized text in utterance order.
 * Strictly recognizes: left, right, up, down, jump, duck.
 */
export function extractCommands(normalizedText) {
    if (!normalizedText) return [];
    const tokens = normalizedText.split(" ").filter(Boolean);
    const matches = [];

    for (const token of tokens) {
        if (token === "left") matches.push("LEFT");
        else if (token === "right") matches.push("RIGHT");
        else if (token === "up" || token === "jump" || token === "hop") matches.push("UP");
        else if (token === "down" || token === "duck" || token === "slide") matches.push("DOWN");
    }

    return matches;
}

/**
 * Browser Web Speech API recognizer implementation
 */
export class WebSpeechRecognizer {
    constructor() {
        this.type = "webspeech";
        this.recognition = null;
        this.isActive = false;
        this.isListening = false;
        this._explicitlyStopped = false;
        this._isStarting = false;

        // Callbacks
        this._onCommand = null;
        this._onVolume = null;
        this._onError = null;
        this._onDebugState = null;

        // AudioContext for RMS volume analysis
        this._audioContext = null;
        this._analyser = null;
        this._stream = null;
        this._volumeRaf = null;

        // Deduplication & cooldown tracking
        this._handledCommandCounts = new Map();
        this._lastCommandTime = 0;
        this._commandCooldownMs = 180; // Short refractory to prevent acoustic stutter
        this._restartTimeout = null;

        // Debug state
        this._rawTranscript = "";
        this._normalizedTranscript = "";
        this._detectedCommand = "NONE";
        this._status = "IDLE";
        this._lastError = "NONE";
        this._lastAction = "NONE";
    }

    static isSupported() {
        if (typeof window === "undefined") return false;
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    start({ onCommand, onVolume, onError, onDebugState } = {}) {
        this.stop();

        this._onCommand = onCommand;
        this._onVolume = onVolume;
        this._onError = onError;
        this._onDebugState = onDebugState;

        this.isActive = true;
        this._explicitlyStopped = false;
        this._status = "INITIALIZING";
        this._lastError = "NONE";
        this._reportDebug();

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            this._status = "UNSUPPORTED";
            this._lastError = "Web Speech API not supported in this browser";
            this._reportDebug();
            if (typeof this._onError === "function") {
                this._onError(new Error("SpeechRecognition not supported"));
            }
            return;
        }

        // 1. Initialize microphone stream for Web Audio volume loudness
        this._initAudioAnalyser();

        // 2. Initialize and start Web Speech Recognition
        this._initRecognition(SpeechRec);
    }

    _initAudioAnalyser() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((micStream) => {
                if (this._explicitlyStopped || !this.isActive) {
                    micStream.getTracks().forEach((t) => t.stop());
                    return;
                }
                this._stream = micStream;
                try {
                    this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this._analyser = this._audioContext.createAnalyser();
                    this._analyser.fftSize = 256;
                    const source = this._audioContext.createMediaStreamSource(micStream);
                    source.connect(this._analyser);

                    const dataArray = new Uint8Array(this._analyser.frequencyBinCount);
                    const checkVol = () => {
                        if (this._explicitlyStopped || !this.isActive) return;
                        this._analyser.getByteFrequencyData(dataArray);
                        let sum = 0;
                        for (let i = 0; i < dataArray.length; i++) {
                            sum += dataArray[i];
                        }
                        const avg = sum / dataArray.length;
                        const vol = Math.min(1.0, avg / 128.0);
                        if (typeof this._onVolume === "function") {
                            this._onVolume(vol);
                        }
                        this._volumeRaf = requestAnimationFrame(checkVol);
                    };
                    checkVol();
                } catch (e) {
                    console.warn("[WebSpeechRecognizer] AudioContext volume init warning:", e);
                }
            })
            .catch((err) => {
                console.warn("[WebSpeechRecognizer] Microphone getUserMedia notice:", err);
            });
    }

    _initRecognition(SpeechRec) {
        try {
            this.recognition = new SpeechRec();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            // Primary preference: en-IN (Indian English) when supported, fallback to en-US
            this.recognition.lang = "en-IN";
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                this._isStarting = false;
                this.isListening = true;
                this._status = "LISTENING (en-IN)";
                this._reportDebug();
            };

            this.recognition.onresult = (event) => {
                if (this._explicitlyStopped || !this.isActive) return;
                this._handleRecognitionResult(event);
            };

            this.recognition.onerror = (event) => {
                const errorType = event.error || "unknown";
                if (errorType === "no-speech") {
                    return;
                }
                if (errorType === "aborted") {
                    return;
                }

                // If en-IN fails with language-not-supported, fallback to en-US
                if (errorType === "language-not-supported" && this.recognition.lang === "en-IN") {
                    console.warn("[WebSpeechRecognizer] en-IN not supported on this engine, falling back to en-US");
                    this.recognition.lang = "en-US";
                    return;
                }

                console.warn("[WebSpeechRecognizer] Recognition error:", errorType);
                this._lastError = errorType;
                this._status = "ERROR";
                this._reportDebug();

                if (errorType === "not-allowed" || errorType === "service-not-allowed") {
                    this._explicitlyStopped = true;
                    if (typeof this._onError === "function") {
                        this._onError(new Error(`Microphone permission ${errorType}`));
                    }
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this._isStarting = false;

                if (!this._explicitlyStopped && this.isActive) {
                    this._status = "RESTARTING";
                    this._reportDebug();
                    this._scheduleRestart();
                } else {
                    this._status = "STOPPED";
                    this._reportDebug();
                }
            };

            this._startRecognition();
        } catch (err) {
            console.error("[WebSpeechRecognizer] Failed to create SpeechRecognition:", err);
            this._lastError = err.message || "Failed to initialize";
            this._status = "ERROR";
            this._reportDebug();
            if (typeof this._onError === "function") {
                this._onError(err);
            }
        }
    }

    _startRecognition() {
        if (!this.recognition || this._explicitlyStopped || !this.isActive) return;
        if (this._isStarting || this.isListening) return;

        try {
            this._isStarting = true;
            this.recognition.start();
        } catch (e) {
            this._isStarting = false;
            if (e.name !== "InvalidStateError") {
                console.warn("[WebSpeechRecognizer] Start warning:", e);
            }
        }
    }

    _scheduleRestart() {
        if (this._restartTimeout) clearTimeout(this._restartTimeout);
        this._restartTimeout = setTimeout(() => {
            if (!this._explicitlyStopped && this.isActive && !this.isListening) {
                this._startRecognition();
            }
        }, 150);
    }

    _handleRecognitionResult(event) {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (!res || !res[0]) continue;

            const rawText = res[0].transcript || "";
            const normalized = normalizeTranscript(rawText);
            const commands = extractCommands(normalized);

            this._rawTranscript = rawText;
            this._normalizedTranscript = normalized;

            const alreadyEmitted = this._handledCommandCounts.get(i) || 0;

            if (commands.length > alreadyEmitted) {
                for (let c = alreadyEmitted; c < commands.length; c++) {
                    const cmd = commands[c];
                    const now = performance.now();

                    if (now - this._lastCommandTime >= this._commandCooldownMs) {
                        this._lastCommandTime = now;
                        this._detectedCommand = cmd;
                        this._lastAction = cmd;

                        console.log(`[WebSpeechRecognizer] Action triggered: ${cmd} (raw: "${rawText}")`);

                        if (typeof this._onCommand === "function") {
                            this._onCommand(cmd, rawText);
                        }
                    }
                }
                this._handledCommandCounts.set(i, commands.length);
            } else if (commands.length > 0) {
                this._detectedCommand = commands[commands.length - 1];
            } else {
                this._detectedCommand = "NONE";
            }

            if (res.isFinal && i > 20) {
                this._handledCommandCounts.delete(i - 20);
            }
        }

        this._reportDebug();
    }

    _reportDebug() {
        if (typeof this._onDebugState === "function") {
            this._onDebugState({
                listening: this.isListening,
                rawTranscript: this._rawTranscript,
                normalized: this._normalizedTranscript,
                detectedCommand: this._detectedCommand,
                status: this._status,
                lastError: this._lastError,
                lastAction: this._lastAction,
            });
        }
    }

    stop() {
        this.isActive = false;
        this.isListening = false;
        this._explicitlyStopped = true;
        this._isStarting = false;

        if (this._restartTimeout) {
            clearTimeout(this._restartTimeout);
            this._restartTimeout = null;
        }

        if (this._volumeRaf) {
            cancelAnimationFrame(this._volumeRaf);
            this._volumeRaf = null;
        }

        if (this.recognition) {
            try {
                this.recognition.onresult = null;
                this.recognition.onerror = null;
                this.recognition.onend = null;
                this.recognition.onstart = null;
                this.recognition.stop();
            } catch (e) {}
            this.recognition = null;
        }

        if (this._audioContext && this._audioContext.state !== "closed") {
            try { this._audioContext.close(); } catch (e) {}
            this._audioContext = null;
        }

        if (this._stream) {
            try {
                this._stream.getTracks().forEach((track) => track.stop());
            } catch (e) {}
            this._stream = null;
        }

        this._handledCommandCounts.clear();
        this._status = "STOPPED";
        this._reportDebug();
    }
}

/**
 * Whisper recognizer fallback adapter
 * Wraps existing Whisper backend pipeline without deleting or modifying it.
 */
export class WhisperRecognizer {
    constructor() {
        this.type = "whisper";
        this.isActive = false;
        this.isListening = false;
        this._stopCleanup = null;
        this._onDebugState = null;

        this._rawTranscript = "";
        this._normalizedTranscript = "";
        this._detectedCommand = "NONE";
        this._status = "IDLE";
        this._lastError = "NONE";
        this._lastAction = "NONE";
    }

    start({ onCommand, onVolume, onError, onDebugState } = {}) {
        this.stop();

        this.isActive = true;
        this.isListening = true;
        this._onDebugState = onDebugState;
        this._status = "LISTENING (WHISPER BACKUP)";
        this._reportDebug();

        this._stopCleanup = voice.startCommandRecognition({
            onCommand: (cmd, rawTranscript) => {
                this._rawTranscript = rawTranscript || "";
                this._normalizedTranscript = normalizeTranscript(rawTranscript);
                this._detectedCommand = cmd;
                this._lastAction = cmd;
                this._reportDebug();

                if (typeof onCommand === "function") {
                    onCommand(cmd, rawTranscript);
                }
            },
            onVolume: (vol) => {
                if (typeof onVolume === "function") onVolume(vol);
            },
            onError: (err) => {
                this._status = "ERROR";
                this._lastError = (err && err.message) || "Whisper service error";
                this._reportDebug();
                if (typeof onError === "function") onError(err);
            },
        });
    }

    _reportDebug() {
        if (typeof this._onDebugState === "function") {
            this._onDebugState({
                listening: this.isListening,
                rawTranscript: this._rawTranscript,
                normalized: this._normalizedTranscript,
                detectedCommand: this._detectedCommand,
                status: this._status,
                lastError: this._lastError,
                lastAction: this._lastAction,
            });
        }
    }

    stop() {
        this.isActive = false;
        this.isListening = false;
        if (typeof this._stopCleanup === "function") {
            this._stopCleanup();
            this._stopCleanup = null;
        }
        this._status = "STOPPED";
        this._reportDebug();
    }
}

/**
 * SpeechRecognitionManager / Recognizer Factory
 * By default creates WebSpeechRecognizer (primary: en-IN).
 * Fallback to WhisperRecognizer when Web Speech is unsupported or requested.
 */
export function createVoiceRecognizer(mode = "webspeech") {
    if (mode === "whisper" || (!WebSpeechRecognizer.isSupported() && mode === "webspeech")) {
        return new WhisperRecognizer();
    }
    return new WebSpeechRecognizer();
}

export const SpeechRecognitionManager = {
    create: createVoiceRecognizer,
    WebSpeech: WebSpeechRecognizer,
    Whisper: WhisperRecognizer,
    normalize: normalizeTranscript,
    extract: extractCommands,
};

