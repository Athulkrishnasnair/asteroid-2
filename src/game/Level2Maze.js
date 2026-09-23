// src/game/Level2Maze.js
// Level 2 — Co-op Maze with SINGLE Shared Player Avatar
// Both players steer the SAME vessel using head direction consensus.
// Features: 450ms hold latch, prominent on-screen directional hints,
// verbal Piper instructions, majority vote smoothing, and instant manual fallback.

import { Container, Graphics, Sprite, Text } from "pixi.js";
import { commentary } from "../services/commentary.js";
import { resolveDirectionalCommand } from "./level2Consensus.js";

// Clean, broad-corridor 12 columns x 7 rows maze
// 1 = Wall, 0 = Corridor, 2 = Exit Chamber Pad
const MAZE_GRID = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 2, 2, 1],
    [1, 1, 1, 0, 1, 1, 1, 0, 1, 2, 2, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export class Level2Maze {
    constructor({ app, input, soundManager, textures, trackingHud, onComplete }) {
        this.app = app;
        this.input = input;
        this.soundManager = soundManager;
        this.textures = textures || {};
        this.trackingHud = trackingHud;
        this.onComplete = onComplete || (() => {});

        this.container = new Container();
        this.mazeLayer = new Container();
        this.hazardLayer = new Container();
        this.exitLayer = new Container();
        this.playerLayer = new Container();
        this.uiLayer = new Container();

        this.container.addChild(this.mazeLayer);
        this.container.addChild(this.hazardLayer);
        this.container.addChild(this.exitLayer);
        this.container.addChild(this.playerLayer);
        this.container.addChild(this.uiLayer);

        this.cols = MAZE_GRID[0].length;
        this.rows = MAZE_GRID.length;
        this.tileSize = 56;
        this.offsetX = 0;
        this.offsetY = 0;

        // SINGLE shared player avatar (with forgiving collision radius)
        this.player = {
            x: 0,
            y: 0,
            radius: 14, // Forgiving collision radius so ship never gets snagged on corners
            speed: 5.2, // Brisk, responsive speed
            invulnerableTimer: 0,
            sprite: new Container(),
            aura: null,
            disagreeIcon: null,
            animTimer: 0,
        };

        // 5-heart system
        this.lives = 5;
        this.maxLives = 5;
        this.gameOver = false;

        // Laser Hazards across corridor paths (mounted flush between facing wall blocks)
        this.lasers = [
            {
                id: "laser_north",
                tileX1: 3.5,
                tileY1: 1.0,
                tileX2: 3.5,
                tileY2: 2.0,
                activeDuration: 2.2,
                warningDuration: 0.8,
                inactiveDuration: 1.8,
                timer: 0,
                state: "ACTIVE",
                gfx: new Graphics(),
            },
            {
                id: "laser_center",
                tileX1: 6.5,
                tileY1: 3.0,
                tileX2: 6.5,
                tileY2: 4.0,
                activeDuration: 2.4,
                warningDuration: 0.8,
                inactiveDuration: 1.6,
                timer: 1.2,
                state: "INACTIVE",
                gfx: new Graphics(),
            },
            {
                id: "laser_south",
                tileX1: 5.5,
                tileY1: 5.0,
                tileX2: 5.5,
                tileY2: 6.0,
                activeDuration: 2.0,
                warningDuration: 0.8,
                inactiveDuration: 2.0,
                timer: 0.6,
                state: "ACTIVE",
                gfx: new Graphics(),
            },
        ];

        for (const laser of this.lasers) {
            this.hazardLayer.addChild(laser.gfx);
        }

        // Exit chamber zone
        this.exitArea = {
            tileX: 9.5,
            tileY: 3.5,
            radius: 65,
            x: 0,
            y: 0,
        };

        // Head tracking consensus state
        this.p1Dir = "CENTER";
        this.p2Dir = "CENTER";
        this.facingState = false;
        this.visionOffline = false;
        this.consensusDir = "CENTER";
        this.isDisagreed = false;
        this.holdUntil = 0;
        this.directionHistory = { p1: [], p2: [] };
        this.commandState = {
            current: "CENTER",
            previous: "CENTER",
            lastChangedAt: 0,
            graceUntil: 0,
        };
        this.playerVisible = { p1: false, p2: false };

        // Exit sync timer (1.5s required)
        this.syncTimeRequired = 1.5;
        this.syncTimer = 0;
        this.levelCompleted = false;

        // Alien roast cooldowns
        this.roastCooldown = 4.0;
        this.wallBumpCooldown = 0;
        this.firstConsensusAchieved = false;
        this.exitPromptSpoken = false;

        this.initVisuals();
        this.initPlayer();
        this.initHUD();
        this.recalculateLayout();

        // Initial tutorial voice commentary
        setTimeout(() => {
            commentary.say("Both of you, look RIGHT to steer the shared ship forward.", { force: true });
        }, 600);
    }

    recalculateLayout() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        // Reserve 175px at bottom for Tracking HUD
        const playableH = Math.max(280, sh - 180);

        const tileW = Math.floor(sw / (this.cols + 1));
        const tileH = Math.floor(playableH / (this.rows + 0.6));
        this.tileSize = Math.max(38, Math.min(68, Math.min(tileW, tileH)));

        this.offsetX = Math.floor((sw - this.cols * this.tileSize) / 2);
        this.offsetY = Math.floor((playableH - this.rows * this.tileSize) / 2) + 30;

        this.exitArea.x = this.offsetX + this.exitArea.tileX * this.tileSize;
        this.exitArea.y = this.offsetY + this.exitArea.tileY * this.tileSize;

        // Place player at start tile [1, 1]
        this.player.x = this.offsetX + 1.5 * this.tileSize;
        this.player.y = this.offsetY + 1.5 * this.tileSize;

        this.drawMaze();
    }

    initVisuals() {
        this.exitBeacon = new Graphics();
        this.exitLayer.addChild(this.exitBeacon);
    }

    drawMaze() {
        this.mazeLayer.removeChildren();
        const g = new Graphics();

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = MAZE_GRID[r][c];
                const px = this.offsetX + c * this.tileSize;
                const py = this.offsetY + r * this.tileSize;

                if (cell === 1) {
                    // Solid Wall Block
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x18202f });
                    g.stroke({ color: 0x3b4a63, width: 2 });

                    // Inner panel accent
                    g.rect(px + 4, py + 4, this.tileSize - 8, this.tileSize - 8);
                    g.fill({ color: 0x0f172a });
                } else if (cell === 2) {
                    // Exit chamber floor
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x064e3b, alpha: 0.75 });
                    g.stroke({ color: 0x10b981, width: 2 });
                } else {
                    // Open Corridor floor
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x090d16, alpha: 0.95 });
                    g.stroke({ color: 0x1e293b, width: 1 });

                    // Subtle navigational guidance dot
                    g.circle(px + this.tileSize / 2, py + this.tileSize / 2, 2.5);
                    g.fill({ color: 0x38bdf8, alpha: 0.35 });
                }
            }
        }

        this.mazeLayer.addChild(g);
    }

    initPlayer() {
        this.player.sprite.removeChildren();

        // Shared ship sprite
        if (this.textures.playerFrames && this.textures.playerFrames.length > 0) {
            const spr = new Sprite(this.textures.playerFrames[0]);
            spr.anchor.set(0.5);
            spr.width = 46;
            spr.height = 46;
            this.player.shipSpr = spr;
            this.player.sprite.addChild(spr);
        } else {
            const g = new Graphics();
            g.circle(0, 0, 18);
            g.fill({ color: 0x38bdf8 });
            g.stroke({ color: 0xffffff, width: 2 });
            this.player.sprite.addChild(g);
        }

        // Shared glow ring
        this.player.aura = new Graphics();
        this.player.aura.circle(0, 0, 24);
        this.player.aura.stroke({ color: 0x34d399, width: 3 });
        this.player.sprite.addChild(this.player.aura);

        // Disagreement icon above ship
        this.player.disagreeIcon = new Text({
            text: "⚠️ DISAGREED",
            style: {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                fill: "#EF4444",
            },
        });
        this.player.disagreeIcon.anchor.set(0.5, 1);
        this.player.disagreeIcon.y = -26;
        this.player.disagreeIcon.visible = false;
        this.player.sprite.addChild(this.player.disagreeIcon);

        // Shared vessel badge
        const badge = new Text({
            text: "SHARED VESSEL",
            style: {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 7,
                fill: "#38BDF8",
            },
        });
        badge.anchor.set(0.5, 0);
        badge.y = 24;
        this.player.sprite.addChild(badge);

        this.playerLayer.addChild(this.player.sprite);
    }

    initHUD() {
        this.fontFamily = "'Press Start 2P', monospace";

        // Top objective banner
        this.headerText = new Text({
            text: "LEVEL 2: COOPERATIVE MAZE // BOTH PLAYERS STEER WITH HEAD DIRECTION",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 10,
                fill: "#9CA3AF",
                letterSpacing: 1,
            },
        });
        this.headerText.x = 18;
        this.headerText.y = 12;
        this.uiLayer.addChild(this.headerText);

        // 5-Heart Life Display
        this.livesText = new Text({
            text: "LIVES: ❤️❤️❤️❤️❤️",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 9.5,
                fill: "#EF4444",
            },
        });
        this.livesText.x = 18;
        this.livesText.y = 30;
        this.uiLayer.addChild(this.livesText);

        // Game Over Overlay Container
        this.gameOverBox = new Container();
        const goBg = new Graphics();
        goBg.roundRect(0, 0, 480, 140, 8);
        goBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        goBg.stroke({ color: 0xef4444, width: 3 });
        this.gameOverBox.addChild(goBg);

        const goTitle = new Text({
            text: "MAZE NAVIGATION FAILED",
            style: { fontFamily: this.fontFamily, fontSize: 13, fill: "#EF4444" },
        });
        goTitle.anchor.set(0.5);
        goTitle.x = 240;
        goTitle.y = 38;
        this.gameOverBox.addChild(goTitle);

        const goSub = new Text({
            text: "PRESS R OR CLICK TO RETRY",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#FBBF24" },
        });
        goSub.anchor.set(0.5);
        goSub.x = 240;
        goSub.y = 76;
        this.gameOverBox.addChild(goSub);

        const retryBtn = new Container();
        const rBg = new Graphics();
        rBg.roundRect(0, 0, 180, 30, 4);
        rBg.fill({ color: 0x1e293b });
        rBg.stroke({ color: 0x38bdf8, width: 1.5 });
        retryBtn.addChild(rBg);

        const rText = new Text({
            text: "[ RETRY RUN ]",
            style: { fontFamily: this.fontFamily, fontSize: 8, fill: "#38BDF8" },
        });
        rText.anchor.set(0.5);
        rText.x = 90;
        rText.y = 15;
        retryBtn.addChild(rText);

        retryBtn.x = 150;
        retryBtn.y = 96;
        retryBtn.eventMode = "static";
        retryBtn.cursor = "pointer";
        retryBtn.on("pointertap", () => this.restart());
        this.gameOverBox.addChild(retryBtn);

        this.gameOverBox.x = (this.app.screen.width - 480) / 2;
        this.gameOverBox.y = (this.app.screen.height - 140) / 2;
        this.gameOverBox.visible = false;
        this.uiLayer.addChild(this.gameOverBox);

        // Prominent CV Guidance & Consensus Prompt Card
        this.guideCard = new Container();
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, 680, 36, 4);
        cardBg.fill({ color: 0x0c121e, alpha: 0.95 });
        cardBg.stroke({ color: 0x38bdf8, width: 2 });
        this.guideCard.addChild(cardBg);
        this.guideBg = cardBg;

        this.guideText = new Text({
            text: "P1: [CENTER]  P2: [CENTER]  >>>  HINT: BOTH LOOK RIGHT [→ →]",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 9,
                fill: "#38BDF8",
            },
        });
        this.guideText.anchor.set(0.5);
        this.guideText.x = 340;
        this.guideText.y = 18;
        this.guideCard.addChild(this.guideText);

        this.guideCard.x = (this.app.screen.width - 680) / 2;
        this.guideCard.y = 30;
        this.uiLayer.addChild(this.guideCard);

        // Subtitle dialogue box
        this.dialogueBox = new Container();
        this.dialogueBg = new Graphics();
        this.dialogueBox.addChild(this.dialogueBg);

        this.dialogueText = new Text({
            text: "",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 11,
                fill: "#E5E7EB",
                wordWrap: true,
                wordWrapWidth: 620,
            },
        });
        this.dialogueText.x = 16;
        this.dialogueText.y = 12;
        this.dialogueBox.addChild(this.dialogueText);
        this.dialogueBox.visible = false;
        this.uiLayer.addChild(this.dialogueBox);

        this.dialogueTimer = 0;

        // Register subtitle listener with central commentary manager
        this.unsubscribeCommentary = commentary.onDialogue((text, duration) => {
            this.showDialogue(text, duration);
        });
    }

    showDialogue(text, duration = 4.0) {
        if (!text) return;
        this.dialogueText.text = `"${text}"`;
        const width = this.app.screen.width;
        const boxW = Math.min(660, width - 36);
        const boxH = 50;

        this.dialogueBg.clear();
        this.dialogueBg.roundRect(0, 0, boxW, boxH, 4);
        this.dialogueBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        this.dialogueBg.stroke({ color: 0x38bdf8, width: 2 });

        this.dialogueBox.x = (width - boxW) / 2;
        this.dialogueBox.y = Math.max(68, this.offsetY - boxH - 6);
        this.dialogueBox.visible = true;
        this.dialogueBox.alpha = 1;
        this.dialogueTimer = duration;

        if (this.soundManager) {
            this.soundManager.playDialogue();
        }
    }

    updateTracking(results) {
        if (!results) return;
        this.visionOffline = !!results.offline;
        this.facingState = !!results.facingEachOther;

        const p1Visible = !!(results.player1 && results.player1.visible);
        const p2Visible = !!(results.player2 && results.player2.visible);
        this.playerVisible = { p1: p1Visible, p2: p2Visible };

        const p1Dir = p1Visible ? (results.player1.direction || "CENTER") : "CENTER";
        const p2Dir = p2Visible ? (results.player2.direction || "CENTER") : "CENTER";

        this.p1Dir = p1Dir;
        this.p2Dir = p2Dir;

        this.directionHistory.p1.push(p1Dir);
        this.directionHistory.p2.push(p2Dir);
        if (this.directionHistory.p1.length > 5) this.directionHistory.p1.shift();
        if (this.directionHistory.p2.length > 5) this.directionHistory.p2.shift();

        if (!p1Visible && !p2Visible) {
            const now = performance.now();
            this.commandState.graceUntil = Math.max(this.commandState.graceUntil, now + 450);
        }

        if (this.trackingHud) {
            this.trackingHud.updateResults(results);
        }
    }

    update(deltaTime) {
        if (this.gameOver) {
            if (this.input && (this.input.wasPressed("r") || this.input.wasPressed("R"))) {
                this.restart();
            }
            return;
        }

        if (this.levelCompleted) return;

        const dtSec = deltaTime / 60;
        this.player.animTimer += dtSec;

        if (this.roastCooldown > 0) this.roastCooldown -= dtSec;
        if (this.wallBumpCooldown > 0) this.wallBumpCooldown -= dtSec;

        // Damage invulnerability timer and visual flicker
        if (this.player.invulnerableTimer > 0) {
            this.player.invulnerableTimer -= dtSec;
            this.player.sprite.alpha = Math.floor(this.player.invulnerableTimer * 10) % 2 === 0 ? 0.35 : 0.9;
        } else {
            this.player.sprite.alpha = 1.0;
        }

        // 1. Process Steering (CV Cooperative Agreement + Manual Fallback)
        this.handleSteering(deltaTime, dtSec);

        // 2. Update Laser Hazards & Check Collisions
        this.updateLasers(dtSec);

        // 3. Check Exit Pad & Mutual Facing Condition
        this.handleExitCheck(dtSec);

        // 4. Dialogue fading
        if (this.dialogueTimer > 0) {
            this.dialogueTimer -= dtSec;
            if (this.dialogueTimer <= 0.5) {
                this.dialogueBox.alpha = Math.max(0, this.dialogueTimer / 0.5);
            }
            if (this.dialogueTimer <= 0) {
                this.dialogueBox.visible = false;
            }
        }

        // 5. Update player sprite transform
        this.player.sprite.x = this.player.x;
        this.player.sprite.y = this.player.y;
    }

    updateLasers(dtSec) {
        for (const laser of this.lasers) {
            laser.timer += dtSec;
            const cycleTotal = laser.activeDuration + laser.inactiveDuration + laser.warningDuration;
            const cyclePos = laser.timer % cycleTotal;

            if (cyclePos < laser.activeDuration) {
                laser.state = "ACTIVE";
            } else if (cyclePos < laser.activeDuration + laser.inactiveDuration) {
                laser.state = "INACTIVE";
            } else {
                laser.state = "WARNING";
            }

            const x1 = this.offsetX + laser.tileX1 * this.tileSize;
            const y1 = this.offsetY + laser.tileY1 * this.tileSize;
            const x2 = this.offsetX + laser.tileX2 * this.tileSize;
            const y2 = this.offsetY + laser.tileY2 * this.tileSize;

            laser.gfx.clear();

            // Draw emitter node caps
            laser.gfx.circle(x1, y1, 5);
            laser.gfx.fill({ color: 0x334155 });
            laser.gfx.stroke({ color: 0x94a3b8, width: 1.5 });

            laser.gfx.circle(x2, y2, 5);
            laser.gfx.fill({ color: 0x334155 });
            laser.gfx.stroke({ color: 0x94a3b8, width: 1.5 });

            if (laser.state === "ACTIVE") {
                // Intense red glowing laser beam
                const pulse = Math.sin(Date.now() * 0.02) * 2;
                // Outer glow
                laser.gfx.moveTo(x1, y1);
                laser.gfx.lineTo(x2, y2);
                laser.gfx.stroke({ color: 0xef4444, width: 8 + pulse, alpha: 0.45 });

                // Inner core
                laser.gfx.moveTo(x1, y1);
                laser.gfx.lineTo(x2, y2);
                laser.gfx.stroke({ color: 0xffffff, width: 3, alpha: 0.95 });

                // Check collision with player
                if (this.player.invulnerableTimer <= 0 && !this.gameOver && !this.levelCompleted) {
                    if (this.checkLaserCollision(x1, y1, x2, y2, this.player.x, this.player.y, this.player.radius)) {
                        this.loseHeart();
                    }
                }
            } else if (laser.state === "WARNING") {
                // Flashing yellow warning tracer
                const warnAlpha = Math.sin(Date.now() * 0.03) > 0 ? 0.8 : 0.2;
                laser.gfx.moveTo(x1, y1);
                laser.gfx.lineTo(x2, y2);
                laser.gfx.stroke({ color: 0xf59e0b, width: 2, alpha: warnAlpha });
            } else {
                // Inactive: subtle dotted guide line
                laser.gfx.moveTo(x1, y1);
                laser.gfx.lineTo(x2, y2);
                laser.gfx.stroke({ color: 0x475569, width: 1, alpha: 0.25 });
            }
        }
    }

    checkLaserCollision(x1, y1, x2, y2, px, py, radius) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
            return Math.hypot(px - x1, py - y1) <= radius;
        }
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
        return distSq <= (radius + 3) * (radius + 3);
    }

    updateLivesText() {
        if (!this.livesText) return;
        const hearts = "❤️".repeat(Math.max(0, this.lives));
        const empty = "🖤".repeat(Math.max(0, this.maxLives - this.lives));
        this.livesText.text = `LIVES: ${hearts}${empty}`;
    }

    loseHeart() {
        if (this.gameOver || this.levelCompleted || this.player.invulnerableTimer > 0) return;
        this.lives--;
        this.updateLivesText();

        if (this.soundManager) {
            this.soundManager.playPlayerHit();
        }

        this.player.invulnerableTimer = 1.5;
        this.player.sprite.alpha = 0.4;
        setTimeout(() => {
            if (this.player && this.player.sprite && !this.player.sprite.destroyed) {
                this.player.sprite.alpha = 1.0;
            }
        }, 300);

        if (this.lives <= 0) {
            this.gameOver = true;
            if (this.gameOverBox) this.gameOverBox.visible = true;
            if (this.soundManager) this.soundManager.playCancel();
            commentary.say("Vessel destroyed by security laser grid! Protocol terminated.", { textOnly: true });
        }
    }

    resetHearts() {
        this.lives = this.maxLives;
        this.updateLivesText();
        this.gameOver = false;
        if (this.gameOverBox) this.gameOverBox.visible = false;
    }

    restart() {
        this.lives = this.maxLives;
        this.updateLivesText();
        this.gameOver = false;
        if (this.gameOverBox) this.gameOverBox.visible = false;

        // Reset player to start tile [1.5, 1.5]
        this.player.x = this.offsetX + 1.5 * this.tileSize;
        this.player.y = this.offsetY + 1.5 * this.tileSize;
        this.player.invulnerableTimer = 0;
        this.player.sprite.alpha = 1.0;
        this.syncTimer = 0;
    }

    handleSteering(deltaTime, dtSec) {
        let vx = 0;
        let vy = 0;
        const step = this.player.speed * (deltaTime / 1.0);
        const now = performance.now();

        // Check for manual keyboard input first (WASD for P1 or Arrow Keys for P2)
        let manualActive = false;
        let mX = 0;
        let mY = 0;

        if (this.input.isDown("w") || this.input.isDown("W")) mY -= 1;
        if (this.input.isDown("s") || this.input.isDown("S")) mY += 1;
        if (this.input.isDown("a") || this.input.isDown("A")) mX -= 1;
        if (this.input.isDown("d") || this.input.isDown("D")) mX += 1;

        if (this.input.isDown("ArrowUp")) mY -= 1;
        if (this.input.isDown("ArrowDown")) mY += 1;
        if (this.input.isDown("ArrowLeft")) mX -= 1;
        if (this.input.isDown("ArrowRight")) mX += 1;

        if (mX !== 0 || mY !== 0) {
            manualActive = true;
            const len = Math.hypot(mX, mY) || 1;
            vx = (mX / len) * step;
            vy = (mY / len) * step;

            this.isDisagreed = false;
            this.player.disagreeIcon.visible = false;
            this.player.aura.stroke({ color: 0x38bdf8, width: 3 });

            this.guideText.text = `MANUAL CONTROL ACTIVE: [WASD / ARROW KEYS]`;
            this.guideText.style.fill = "#38BDF8";
            this.guideBg.stroke({ color: 0x38bdf8, width: 2 });
        } else if (!this.visionOffline) {
            const command = resolveDirectionalCommand({
                p1Dir: this.p1Dir,
                p2Dir: this.p2Dir,
                p1Visible: this.playerVisible.p1,
                p2Visible: this.playerVisible.p2,
                history: [...this.directionHistory.p1.slice(-3), ...this.directionHistory.p2.slice(-3)],
                previousCommand: this.commandState.current,
                lastChangedAt: this.commandState.lastChangedAt,
                now,
                holdUntil: this.holdUntil,
                graceUntil: this.commandState.graceUntil,
            });

            if (command.newHoldUntil) {
                this.holdUntil = command.newHoldUntil;
            }

            if (command.action === "MOVE") {
                this.isDisagreed = false;
                this.player.disagreeIcon.visible = false;
                this.player.aura.stroke({ color: 0x34d399, width: 3 });
                this.player.sprite.rotation = 0;

                if (command.direction !== this.commandState.current) {
                    this.commandState.current = command.direction;
                    this.commandState.lastChangedAt = now;
                }

                vx = command.dx * step;
                vy = command.dy * step;

                // Update visual guidance indicator for judges
                const p1Tag = command.p1Matches ? `${this.p1Dir} ✓` : this.p1Dir;
                const p2Tag = command.p2Matches ? `${this.p2Dir} ✓` : this.p2Dir;
                this.guideText.text = `P1: ${p1Tag}  |  P2: ${p2Tag}  >>>  COMMAND: MOVE ${command.direction}`;
                this.guideText.style.fill = "#34D399";
                this.guideBg.stroke({ color: 0x34d399, width: 2 });

                // Spoken acknowledgment when first consensus is achieved
                if (!this.firstConsensusAchieved) {
                    this.firstConsensusAchieved = true;
                    commentary.say("Good! Consensus achieved. Your brains have briefly synchronized.", { force: true });
                    commentary.recordStat("mazeAgreements");
                }
            } else if (command.isDisagreed) {
                this.isDisagreed = true;
                this.player.disagreeIcon.visible = true;
                this.player.aura.stroke({ color: 0xf87171, width: 3 });
                this.player.sprite.rotation = Math.sin(this.player.animTimer * 12) * 0.08;

                this.guideText.text = `P1: ${this.p1Dir} ⚠️  |  P2: ${this.p2Dir} ⚠️  >>>  DISAGREED (VESSEL HALTED)`;
                this.guideText.style.fill = "#F87171";
                this.guideBg.stroke({ color: 0xf87171, width: 2 });

                commentary.recordStat("mazeDisagreements");
                if (this.roastCooldown <= 0) {
                    this.roastCooldown = 5.0;
                    commentary.roast("MAZE_DISAGREE");
                }
            } else {
                // Neutral / searching
                this.player.disagreeIcon.visible = false;
                this.player.aura.stroke({ color: 0x38bdf8, width: 2 });
                this.guideText.text = `P1: ${this.p1Dir}  |  P2: ${this.p2Dir}  >>>  HINT: BOTH LOOK RIGHT [→ →] OR USE WASD`;
                this.guideText.style.fill = "#9CA3AF";
                this.guideBg.stroke({ color: 0x38bdf8, width: 1.5 });
            }
        }

        if (vx !== 0 || vy !== 0) {
            this.moveAndSlide(vx, vy);
        }
    }

    moveAndSlide(vx, vy) {
        // Independent X and Y axis testing allows smooth sliding along walls
        const nextX = this.player.x + vx;
        if (!this.isCollidingWithWall(nextX, this.player.y, this.player.radius)) {
            this.player.x = nextX;
        } else if (this.wallBumpCooldown <= 0) {
            this.wallBumpCooldown = 4.0;
            commentary.recordStat("mazeWallBumps");
            if (this.soundManager) this.soundManager.playCrash();
            commentary.roast("MAZE_WALL", {}, { textOnly: true });
        }

        const nextY = this.player.y + vy;
        if (!this.isCollidingWithWall(this.player.x, nextY, this.player.radius)) {
            this.player.y = nextY;
        }
    }

    isCollidingWithWall(x, y, radius) {
        const minCol = Math.floor((x - radius - this.offsetX) / this.tileSize);
        const maxCol = Math.floor((x + radius - this.offsetX) / this.tileSize);
        const minRow = Math.floor((y - radius - this.offsetY) / this.tileSize);
        const maxRow = Math.floor((y + radius - this.offsetY) / this.tileSize);

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
                    return true;
                }
                if (MAZE_GRID[r][c] === 1) {
                    const tileX = this.offsetX + c * this.tileSize;
                    const tileY = this.offsetY + r * this.tileSize;
                    const closestX = Math.max(tileX, Math.min(x, tileX + this.tileSize));
                    const closestY = Math.max(tileY, Math.min(y, tileY + this.tileSize));
                    const dx = x - closestX;
                    const dy = y - closestY;
                    if (dx * dx + dy * dy < radius * radius) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    handleExitCheck(dtSec) {
        const dist = Math.hypot(this.player.x - this.exitArea.x, this.player.y - this.exitArea.y);
        const insideExit = dist <= this.exitArea.radius;

        // Pulse beacon animation
        this.exitBeacon.clear();
        const pulse = Math.sin(Date.now() * 0.006);
        this.exitBeacon.circle(this.exitArea.x, this.exitArea.y, this.exitArea.radius + pulse * 4);
        this.exitBeacon.stroke({ color: insideExit ? 0x10b981 : 0x059669, width: 3 });
        this.exitBeacon.fill({ color: 0x10b981, alpha: insideExit ? 0.45 : 0.15 });

        if (insideExit && !this.exitPromptSpoken) {
            this.exitPromptSpoken = true;
            commentary.say("You reached the gateway. Both of you, look directly at each other to synchronize.", { force: true });
        }

        // Win condition: Inside exit pad AND (facing each other OR manual override) for 1.5s
        const canSync = insideExit && (this.visionOffline || this.facingState || !this.playerVisible.p2);

        if (canSync) {
            this.syncTimer += dtSec;
            const progress = Math.min(1.0, this.syncTimer / this.syncTimeRequired);

            if (this.trackingHud) {
                this.trackingHud.setSyncProgress(progress, true);
            }

            this.guideText.text = `GATEWAY STABILIZING: [${Math.round(progress * 100)}%] // MAINTAIN EYE CONTACT`;
            this.guideText.style.fill = "#10B981";
            this.guideBg.stroke({ color: 0x10b981, width: 2 });

            // Fill exit beacon progress
            this.exitBeacon.circle(this.exitArea.x, this.exitArea.y, this.exitArea.radius * progress);
            this.exitBeacon.fill({ color: 0x34d399, alpha: 0.6 });

            if (this.syncTimer >= this.syncTimeRequired) {
                this.completeLevel();
            }
        } else {
            this.syncTimer = Math.max(0, this.syncTimer - dtSec * 1.5);
            if (this.trackingHud) {
                this.trackingHud.setSyncProgress(this.syncTimer / this.syncTimeRequired, insideExit);
            }
        }
    }

    completeLevel() {
        if (this.levelCompleted) return;
        this.levelCompleted = true;

        console.log("LEVEL 2 CO-OP MAZE COMPLETED!");

        if (this.soundManager) {
            this.soundManager.playLevelComplete();
        }

        commentary.say("Against all available evidence... you coordinated. Central Vienium is deeply confused. Mission accepted.", { force: true });

        // Advance to Level 3 Transit Police cutscene
        setTimeout(() => {
            this.onComplete();
        }, 3200);
    }

    destroy() {
        if (this.unsubscribeCommentary) this.unsubscribeCommentary();
        this.container.destroy({ children: true });
    }
}
