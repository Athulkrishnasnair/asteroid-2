// src/services/commentary.js
// Centralized Alien Commentary System (AlienCommentary / commentary)
// Manages subtitle dispatch, speech synthesis throttling, FIFO speech queue,
// mouth flap synchronization for animated sprites, and game statistics tracking.

import { voice } from "./voice.js";

class CommentaryManager {
    constructor() {
        this.dialogueListeners = new Set();
        this.mouthListeners = new Set();

        this.minIntervalMs = 1200; // 1.2s minimum spacing between speech lines
        this.lastSpokenTime = 0;
        this.isSpeaking = false;
        this.isProcessing = false;
        this.speechQueue = [];
        this.lastSpokenText = "";

        // Gameplay statistics for personalized final roast
        this.stats = {
            level1Misses: 0,
            level1Kills: 0,
            level1PowerUps: 0,
            level1GoldenHit: false,
            mazeDisagreements: 0,
            mazeAgreements: 0,
            mazeWallBumps: 0,
            subwayCommands: 0,
            subwayHits: 0,
            subwayDistance: 0,
            p1PowerScore: 78,
            p2PowerScore: 92,
            level4P1Reps: 0,
            level4P2Reps: 0,
            level5Smiles: 0,
            level5Cleared: true,
            p1Expertise: "Programming",
            p2Expertise: "Gaming",
        };
    }

    recordStat(key, increment = 1) {
        if (typeof this.stats[key] === "number") {
            this.stats[key] += increment;
        } else {
            this.stats[key] = increment;
        }
    }

    setStat(key, value) {
        this.stats[key] = value;
    }

    getStats() {
        return { ...this.stats };
    }

    // Register a dialogue box or UI element to receive alien text subtitles
    onDialogue(callback) {
        this.dialogueListeners.add(callback);
        return () => this.dialogueListeners.delete(callback);
    }

    // Register an alien animated sprite to flap mouth during speech
    onMouthFlap(callback) {
        this.mouthListeners.add(callback);
        return () => this.mouthListeners.delete(callback);
    }

    // Dispatches subtitle text to all registered HUDs
    _emitDialogue(text, duration = 4.0) {
        for (const listener of this.dialogueListeners) {
            try {
                listener(text, duration);
            } catch (e) {
                console.warn("Dialogue listener error:", e);
            }
        }
    }

    // Toggles mouth talking animation
    _emitMouth(isTalking) {
        for (const listener of this.mouthListeners) {
            try {
                listener(isTalking);
            } catch (e) {}
        }
    }

    /**
     * Primary entry point to trigger alien commentary.
     * Concept:
     * AlienCommentary.say(text)
     * -> display dialogue immediately
     * -> request Piper via backend
     * -> receive WAV & play
     * -> queue next speech with cooldown
     * -> graceful fallback if Piper or Flask fails
     *
     * @param {string} text - The line of dialogue to speak and display.
     * @param {object} options - { force: boolean, textOnly: boolean, duration: number }
     */
    async say(text, options = {}) {
        if (!text || typeof text !== "string") return false;

        const trimmed = text.trim();
        if (!trimmed) return false;

        const duration = options.duration || Math.max(3.0, trimmed.length * 0.08);

        // 1. ALWAYS display subtitle text immediately
        this._emitDialogue(trimmed, duration);

        if (options.textOnly) {
            return true;
        }

        // 2. If force, stop ongoing speech and prioritize
        if (options.force) {
            voice.stopSpeaking();
            this.speechQueue = [{ text: trimmed, options, duration }];
            this._processQueue();
            return true;
        }

        // Prevent identical back-to-back spam within 5 seconds
        const now = Date.now();
        if (trimmed === this.lastSpokenText && now - this.lastSpokenTime < 5000) {
            return false;
        }

        // Keep queue capped at 2 items so commentary stays relevant to current gameplay
        if (this.speechQueue.length >= 2) {
            this.speechQueue.shift();
        }

        this.speechQueue.push({ text: trimmed, options, duration });
        this._processQueue();
        return true;
    }

    async _processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.speechQueue.length > 0) {
            const item = this.speechQueue.shift();
            const now = Date.now();

            // Enforce minimum interval between speeches unless forced
            if (!item.options.force && now - this.lastSpokenTime < this.minIntervalMs) {
                const waitTime = this.minIntervalMs - (now - this.lastSpokenTime);
                await new Promise((r) => setTimeout(r, waitTime));
            }

            this.lastSpokenTime = Date.now();
            this.lastSpokenText = item.text;
            this.isSpeaking = true;
            this._emitMouth(true);

            try {
                // Call Piper TTS via backend
                await voice.speak(item.text);
            } catch (err) {
                console.warn("CommentaryManager speech synthesis error (continuing):", err);
            } finally {
                this.isSpeaking = false;
                this._emitMouth(false);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Helper to fetch contextual roast text and speak it.
     * @param {string} eventCategory - e.g. "MAZE_START", "FACING_WRONG", "SUBWAY_JUMP"
     * @param {object} context - gameplay metadata
     * @param {object} options - say options
     */
    async roast(eventCategory, context = {}, options = {}) {
        try {
            const text = await voice.requestRoast(eventCategory, context);
            if (text) {
                return this.say(text, options);
            }
        } catch (err) {
            console.warn("CommentaryManager.roast error:", err);
        }
        return false;
    }
}

export const commentary = new CommentaryManager();
export const AlienCommentary = commentary;
