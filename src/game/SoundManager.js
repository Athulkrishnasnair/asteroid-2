import sfxShoot from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Blow 1.wav";
import sfxExplosion from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Explosion2.wav";
import sfxHitDamage from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Hit damage 1.wav";
import sfxPowerUp from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Fruit collect 1.wav";
import sfxGoldSpawn from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Balloon start riding 2.wav";
import sfxGoldHit from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Boss hit 1.wav";
import sfxLevelComplete from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Balloon ride 1.wav";
import sfxDialogue from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Text 1.wav";
import sfxJump from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Balloon Pop 1.wav";
import sfxDuck from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Suck 1V2.wav";
import sfxCrash from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Block Break 1.wav";
import sfxSelect from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Confirm 1.wav";
import sfxCancel from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Cancel 1.wav";
import sfxBubble from "../assets/8-16bit+Sound+assets+(x25)/sfx pack/Bubble 1.wav";

export class SoundManager {
    constructor() {
        this.unlocked = false;
        this.sounds = {};
        this.lastPlayTimes = {};

        // Sound definitions with volume and minimum spacing (ms) to prevent spam
        this.soundConfigs = {
            shoot: { src: sfxShoot, volume: 0.35, minInterval: 90 },
            explosion: { src: sfxExplosion, volume: 0.45, minInterval: 60 },
            playerHit: { src: sfxHitDamage, volume: 0.6, minInterval: 200 },
            powerUp: { src: sfxPowerUp, volume: 0.55, minInterval: 250 },
            goldSpawn: { src: sfxGoldSpawn, volume: 0.5, minInterval: 500 },
            goldHit: { src: sfxGoldHit, volume: 0.6, minInterval: 200 },
            levelComplete: { src: sfxLevelComplete, volume: 0.65, minInterval: 500 },
            dialogue: { src: sfxDialogue, volume: 0.25, minInterval: 80 },
            jump: { src: sfxJump, volume: 0.45, minInterval: 120 },
            duck: { src: sfxDuck, volume: 0.45, minInterval: 120 },
            crash: { src: sfxCrash, volume: 0.55, minInterval: 150 },
            select: { src: sfxSelect, volume: 0.4, minInterval: 100 },
            cancel: { src: sfxCancel, volume: 0.4, minInterval: 100 },
            repCount: { src: sfxSelect, volume: 0.5, minInterval: 150 },
            countdown: { src: sfxDialogue, volume: 0.4, minInterval: 200 },
            smileAlert: { src: sfxBubble, volume: 0.5, minInterval: 300 },
            laughFail: { src: sfxCancel, volume: 0.6, minInterval: 400 },
        };

        this.initPools();
        this.bindUnlock();
    }

    // Pre-initialize pools of Audio objects for zero-latency playback
    initPools() {
        try {
            for (const [key, config] of Object.entries(this.soundConfigs)) {
                // Pool of 3 cloned audio elements per sound to allow overlapping instances
                this.sounds[key] = [
                    new Audio(config.src),
                    new Audio(config.src),
                    new Audio(config.src),
                ];
                for (const audio of this.sounds[key]) {
                    audio.volume = config.volume;
                    audio.preload = "auto";
                }
                this.lastPlayTimes[key] = 0;
            }
        } catch (err) {
            console.warn("SoundManager: Audio initialization warning:", err);
        }
    }

    // Unlock browser audio upon first user gesture
    bindUnlock() {
        const unlock = () => {
            this.unlocked = true;
            try {
                if (this.sounds.shoot && this.sounds.shoot[0]) {
                    this.sounds.shoot[0].play().then(() => {
                        this.sounds.shoot[0].pause();
                        this.sounds.shoot[0].currentTime = 0;
                    }).catch(() => {});
                }
            } catch (e) {}
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };

        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
    }

    // Play a sound from its pool if minimum interval has passed
    play(key) {
        try {
            const config = this.soundConfigs[key];
            const pool = this.sounds[key];
            if (!config || !pool || pool.length === 0) return;

            const now = Date.now();
            if (now - (this.lastPlayTimes[key] || 0) < config.minInterval) {
                return; // Throttle to prevent distorted sound stacking
            }
            this.lastPlayTimes[key] = now;

            // Find an idle audio element or reuse the earliest one
            let audioToPlay = pool.find((a) => a.paused || a.ended);
            if (!audioToPlay) {
                audioToPlay = pool[0];
            }

            audioToPlay.currentTime = 0;
            audioToPlay.volume = config.volume;
            const playPromise = audioToPlay.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {});
            }
        } catch (err) {
            // Audio failure should never crash the game
        }
    }

    playShoot() { this.play("shoot"); }
    playAlienExplosion() { this.play("explosion"); }
    playPlayerHit() { this.play("playerHit"); }
    playPowerUp() { this.play("powerUp"); }
    playGoldenSpawn() { this.play("goldSpawn"); }
    playGoldenHit() { this.play("goldHit"); }
    playLevelComplete() { this.play("levelComplete"); }
    playDialogue() { this.play("dialogue"); }
    playJump() { this.play("jump"); }
    playDuck() { this.play("duck"); }
    playCrash() { this.play("crash"); }
    playSelect() { this.play("select"); }
    playCancel() { this.play("cancel"); }
    playRepCount() { this.play("repCount"); }
    playCountdown() { this.play("countdown"); }
    playSmileAlert() { this.play("smileAlert"); }
    playLaughFail() { this.play("laughFail"); }
}


