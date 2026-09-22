// src/game/Level4PowerMeter.js
// Level 4 — Central Vienium Alien Power-O-Meter
// Players assume a power pose / raise their hands to charge an absurd fictional
// cosmic power meter. Generates fictional Alien Units scores and reactions.
// Added: Webcam PiP overlay so players can see themselves during the pose test.

import { Container, Graphics, Text, Sprite, AnimatedSprite } from "pixi.js";
import { commentary } from "../services/commentary.js";

export class Level4PowerMeter {
    constructor({ app, input, soundManager, textures, faceTracker, onComplete }) {
        this.app = app;
        this.input = input;
        this.soundManager = soundManager;
        this.textures = textures || {};
        this.faceTracker = faceTracker;
        this.onComplete = onComplete || (() => {});

        this.container = new Container();
        this.bgLayer = new Container();
        this.meterLayer = new Container();
        this.uiLayer = new Container();

        this.container.addChild(this.bgLayer);
        this.container.addChild(this.meterLayer);
        this.container.addChild(this.uiLayer);

        this.fontFamily = "'Press Start 2P', monospace";

        this.state = "INTRO"; // INTRO -> CHARGING -> REVEAL_P1 -> REVEAL_P2 -> COMPLETE
        this.stateTimer = 0;

        // Fictional Game Scores
        this.p1Score = 0;
        this.p2Score = 0;
        this.targetP1Score = 78 + Math.floor(Math.random() * 18);
        this.targetP2Score = 84 + Math.floor(Math.random() * 14);

        this.chargeProgress = 0; // 0 to 1
        this.poseDetected = false;
        this.chargingSparks = [];
        this._pipRaf = null;

        this.initBackground();
        this.initMeterUI();
        this.initAlienBox();
        this.initDialogueBox();
        this.initWebcamPiP();

        // Start Level 4 Introduction
        setTimeout(() => {
            commentary.say(
                "Central Vienium Physical Evaluation Protocol active. Behold: THE ALIEN POWER-O-METER! Assume the cosmic power pose to charge the capacitor.",
                { force: true }
            );
        }, 500);
    }

    initBackground() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, sw, sh);
        bg.fill({ color: 0x070a10 });
        this.bgLayer.addChild(bg);

        // Grid lines
        const grid = new Graphics();
        for (let x = 0; x < sw; x += 40) {
            grid.moveTo(x, 0);
            grid.lineTo(x, sh);
        }
        for (let y = 0; y < sh; y += 40) {
            grid.moveTo(0, y);
            grid.lineTo(sw, y);
        }
        grid.stroke({ color: 0x1e293b, width: 1, alpha: 0.3 });
        this.bgLayer.addChild(grid);
    }

    initMeterUI() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        // Title Header
        this.titleText = new Text({
            text: "LEVEL 4: ALIEN POWER-O-METER // CELESTIAL POWER POSE TEST",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 11,
                fill: "#F59E0B",
                letterSpacing: 1,
            },
        });
        this.titleText.anchor.set(0.5, 0);
        this.titleText.x = sw / 2;
        this.titleText.y = 16;
        this.uiLayer.addChild(this.titleText);

        // Instruction sub-banner
        this.subText = new Text({
            text: "RAISE BOTH HANDS / STRIKE A POWER POSE (OR HOLD SPACEBAR TO CHARGE)",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 9,
                fill: "#38BDF8",
            },
        });
        this.subText.anchor.set(0.5, 0);
        this.subText.x = sw / 2;
        this.subText.y = 38;
        this.uiLayer.addChild(this.subText);

        // Large Dual Meters Frame
        const meterBoxW = Math.min(680, sw - 40);
        const meterBoxH = 220;
        const meterBoxX = (sw - meterBoxW) / 2;
        const meterBoxY = 70;

        const frameBg = new Graphics();
        frameBg.roundRect(meterBoxX, meterBoxY, meterBoxW, meterBoxH, 8);
        frameBg.fill({ color: 0x0b111e, alpha: 0.95 });
        frameBg.stroke({ color: 0x38bdf8, width: 3 });
        this.meterLayer.addChild(frameBg);

        // Player 1 Gauge Container
        this.p1Meter = new Container();
        this.p1Meter.x = meterBoxX + 40;
        this.p1Meter.y = meterBoxY + 30;

        const p1Title = new Text({
            text: "PLAYER 1: PILOT",
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: "#22C55E" },
        });
        this.p1Meter.addChild(p1Title);

        this.p1BarBg = new Graphics();
        this.p1BarBg.roundRect(0, 26, 260, 36, 4);
        this.p1BarBg.fill({ color: 0x1f2937 });
        this.p1BarBg.stroke({ color: 0x374151, width: 2 });
        this.p1Meter.addChild(this.p1BarBg);

        this.p1BarFill = new Graphics();
        this.p1Meter.addChild(this.p1BarFill);

        this.p1ScoreText = new Text({
            text: "CHARGING...",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#FFF" },
        });
        this.p1ScoreText.x = 10;
        this.p1ScoreText.y = 38;
        this.p1Meter.addChild(this.p1ScoreText);

        this.p1UnitsText = new Text({
            text: "-- ALIEN UNITS",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#22C55E" },
        });
        this.p1UnitsText.x = 0;
        this.p1UnitsText.y = 74;
        this.p1Meter.addChild(this.p1UnitsText);

        this.meterLayer.addChild(this.p1Meter);

        // Player 2 Gauge Container
        this.p2Meter = new Container();
        this.p2Meter.x = meterBoxX + meterBoxW - 300;
        this.p2Meter.y = meterBoxY + 30;

        const p2Title = new Text({
            text: "PLAYER 2: GUNNER",
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: "#FBBF24" },
        });
        this.p2Meter.addChild(p2Title);

        this.p2BarBg = new Graphics();
        this.p2BarBg.roundRect(0, 26, 260, 36, 4);
        this.p2BarBg.fill({ color: 0x1f2937 });
        this.p2BarBg.stroke({ color: 0x374151, width: 2 });
        this.p2Meter.addChild(this.p2BarBg);

        this.p2BarFill = new Graphics();
        this.p2Meter.addChild(this.p2BarFill);

        this.p2ScoreText = new Text({
            text: "CHARGING...",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#FFF" },
        });
        this.p2ScoreText.x = 10;
        this.p2ScoreText.y = 38;
        this.p2Meter.addChild(this.p2ScoreText);

        this.p2UnitsText = new Text({
            text: "-- ALIEN UNITS",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#FBBF24" },
        });
        this.p2UnitsText.x = 0;
        this.p2UnitsText.y = 74;
        this.p2Meter.addChild(this.p2UnitsText);

        this.meterLayer.addChild(this.p2Meter);

        // Center Cosmic Capacitor
        this.capacitorGlow = new Graphics();
        this.capacitorGlow.circle(meterBoxX + meterBoxW / 2, meterBoxY + 110, 32);
        this.capacitorGlow.fill({ color: 0x38bdf8, alpha: 0.3 });
        this.meterLayer.addChild(this.capacitorGlow);

        this.capacitorCore = new Graphics();
        this.capacitorCore.circle(meterBoxX + meterBoxW / 2, meterBoxY + 110, 18);
        this.capacitorCore.fill({ color: 0x38bdf8 });
        this.meterLayer.addChild(this.capacitorCore);

        // Overall Power Indicator
        this.overallText = new Text({
            text: "CAPACITOR CHARGE: 0%",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 10,
                fill: "#38BDF8",
            },
        });
        this.overallText.anchor.set(0.5);
        this.overallText.x = meterBoxX + meterBoxW / 2;
        this.overallText.y = meterBoxY + meterBoxH - 36;
        this.meterLayer.addChild(this.overallText);

        // Manual Trigger button for demo guarantee
        this.chargeBtn = new Container();
        const btnBg = new Graphics();
        btnBg.roundRect(0, 0, 260, 36, 4);
        btnBg.fill({ color: 0x1e293b });
        btnBg.stroke({ color: 0xf59e0b, width: 2 });
        this.chargeBtn.addChild(btnBg);

        const btnText = new Text({
            text: "[ HOLD TO BOOST POWER ]",
            style: { fontFamily: this.fontFamily, fontSize: 8, fill: "#F59E0B" },
        });
        btnText.anchor.set(0.5);
        btnText.x = 130;
        btnText.y = 18;
        this.chargeBtn.addChild(btnText);

        this.chargeBtn.x = (sw - 260) / 2;
        this.chargeBtn.y = meterBoxY + meterBoxH + 12;
        this.chargeBtn.eventMode = "static";
        this.chargeBtn.cursor = "pointer";

        let buttonHeld = false;
        this.chargeBtn.on("pointerdown", () => { buttonHeld = true; });
        this.chargeBtn.on("pointerup", () => { buttonHeld = false; });
        this.chargeBtn.on("pointerupoutside", () => { buttonHeld = false; });
        this._isButtonHeld = () => buttonHeld;

        this.uiLayer.addChild(this.chargeBtn);
    }

    initAlienBox() {
        // Alien Animated face in corner
        this.alienCard = new Container();
        const cardW = 120;
        const cardH = 95;
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, cardH, 4);
        cardBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        cardBg.stroke({ color: 0xf59e0b, width: 2 });
        this.alienCard.addChild(cardBg);

        if (this.textures.alienFrames && this.textures.alienFrames.length > 0) {
            this.alienFace = new AnimatedSprite(this.textures.alienFrames);
            this.alienFace.anchor.set(0.5);
            this.alienFace.x = cardW / 2;
            this.alienFace.y = 44;
            this.alienFace.width = 54;
            this.alienFace.height = 54;
            this.alienFace.animationSpeed = 0.08;
            this.alienFace.play();
            this.alienCard.addChild(this.alienFace);
        }

        const tag = new Text({
            text: "EVALUATOR",
            style: { fontFamily: this.fontFamily, fontSize: 7, fill: "#F59E0B" },
        });
        tag.anchor.set(0.5, 0);
        tag.x = cardW / 2;
        tag.y = 76;
        this.alienCard.addChild(tag);

        this.alienCard.x = this.app.screen.width - 136;
        this.alienCard.y = 70;
        this.uiLayer.addChild(this.alienCard);

        this.unsubscribeMouth = commentary.onMouthFlap((talking) => {
            if (this.alienFace) {
                this.alienFace.animationSpeed = talking ? 0.22 : 0.06;
            }
        });
    }

    initDialogueBox() {
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
                wordWrapWidth: 640,
            },
        });
        this.dialogueText.x = 16;
        this.dialogueText.y = 12;
        this.dialogueBox.addChild(this.dialogueText);
        this.dialogueBox.visible = false;
        this.uiLayer.addChild(this.dialogueBox);

        this.dialogueTimer = 0;

        this.unsubscribeCommentary = commentary.onDialogue((text, duration) => {
            this.showDialogue(text, duration);
        });
    }

    showDialogue(text, duration = 4.0) {
        if (!text) return;
        this.dialogueText.text = `"${text}"`;
        const width = this.app.screen.width;
        const boxW = Math.min(680, width - 36);
        const boxH = 50;

        this.dialogueBg.clear();
        this.dialogueBg.roundRect(0, 0, boxW, boxH, 4);
        this.dialogueBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        this.dialogueBg.stroke({ color: 0xf59e0b, width: 2 });

        this.dialogueBox.x = (width - boxW) / 2;
        this.dialogueBox.y = this.app.screen.height - boxH - 16;
        this.dialogueBox.visible = true;
        this.dialogueBox.alpha = 1;
        this.dialogueTimer = duration;

        if (this.soundManager) {
            this.soundManager.playDialogue();
        }
    }

    update(deltaTime) {
        const dtSec = deltaTime / 60;
        this.stateTimer += dtSec;

        // Animate capacitor core
        const pulse = Math.sin(Date.now() * 0.008);
        this.capacitorGlow.scale.set(1.0 + pulse * 0.15);

        // Check for charge inputs: spacebar, button hold, or CV movement
        const isCharging = (
            (this.input && (this.input.isDown(" ") || this.input.isDown("Space"))) ||
            (this._isButtonHeld && this._isButtonHeld()) ||
            this.stateTimer > 4.0 // Auto-progresses so the level never hangs
        );

        if (this.state === "INTRO") {
            if (this.stateTimer >= 3.5 || isCharging) {
                this.state = "CHARGING";
                this.stateTimer = 0;
            }
        } else if (this.state === "CHARGING") {
            // Fill capacitor
            this.chargeProgress = Math.min(1.0, this.chargeProgress + dtSec * 0.35);

            this.overallText.text = `CAPACITOR CHARGE: ${Math.round(this.chargeProgress * 100)}%`;

            // Draw player 1 fill
            this.p1BarFill.clear();
            this.p1BarFill.roundRect(0, 26, 260 * this.chargeProgress, 36, 4);
            this.p1BarFill.fill({ color: 0x22c55e });

            // Draw player 2 fill
            this.p2BarFill.clear();
            this.p2BarFill.roundRect(0, 26, 260 * this.chargeProgress, 36, 4);
            this.p2BarFill.fill({ color: 0xfbbf24 });

            this.p1Score = Math.round(this.targetP1Score * this.chargeProgress);
            this.p2Score = Math.round(this.targetP2Score * this.chargeProgress);
            this.p1ScoreText.text = `${this.p1Score}%`;
            this.p2ScoreText.text = `${this.p2Score}%`;

            if (this.chargeProgress >= 1.0) {
                this.state = "REVEAL_P1";
                this.stateTimer = 0;
                this.revealResults();
            }
        }

        // Dialogue fading
        if (this.dialogueTimer > 0) {
            this.dialogueTimer -= dtSec;
            if (this.dialogueTimer <= 0.4) {
                this.dialogueBox.alpha = Math.max(0, this.dialogueTimer / 0.4);
            }
            if (this.dialogueTimer <= 0) {
                this.dialogueBox.visible = false;
            }
        }
    }

    revealResults() {
        if (this.soundManager) {
            this.soundManager.playLevelComplete();
        }

        this.p1UnitsText.text = `${this.targetP1Score} ALIEN UNITS [VALIDATED]`;
        this.p2UnitsText.text = `${this.targetP2Score} ALIEN UNITS [VALIDATED]`;

        commentary.setStat("p1PowerScore", this.targetP1Score);
        commentary.setStat("p2PowerScore", this.targetP2Score);

        this.subText.text = "POWER TEST COMPLETE // [ CLICK OR SPACE TO ADVANCE ]";
        this.subText.style.fill = "#10B981";

        // Sarcastic Piper alien commentary
        commentary.say(
            `Measurement complete. Player One registers ${this.targetP1Score} alien units. Barely enough to power an oven. Player Two registers ${this.targetP2Score} alien units. Legally suspicious fortitude.`,
            { force: true }
        );

        let advanced = false;
        const advance = () => {
            if (advanced) return;
            advanced = true;
            if (this._advanceTimeout) {
                clearTimeout(this._advanceTimeout);
                this._advanceTimeout = null;
            }
            if (this._advanceKeyCleanup) {
                this._advanceKeyCleanup();
                this._advanceKeyCleanup = null;
            }
            this.onComplete();
        };

        const onKey = (e) => {
            if (e.type === "keydown" && e.code !== "Space" && e.code !== "Enter") return;
            advance();
        };

        window.addEventListener("keydown", onKey);
        window.addEventListener("pointerup", onKey);
        this._advanceKeyCleanup = () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerup", onKey);
        };

        this._advanceTimeout = setTimeout(advance, 5500);
    }

    // ─── Webcam PiP Overlay ───────────────────────────────────────────────────

    initWebcamPiP() {
        if (document.getElementById("level4-pip-overlay")) return;

        // Outer wrapper (DOM, positioned over canvas)
        this._pipEl = document.createElement("div");
        this._pipEl.id = "level4-pip-overlay";
        Object.assign(this._pipEl.style, {
            position: "fixed",
            bottom: "24px",
            left: "24px",
            width: "220px",
            zIndex: "30",
            fontFamily: "'Press Start 2P', monospace",
            pointerEvents: "none",
        });

        // Header bar
        const header = document.createElement("div");
        Object.assign(header.style, {
            background: "#070a10",
            border: "2px solid #38bdf8",
            borderBottom: "none",
            color: "#38bdf8",
            fontSize: "7px",
            letterSpacing: "1px",
            padding: "5px 10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        });
        header.innerHTML = '<span>BIOMETRIC POSE SCAN</span><span id="level4-pip-status" style="color:#22c55e">● LIVE</span>';
        this._pipEl.appendChild(header);

        // Canvas
        this._pipCanvas = document.createElement("canvas");
        this._pipCanvas.width = 220;
        this._pipCanvas.height = 165;
        Object.assign(this._pipCanvas.style, {
            display: "block",
            border: "2px solid #38bdf8",
            borderTop: "none",
            imageRendering: "pixelated",
        });
        this._pipEl.appendChild(this._pipCanvas);
        this._pipCtx = this._pipCanvas.getContext("2d");

        // Footer label
        this._pipStatusBar = document.createElement("div");
        Object.assign(this._pipStatusBar.style, {
            background: "#070a10",
            border: "2px solid #38bdf8",
            borderTop: "1px solid #1e3a5f",
            color: "#9ca3af",
            fontSize: "6px",
            padding: "4px 10px",
            letterSpacing: "1px",
        });
        this._pipStatusBar.textContent = "STRIKE A POWER POSE";
        this._pipEl.appendChild(this._pipStatusBar);

        document.body.appendChild(this._pipEl);

        // Start render loop
        let scanY = 0;
        const video = this.faceTracker ? this.faceTracker.getVideoElement() : null;

        const drawPiP = () => {
            this._pipRaf = requestAnimationFrame(drawPiP);
            const ctx = this._pipCtx;
            const w = this._pipCanvas.width;
            const h = this._pipCanvas.height;

            ctx.fillStyle = "#070a10";
            ctx.fillRect(0, 0, w, h);

            if (video && video.readyState >= 2) {
                // Mirror the video (flip horizontally)
                ctx.save();
                ctx.translate(w, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(video, 0, 0, w, h);
                ctx.restore();

                // CRT scanline overlay
                ctx.fillStyle = "rgba(0,0,0,0.18)";
                for (let y = 0; y < h; y += 3) {
                    ctx.fillRect(0, y, w, 1);
                }

                // Animated scan pulse
                scanY = (scanY + 1.5) % h;
                const scanGrad = ctx.createLinearGradient(0, scanY - 8, 0, scanY + 8);
                scanGrad.addColorStop(0, "rgba(56,189,248,0)");
                scanGrad.addColorStop(0.5, "rgba(56,189,248,0.22)");
                scanGrad.addColorStop(1, "rgba(56,189,248,0)");
                ctx.fillStyle = scanGrad;
                ctx.fillRect(0, scanY - 8, w, 16);

                // Retro targeting border
                ctx.strokeStyle = this.chargeProgress > 0.5 ? "#22c55e" : "#38bdf8";
                ctx.lineWidth = 2;
                ctx.strokeRect(4, 4, w - 8, h - 8);

                // Corner tick marks
                const tick = 12;
                ctx.lineWidth = 3;
                [[4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4]].forEach(([cx, cy]) => {
                    const sx = cx === 4 ? 1 : -1;
                    const sy = cy === 4 ? 1 : -1;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy + sy * tick);
                    ctx.lineTo(cx, cy);
                    ctx.lineTo(cx + sx * tick, cy);
                    ctx.stroke();
                });

                // Charge level indicator bar at bottom of feed
                const barW = Math.round((w - 8) * this.chargeProgress);
                ctx.fillStyle = this.chargeProgress > 0.8 ? "#22c55e" : this.chargeProgress > 0.4 ? "#f59e0b" : "#38bdf8";
                ctx.fillRect(4, h - 12, barW, 8);

                // Status label
                const pct = Math.round(this.chargeProgress * 100);
                this._pipStatusBar.textContent = pct >= 100 ? "★ POWER MAXED — EVALUATION COMPLETE" :
                    pct > 50 ? `CHARGING — ${pct}% ALIEN UNITS DETECTED` :
                    "RAISE ARMS / STRIKE A POWER POSE";
                this._pipStatusBar.style.color = pct >= 100 ? "#22c55e" : pct > 50 ? "#f59e0b" : "#9ca3af";

            } else {
                // No video: draw static
                const imgData = ctx.createImageData(w, h);
                const buf = new Uint32Array(imgData.data.buffer);
                for (let i = 0; i < buf.length; i++) {
                    buf[i] = Math.random() < 0.06 ? 0xff38bdf8 : 0xff05070a;
                }
                ctx.putImageData(imgData, 0, 0);
                ctx.fillStyle = "#ef4444";
                ctx.font = "8px 'Press Start 2P', monospace";
                ctx.textAlign = "center";
                ctx.fillText("NO SIGNAL", w / 2, h / 2);

                this._pipStatusBar.textContent = "CAMERA OFFLINE — USE SPACEBAR";
                this._pipStatusBar.style.color = "#ef4444";
            }
        };

        drawPiP();
    }

    destroyWebcamPiP() {
        if (this._pipRaf) {
            cancelAnimationFrame(this._pipRaf);
            this._pipRaf = null;
        }
        const el = document.getElementById("level4-pip-overlay");
        if (el) el.remove();
        this._pipEl = null;
        this._pipCanvas = null;
        this._pipCtx = null;
    }

    destroy() {
        if (this._advanceKeyCleanup) {
            this._advanceKeyCleanup();
            this._advanceKeyCleanup = null;
        }
        if (this._advanceTimeout) {
            clearTimeout(this._advanceTimeout);
            this._advanceTimeout = null;
        }
        if (this.unsubscribeCommentary) this.unsubscribeCommentary();
        if (this.unsubscribeMouth) this.unsubscribeMouth();
        this.destroyWebcamPiP();
        this.container.destroy({ children: true });
    }
}
