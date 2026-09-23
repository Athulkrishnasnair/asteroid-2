// src/game/HUD.js
// Retro sci-fi HUD and Central Vienium commentary ticker.
// Rendered directly to the stage to remain unaffected by world camera shake.

import { Container, Graphics, Text } from "pixi.js";
import { commentary } from "../services/commentary.js";

const JOKES = {
    missStreak: [
        "That aim was legally questionable.",
        "Space is 99.9% empty, but you're really proving it.",
        "Warning: Lasers cost taxpayer credits. Aim better.",
        "Central Vienium ballistic assessment: poor.",
        "Were you aiming at a different sector?",
    ],
    alienKill: [
        "One alien down. Paperwork increased by 40%.",
        "Custody enforced with extreme prejudice.",
        "That alien had an overdue parking permit anyway.",
        "Target liquidated. File in triplicate.",
        "One less unregistered organism in Sector CV-07.",
    ],
    playerHit: [
        "Vessel hull integrity compromised. Blame the shipyard.",
        "Central Vienium is reconsidering your pilot license.",
        "Tactical maneuver failed successfully.",
        "Ouch. That will not buff out easily.",
        "Friendly reminder: shields are for deflecting, not tasting.",
    ],
    powerUp: [
        "Emergency thrusters engaged! Speed limits were merely guidelines.",
        "Right-click protocol: running away at 175% velocity.",
        "Ion overdrive active! Try not to hit an asteroid.",
        "Velocity boost authorized by Celestial Custody Authority.",
    ],
    finalLife: [
        "FINAL LIFE! Protocol escalated to: CALCULATED PANIC.",
        "Warning: Aliens are now legally required to give you space.",
        "Critical integrity! Do not sneeze near the dashboard.",
    ],
    goldenSpawn: [
        "PRIORITY TARGET! Golden interceptor detected in sector!",
        "High-value contraband craft incoming! Destroy it for clearance!",
        "Gold vessel spotted! Non-custodial termination authorized!",
    ],
    goldenHit: [
        "GOLDEN SHIP DOWN! Level 1 clear! Triplicate filing approved!",
        "Target neutralized! Custody protocol fulfilled with honor!",
    ],
    survival: [
        "You've survived 30 seconds. Central Vienium dispatch is surprised.",
        "Airspace violation ongoing. Good evasion skills noted.",
    ],
};

export class HUD {
    constructor(app, soundManager) {
        this.app = app;
        this.soundManager = soundManager;
        this.container = new Container();

        this.fontFamily = "'Press Start 2P', monospace";

        // Top bar container
        this.topBar = new Container();
        this.container.addChild(this.topBar);

        // Header: Sector / Level
        this.sectorText = new Text({
            text: "SECTOR: CV-07 // LVL 1",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 14,
                fill: "#9CA3AF",
                letterSpacing: 1,
            },
        });
        this.sectorText.x = 24;
        this.sectorText.y = 20;
        this.topBar.addChild(this.sectorText);

        // Objective indicator
        this.objectiveText = new Text({
            text: "OBJ: SURVIVE & DESTROY GOLDEN SHIP",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 12,
                fill: "#FBBF24",
                align: "center",
            },
        });
        this.objectiveText.anchor.set(0.5, 0);
        this.topBar.addChild(this.objectiveText);

        // Score display
        this.scoreText = new Text({
            text: "SCORE: 000000",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 16,
                fill: "#22C55E",
            },
        });
        this.scoreText.anchor.set(1, 0);
        this.topBar.addChild(this.scoreText);

        // Lives display
        this.livesText = new Text({
            text: "LIVES: ❤️❤️❤️❤️❤️",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 14,
                fill: "#EF4444",
            },
        });
        this.livesText.x = 24;
        this.livesText.y = 48;
        this.topBar.addChild(this.livesText);

        // Power-up status badge
        this.powerUpBadge = new Text({
            text: "BOOST: READY [R-CLICK]",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 12,
                fill: "#38BDF8",
            },
        });
        this.powerUpBadge.x = 24;
        this.powerUpBadge.y = 74;
        this.topBar.addChild(this.powerUpBadge);

        // Transmission / Commentary banner container (bottom center)
        this.dialogueBox = new Container();
        this.dialogueBg = new Graphics();
        this.dialogueBox.addChild(this.dialogueBg);

        this.dialogueTitle = new Text({
            text: "CCA DISPATCH //",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 11,
                fill: "#F59E0B",
            },
        });
        this.dialogueTitle.x = 16;
        this.dialogueTitle.y = 10;
        this.dialogueBox.addChild(this.dialogueTitle);

        this.dialogueMessage = new Text({
            text: "",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 12,
                fill: "#E5E7EB",
                wordWrap: true,
                wordWrapWidth: 600,
            },
        });
        this.dialogueMessage.x = 16;
        this.dialogueMessage.y = 30;
        this.dialogueBox.addChild(this.dialogueMessage);

        this.dialogueBox.visible = false;
        this.dialogueBox.alpha = 0;
        this.container.addChild(this.dialogueBox);

        // Dialogue state
        this.dialogueTimer = 0;
        this.dialogueDuration = 4.0;
        this.jokeCooldown = 0;
        this.lastJokeCategory = null;

        // Register with centralized commentary manager
        this.unsubscribeCommentary = commentary.onDialogue((text, duration) => {
            this.showDialogue(text, duration);
        });

        this.resize();
    }

    // Show dialogue box with subtitle text
    showDialogue(text, duration = 4.0) {
        if (!text) return;
        this.dialogueMessage.text = `"${text}"`;
        this.dialogueBox.visible = true;
        this.dialogueBox.alpha = 1;
        this.dialogueTimer = duration;

        if (this.soundManager) {
            this.soundManager.playDialogue();
        }
    }

    // Adapt layout when screen dimensions change
    resize() {
        const width = this.app.screen.width;
        const height = this.app.screen.height;

        this.objectiveText.x = width / 2;
        this.objectiveText.y = 20;

        this.scoreText.x = width - 24;
        this.scoreText.y = 20;

        // Position dialogue at bottom center
        const boxWidth = Math.min(680, width - 48);
        const boxHeight = 64;
        this.dialogueMessage.style.wordWrapWidth = boxWidth - 32;

        this.dialogueBg.clear();
        this.dialogueBg.roundRect(0, 0, boxWidth, boxHeight, 6);
        this.dialogueBg.fill({ color: 0x111827, alpha: 0.9 });
        this.dialogueBg.stroke({ color: 0x374151, width: 2 });

        this.dialogueBox.x = (width - boxWidth) / 2;
        this.dialogueBox.y = height - 90;
    }

    updateScore(score) {
        const padded = String(score).padStart(6, "0");
        this.scoreText.text = `SCORE: ${padded}`;
    }

    updateLives(lives, maxLives) {
        const hearts = "❤️".repeat(Math.max(0, lives));
        const empty = "🖤".repeat(Math.max(0, maxLives - lives));
        this.livesText.text = `LIVES: ${hearts}${empty}`;
    }

    updatePowerUp(isActive, remainingTime) {
        if (isActive) {
            this.powerUpBadge.text = `BOOST: ${remainingTime.toFixed(1)}s [ACTIVE]`;
            this.powerUpBadge.style.fill = "#FCD34D";
        } else {
            this.powerUpBadge.text = "BOOST: READY [R-CLICK]";
            this.powerUpBadge.style.fill = "#38BDF8";
        }
    }

    setObjective(text, color = "#FBBF24") {
        this.objectiveText.text = text;
        this.objectiveText.style.fill = color;
    }

    // Trigger a witty gameplay joke with cooldown and priority, spoken via Piper
    triggerJoke(category, force = false) {
        if (!force && this.jokeCooldown > 0) return;
        const list = JOKES[category];
        if (!list || list.length === 0) return;

        const filtered = list.filter((j) => j !== this.lastJokeText);
        const joke = filtered[Math.floor(Math.random() * filtered.length)] || list[0];
        this.lastJokeText = joke;
        this.lastJokeCategory = category;
        this.jokeCooldown = 4.5; // Cooldown between gameplay jokes

        // Central commentary speaks via Piper and emits to HUD subtitle
        commentary.say(joke, { force, duration: this.dialogueDuration });
    }

    update(deltaTime) {
        const dtSeconds = deltaTime / 60;

        if (this.jokeCooldown > 0) {
            this.jokeCooldown -= dtSeconds;
        }

        if (this.dialogueTimer > 0) {
            this.dialogueTimer -= dtSeconds;
            if (this.dialogueTimer <= 0.6) {
                // Fade out smoothly during the last 0.6s
                this.dialogueBox.alpha = Math.max(0, this.dialogueTimer / 0.6);
            }
            if (this.dialogueTimer <= 0) {
                this.dialogueBox.visible = false;
                this.dialogueBox.alpha = 0;
            }
        }
    }

    reset() {
        this.updateScore(0);
        this.updateLives(5, 5);
        this.updatePowerUp(false, 0);
        this.setObjective("OBJ: SURVIVE & DESTROY GOLDEN SHIP");
        this.dialogueBox.visible = false;
        this.dialogueBox.alpha = 0;
        this.dialogueTimer = 0;
        this.jokeCooldown = 2.0;
    }

    destroy() {
        if (this.unsubscribeCommentary) {
            this.unsubscribeCommentary();
            this.unsubscribeCommentary = null;
        }
        this.container.destroy({ children: true });
    }
}

