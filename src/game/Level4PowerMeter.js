// src/game/Level4PowerMeter.js
// Level 4 — Central Vienium Alien Power-O-Meter: Real Bicep Curl Showdown
// Computer Vision powered by MediaPipe PoseLandmarker.
// Tracks real elbow angles for Player 1 & Player 2:
// EXTENDED -> CURLING -> CONTRACTED -> RETURNING -> REP COMPLETE.
// Features: Real-time rep comparison, 20s showdown timer, live PiP skeleton overlay,
// smoothing, cooldowns, manual fallback, funny alien commentary, and Level 5 transition.

import { Container, Graphics, Text, Sprite, AnimatedSprite } from "pixi.js";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { commentary } from "../services/commentary.js";

const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Pose Landmark Indices
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;

/**
 * Calculates 2D interior angle between three points (A -> B -> C) at vertex B in degrees.
 */
export function calculateAngle(a, b, c) {
    if (!a || !b || !c) return 180;
    const bax = a.x - b.x;
    const bay = a.y - b.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;

    const dot = bax * bcx + bay * bcy;
    const magBA = Math.hypot(bax, bay);
    const magBC = Math.hypot(bcx, bcy);

    if (magBA === 0 || magBC === 0) return 180;
    const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
    return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Robust 5-stage Bicep Curl State Machine
 */
export class BicepRepTracker {
    constructor(playerId) {
        this.playerId = playerId;
        this.state = "EXTENDED"; // EXTENDED -> CURLING -> CONTRACTED -> RETURNING -> COMPLETE
        this.reps = 0;
        this.currentAngle = 180;
        this.smoothedAngle = 180;
        this.lastRepTime = 0;
        this.minRepCooldownMs = 400; // Minimum 400ms between completed reps
        this.extendedThreshold = 135; // Angle > 135° considered extended
        this.contractedThreshold = 75; // Angle < 75° considered contracted
        this.armUsed = "RIGHT";
        this.landmarks = null;
    }

    update(landmarks, nowMs) {
        this.landmarks = landmarks;
        if (!landmarks || landmarks.length === 0) return;

        // Calculate left and right arm angles
        const lShoulder = landmarks[L_SHOULDER];
        const lElbow = landmarks[L_ELBOW];
        const lWrist = landmarks[L_WRIST];

        const rShoulder = landmarks[R_SHOULDER];
        const rElbow = landmarks[R_ELBOW];
        const rWrist = landmarks[R_WRIST];

        let leftAngle = 180;
        let rightAngle = 180;

        if (lShoulder && lElbow && lWrist) {
            leftAngle = calculateAngle(lShoulder, lElbow, lWrist);
        }
        if (rShoulder && rElbow && rWrist) {
            rightAngle = calculateAngle(rShoulder, rElbow, rWrist);
        }

        // Choose arm that is more curled (smaller angle)
        let activeAngle = rightAngle;
        this.armUsed = "RIGHT";
        if (leftAngle < rightAngle) {
            activeAngle = leftAngle;
            this.armUsed = "LEFT";
        }

        this.currentAngle = activeAngle;
        // Exponential moving average smoothing
        this.smoothedAngle = this.smoothedAngle * 0.65 + activeAngle * 0.35;

        // State Machine evaluation
        let repCompleted = false;

        switch (this.state) {
            case "EXTENDED":
                if (this.smoothedAngle < 125) {
                    this.state = "CURLING";
                }
                break;

            case "CURLING":
                if (this.smoothedAngle < this.contractedThreshold) {
                    this.state = "CONTRACTED";
                } else if (this.smoothedAngle > this.extendedThreshold + 10) {
                    this.state = "EXTENDED"; // Reset if dropped without contracting
                }
                break;

            case "CONTRACTED":
                if (this.smoothedAngle > 95) {
                    this.state = "RETURNING";
                }
                break;

            case "RETURNING":
                if (this.smoothedAngle > this.extendedThreshold) {
                    if (nowMs - this.lastRepTime >= this.minRepCooldownMs) {
                        this.reps++;
                        this.lastRepTime = nowMs;
                        repCompleted = true;
                    }
                    this.state = "EXTENDED";
                }
                break;
        }

        return repCompleted;
    }

    injectRep() {
        this.reps++;
        this.lastRepTime = performance.now();
        return true;
    }

    reset() {
        this.state = "EXTENDED";
        this.reps = 0;
        this.currentAngle = 180;
        this.smoothedAngle = 180;
        this.lastRepTime = 0;
    }
}

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

        // Game Flow State:
        // INTRO -> COUNTDOWN -> SHOWDOWN -> REVEAL -> COMPLETE
        this.state = "INTRO";
        this.stateTimer = 0;
        this.showdownDuration = 20; // 20-second Bicep Showdown
        this.showdownRemaining = this.showdownDuration;
        this.countdownValue = 3;

        // Player Bicep Trackers
        this.p1Tracker = new BicepRepTracker(1);
        this.p2Tracker = new BicepRepTracker(2);

        // MediaPipe PoseLandmarker
        this.poseLandmarker = null;
        this.poseRunning = false;
        this.poseOffline = false;
        this.video = null;
        this.poseRaf = null;

        // 5-heart system
        this.lives = 5;
        this.maxLives = 5;

        this.initBackground();
        this.initMeterUI();
        this.initAlienBox();
        this.initDialogueBox();
        this.initWebcamPiP();

        // Start MediaPipe Pose Detection
        this.initMediaPipePose();

        // Intro Commentary
        setTimeout(() => {
            commentary.say(
                "Central Vienium Physical Evaluation Protocol active! BICEP CURL SHOWDOWN! Player 1 vs Player 2. Reps are monitored by celestial computer vision.",
                { force: true }
            );
        }, 600);
    }

    async initMediaPipePose() {
        try {
            const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
            this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: POSE_MODEL_URL,
                    delegate: "GPU",
                },
                runningMode: "VIDEO",
                numPoses: 2,
                minPoseDetectionConfidence: 0.45,
                minPosePresenceConfidence: 0.45,
                minTrackingConfidence: 0.45,
            });

            // Borrow video element from faceTracker if available, or create one
            if (this.faceTracker && this.faceTracker.getVideoElement()) {
                this.video = this.faceTracker.getVideoElement();
            } else {
                this.video = document.createElement("video");
                this.video.style.display = "none";
                this.video.playsInline = true;
                this.video.muted = true;
                document.body.appendChild(this.video);

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480 },
                    audio: false,
                });
                this.video.srcObject = stream;
                await this.video.play();
                this._createdStream = stream;
            }

            this.poseRunning = true;
            this.poseOffline = false;
            this._startPoseLoop();
        } catch (err) {
            console.warn("[Level 4] MediaPipe Pose Landmarker notice (falling back to manual / simulated CV):", err);
            this.poseOffline = true;
        }
    }

    _startPoseLoop() {
        const loop = () => {
            if (!this.poseRunning) return;
            const now = performance.now();

            if (this.video && this.video.readyState >= 2 && this.poseLandmarker) {
                try {
                    const result = this.poseLandmarker.detectForVideo(this.video, now);
                    if (result && result.landmarks && result.landmarks.length > 0) {
                        // Sort poses horizontally: Leftmost pose = Player 1, Rightmost = Player 2
                        const sortedPoses = [...result.landmarks].sort((a, b) => {
                            const ax = (a[L_SHOULDER]?.x || 0.5 + a[R_SHOULDER]?.x || 0.5) / 2;
                            const bx = (b[L_SHOULDER]?.x || 0.5 + b[R_SHOULDER]?.x || 0.5) / 2;
                            return ax - bx;
                        });

                        const p1Landmarks = sortedPoses[0] || null;
                        const p2Landmarks = sortedPoses[1] || null;

                        if (this.state === "SHOWDOWN") {
                            if (p1Landmarks) {
                                const p1Rep = this.p1Tracker.update(p1Landmarks, now);
                                if (p1Rep) this.onRepDetected(1);
                            }
                            if (p2Landmarks) {
                                const p2Rep = this.p2Tracker.update(p2Landmarks, now);
                                if (p2Rep) this.onRepDetected(2);
                            }
                        } else {
                            if (p1Landmarks) this.p1Tracker.update(p1Landmarks, now);
                            if (p2Landmarks) this.p2Tracker.update(p2Landmarks, now);
                        }
                    }
                } catch (e) {
                    // Ignore transient frame detection drops
                }
            }

            this.poseRaf = requestAnimationFrame(loop);
        };

        this.poseRaf = requestAnimationFrame(loop);
    }

    onRepDetected(playerNum) {
        if (this.soundManager) this.soundManager.playRepCount();
        console.log(`[Level 4] Player ${playerNum} BICEP REP COUNTED! (P1: ${this.p1Tracker.reps}, P2: ${this.p2Tracker.reps})`);

        // Visual bounce on meter
        const meter = playerNum === 1 ? this.p1Meter : this.p2Meter;
        if (meter) {
            meter.scale.set(1.06);
            setTimeout(() => { meter.scale.set(1.0); }, 120);
        }
    }

    injectRep(playerNum) {
        if (playerNum === 1) {
            this.p1Tracker.injectRep();
            this.onRepDetected(1);
        } else {
            this.p2Tracker.injectRep();
            this.onRepDetected(2);
        }
    }

    initBackground() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, sw, sh);
        bg.fill({ color: 0x070a10 });
        this.bgLayer.addChild(bg);

        // Cyber Grid Lines
        const grid = new Graphics();
        for (let x = 0; x < sw; x += 40) {
            grid.moveTo(x, 0);
            grid.lineTo(x, sh);
        }
        for (let y = 0; y < sh; y += 40) {
            grid.moveTo(0, y);
            grid.lineTo(sw, y);
        }
        grid.stroke({ color: 0x1e293b, width: 1, alpha: 0.35 });
        this.bgLayer.addChild(grid);
    }

    initMeterUI() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        // Title Header
        this.titleText = new Text({
            text: "LEVEL 4: BICEP SHOWDOWN // MEDIAPIPE POSE BICEP CURL COMPARISON",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 10.5,
                fill: "#F59E0B",
                letterSpacing: 1,
            },
        });
        this.titleText.anchor.set(0.5, 0);
        this.titleText.x = sw / 2;
        this.titleText.y = 16;
        this.uiLayer.addChild(this.titleText);

        // Instruction / Status Banner
        this.subText = new Text({
            text: "PREPARE TO CURL // MONITORING BOTH PLAYERS VIA WEBCAM",
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
        const meterBoxW = Math.min(740, sw - 36);
        const meterBoxH = 240;
        const meterBoxX = (sw - meterBoxW) / 2;
        const meterBoxY = 66;

        const frameBg = new Graphics();
        frameBg.roundRect(meterBoxX, meterBoxY, meterBoxW, meterBoxH, 8);
        frameBg.fill({ color: 0x0b111e, alpha: 0.96 });
        frameBg.stroke({ color: 0x38bdf8, width: 3 });
        this.meterLayer.addChild(frameBg);

        // Player 1 Gauge Container (Left)
        this.p1Meter = new Container();
        this.p1Meter.x = meterBoxX + 30;
        this.p1Meter.y = meterBoxY + 24;

        const p1Title = new Text({
            text: "PLAYER 1: PILOT",
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: "#22C55E" },
        });
        this.p1Meter.addChild(p1Title);

        this.p1RepBig = new Text({
            text: "0 REPS",
            style: { fontFamily: this.fontFamily, fontSize: 24, fill: "#22C55E" },
        });
        this.p1RepBig.x = 0;
        this.p1RepBig.y = 24;
        this.p1Meter.addChild(this.p1RepBig);

        this.p1BarBg = new Graphics();
        this.p1BarBg.roundRect(0, 64, 280, 24, 4);
        this.p1BarBg.fill({ color: 0x1f2937 });
        this.p1BarBg.stroke({ color: 0x374151, width: 2 });
        this.p1Meter.addChild(this.p1BarBg);

        this.p1BarFill = new Graphics();
        this.p1Meter.addChild(this.p1BarFill);

        this.p1StateTag = new Text({
            text: "STATE: EXTENDED (180°)",
            style: { fontFamily: this.fontFamily, fontSize: 7.5, fill: "#9CA3AF" },
        });
        this.p1StateTag.x = 0;
        this.p1StateTag.y = 96;
        this.p1Meter.addChild(this.p1StateTag);

        // Manual P1 Curl Button
        const p1Btn = new Container();
        const p1BtnBg = new Graphics();
        p1BtnBg.roundRect(0, 0, 130, 24, 3);
        p1BtnBg.fill({ color: 0x14532d });
        p1BtnBg.stroke({ color: 0x22c55e, width: 1.5 });
        p1Btn.addChild(p1BtnBg);
        const p1BtnTxt = new Text({ text: "[ +1 P1 CURL ]", style: { fontFamily: this.fontFamily, fontSize: 7, fill: "#FFF" } });
        p1BtnTxt.anchor.set(0.5);
        p1BtnTxt.x = 65; p1BtnTxt.y = 12;
        p1Btn.addChild(p1BtnTxt);
        p1Btn.x = 0; p1Btn.y = 120;
        p1Btn.eventMode = "static";
        p1Btn.cursor = "pointer";
        p1Btn.on("pointertap", () => this.injectRep(1));
        this.p1Meter.addChild(p1Btn);

        this.meterLayer.addChild(this.p1Meter);

        // Center VS & Timer Column
        this.centerCol = new Container();
        this.centerCol.x = sw / 2;
        this.centerCol.y = meterBoxY + 30;

        this.timerText = new Text({
            text: "20.0s",
            style: { fontFamily: this.fontFamily, fontSize: 18, fill: "#FBBF24" },
        });
        this.timerText.anchor.set(0.5, 0);
        this.centerCol.addChild(this.timerText);

        const vsText = new Text({
            text: "VS",
            style: { fontFamily: this.fontFamily, fontSize: 14, fill: "#EF4444" },
        });
        vsText.anchor.set(0.5, 0);
        vsText.y = 38;
        this.centerCol.addChild(vsText);

        this.meterLayer.addChild(this.centerCol);

        // Player 2 Gauge Container (Right)
        this.p2Meter = new Container();
        this.p2Meter.x = meterBoxX + meterBoxW - 310;
        this.p2Meter.y = meterBoxY + 24;

        const p2Title = new Text({
            text: "PLAYER 2: GUNNER",
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: "#FBBF24" },
        });
        this.p2Meter.addChild(p2Title);

        this.p2RepBig = new Text({
            text: "0 REPS",
            style: { fontFamily: this.fontFamily, fontSize: 24, fill: "#FBBF24" },
        });
        this.p2RepBig.x = 0;
        this.p2RepBig.y = 24;
        this.p2Meter.addChild(this.p2RepBig);

        this.p2BarBg = new Graphics();
        this.p2BarBg.roundRect(0, 64, 280, 24, 4);
        this.p2BarBg.fill({ color: 0x1f2937 });
        this.p2BarBg.stroke({ color: 0x374151, width: 2 });
        this.p2Meter.addChild(this.p2BarBg);

        this.p2BarFill = new Graphics();
        this.p2Meter.addChild(this.p2BarFill);

        this.p2StateTag = new Text({
            text: "STATE: EXTENDED (180°)",
            style: { fontFamily: this.fontFamily, fontSize: 7.5, fill: "#9CA3AF" },
        });
        this.p2StateTag.x = 0;
        this.p2StateTag.y = 96;
        this.p2Meter.addChild(this.p2StateTag);

        // Manual P2 Curl Button
        const p2Btn = new Container();
        const p2BtnBg = new Graphics();
        p2BtnBg.roundRect(0, 0, 130, 24, 3);
        p2BtnBg.fill({ color: 0x78350f });
        p2BtnBg.stroke({ color: 0xf59e0b, width: 1.5 });
        p2Btn.addChild(p2BtnBg);
        const p2BtnTxt = new Text({ text: "[ +1 P2 CURL ]", style: { fontFamily: this.fontFamily, fontSize: 7, fill: "#FFF" } });
        p2BtnTxt.anchor.set(0.5);
        p2BtnTxt.x = 65; p2BtnTxt.y = 12;
        p2Btn.addChild(p2BtnTxt);
        p2Btn.x = 0; p2Btn.y = 120;
        p2Btn.eventMode = "static";
        p2Btn.cursor = "pointer";
        p2Btn.on("pointertap", () => this.injectRep(2));
        this.p2Meter.addChild(p2Btn);

        this.meterLayer.addChild(this.p2Meter);

        // Start / Action Trigger Button (Bottom Center)
        this.actionBtn = new Container();
        const aBg = new Graphics();
        aBg.roundRect(0, 0, 320, 38, 4);
        aBg.fill({ color: 0x1e293b });
        aBg.stroke({ color: 0xf59e0b, width: 2 });
        this.actionBtn.addChild(aBg);

        this.actionBtnText = new Text({
            text: "[ START BICEP SHOWDOWN ]",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#F59E0B" },
        });
        this.actionBtnText.anchor.set(0.5);
        this.actionBtnText.x = 160;
        this.actionBtnText.y = 19;
        this.actionBtn.addChild(this.actionBtnText);

        this.actionBtn.x = (sw - 320) / 2;
        this.actionBtn.y = meterBoxY + meterBoxH + 16;
        this.actionBtn.eventMode = "static";
        this.actionBtn.cursor = "pointer";
        this.actionBtn.on("pointertap", () => {
            if (this.state === "INTRO") {
                this.startCountdown();
            } else if (this.state === "REVEAL") {
                this.advanceToNextLevel();
            }
        });

        this.uiLayer.addChild(this.actionBtn);
    }

    initAlienBox() {
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
            text: "FITNESS AUDITOR",
            style: { fontFamily: this.fontFamily, fontSize: 6.5, fill: "#F59E0B" },
        });
        tag.anchor.set(0.5, 0);
        tag.x = cardW / 2;
        tag.y = 76;
        this.alienCard.addChild(tag);

        this.alienCard.x = this.app.screen.width - 136;
        this.alienCard.y = 66;
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

    startCountdown() {
        this.state = "COUNTDOWN";
        this.stateTimer = 0;
        this.countdownValue = 3;
        this.actionBtn.visible = false;

        if (this.soundManager) this.soundManager.playCountdown();
        this.subText.text = `GET READY TO CURL: ${this.countdownValue}...`;
        this.subText.style.fill = "#F59E0B";

        const countInterval = setInterval(() => {
            this.countdownValue--;
            if (this.countdownValue > 0) {
                this.subText.text = `GET READY TO CURL: ${this.countdownValue}...`;
                if (this.soundManager) this.soundManager.playCountdown();
            } else if (this.countdownValue === 0) {
                this.subText.text = "CURL! P1 vs P2 — MAXIMUM REPS!";
                this.subText.style.fill = "#22C55E";
                if (this.soundManager) this.soundManager.playLevelComplete();
            } else {
                clearInterval(countInterval);
                this.startShowdown();
            }
        }, 1000);
    }

    startShowdown() {
        this.state = "SHOWDOWN";
        this.stateTimer = 0;
        this.showdownRemaining = this.showdownDuration;
        this.p1Tracker.reset();
        this.p2Tracker.reset();
        this.subText.text = "SHOWDOWN ACTIVE: FULL BICEP EXTENSION & CONTRACTION!";
        this.subText.style.fill = "#38BDF8";
    }

    update(deltaTime) {
        const dtSec = deltaTime / 60;
        this.stateTimer += dtSec;

        // Spacebar / keyboard shortcuts to inject reps
        if (this.input) {
            if (this.input.wasPressed("1")) this.injectRep(1);
            if (this.input.wasPressed("2")) this.injectRep(2);
            if (this.input.wasPressed(" ") && this.state === "INTRO") this.startCountdown();
            else if (this.input.wasPressed(" ") && this.state === "REVEAL") this.advanceToNextLevel();
        }

        // Auto-progress from Intro after 4.5s
        if (this.state === "INTRO" && this.stateTimer >= 4.5) {
            this.startCountdown();
        }

        // Update Gauge Displays
        this.p1RepBig.text = `${this.p1Tracker.reps} REPS`;
        this.p2RepBig.text = `${this.p2Tracker.reps} REPS`;

        this.p1StateTag.text = `STATE: ${this.p1Tracker.state} (${Math.round(this.p1Tracker.smoothedAngle)}°) [${this.p1Tracker.armUsed} ARM]`;
        this.p2StateTag.text = `STATE: ${this.p2Tracker.state} (${Math.round(this.p2Tracker.smoothedAngle)}°) [${this.p2Tracker.armUsed} ARM]`;

        // Draw progress fill based on curl angle (180° = 0%, 70° = 100%)
        const p1CurlRatio = Math.max(0, Math.min(1, (180 - this.p1Tracker.smoothedAngle) / 110));
        const p2CurlRatio = Math.max(0, Math.min(1, (180 - this.p2Tracker.smoothedAngle) / 110));

        this.p1BarFill.clear();
        this.p1BarFill.roundRect(0, 64, 280 * p1CurlRatio, 24, 4);
        this.p1BarFill.fill({ color: 0x22c55e });

        this.p2BarFill.clear();
        this.p2BarFill.roundRect(0, 64, 280 * p2CurlRatio, 24, 4);
        this.p2BarFill.fill({ color: 0xfbbf24 });

        // Showdown Timer
        if (this.state === "SHOWDOWN") {
            this.showdownRemaining = Math.max(0, this.showdownDuration - this.stateTimer);
            this.timerText.text = `${this.showdownRemaining.toFixed(1)}s`;

            if (this.showdownRemaining <= 0) {
                this.state = "REVEAL";
                this.revealResults();
            }
        }

        // Dialogue timer
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
        this.actionBtn.visible = true;
        this.actionBtnText.text = "[ PROCEED TO LEVEL 5: ALIEN ESCAPE ]";

        const p1 = this.p1Tracker.reps;
        const p2 = this.p2Tracker.reps;

        let verdict = "";
        if (p1 > p2) {
            verdict = `PLAYER 1 WINS WITH ${p1} REPS! (P2: ${p2} REPS)`;
            this.subText.style.fill = "#22C55E";
        } else if (p2 > p1) {
            verdict = `PLAYER 2 WINS WITH ${p2} REPS! (P1: ${p1} REPS)`;
            this.subText.style.fill = "#FBBF24";
        } else {
            verdict = `PERFECT TIE! BOTH PLAYERS LOGGED ${p1} REPS!`;
            this.subText.style.fill = "#38BDF8";
        }

        this.subText.text = `${verdict} // [ CLICK OR SPACE TO ADVANCE ]`;
        commentary.setStat("p1PowerScore", p1 * 10);
        commentary.setStat("p2PowerScore", p2 * 10);

        if (this.soundManager) this.soundManager.playLevelComplete();

        // Piper Sarcastic Commentary
        commentary.say(
            `Bicep evaluation compiled. Player One achieved ${p1} legitimate curls. Player Two achieved ${p2} curls. Central Vienium certifies your muscle fibers as moderately capable. Proceeding to Alien Escape.`,
            { force: true }
        );

        // Auto advance after 6s
        this._advanceTimeout = setTimeout(() => {
            this.advanceToNextLevel();
        }, 6500);
    }

    advanceToNextLevel() {
        if (this._advanceTimeout) {
            clearTimeout(this._advanceTimeout);
            this._advanceTimeout = null;
        }
        this.onComplete();
    }

    // ─── Webcam PiP Overlay with Real-time Pose Skeleton ──────────────────────

    initWebcamPiP() {
        if (document.getElementById("level4-pip-overlay")) return;

        this._pipEl = document.createElement("div");
        this._pipEl.id = "level4-pip-overlay";
        Object.assign(this._pipEl.style, {
            position: "fixed",
            bottom: "20px",
            left: "20px",
            width: "280px",
            zIndex: "30",
            fontFamily: "'Press Start 2P', monospace",
            pointerEvents: "none",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            background: "#070a10",
            border: "2px solid #38bdf8",
            borderBottom: "none",
            color: "#38bdf8",
            fontSize: "7.5px",
            letterSpacing: "1px",
            padding: "5px 10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        });
        header.innerHTML = '<span>POSE TRACKER // SKELETON</span><span style="color:#22c55e">● LIVE</span>';
        this._pipEl.appendChild(header);

        this._pipCanvas = document.createElement("canvas");
        this._pipCanvas.width = 280;
        this._pipCanvas.height = 190;
        Object.assign(this._pipCanvas.style, {
            display: "block",
            border: "2px solid #38bdf8",
            borderTop: "none",
            imageRendering: "pixelated",
        });
        this._pipEl.appendChild(this._pipCanvas);
        this._pipCtx = this._pipCanvas.getContext("2d");

        this._pipStatusBar = document.createElement("div");
        Object.assign(this._pipStatusBar.style, {
            background: "#070a10",
            border: "2px solid #38bdf8",
            borderTop: "1px solid #1e3a5f",
            color: "#9ca3af",
            fontSize: "6.5px",
            padding: "4px 8px",
            letterSpacing: "1px",
        });
        this._pipStatusBar.textContent = "STAND BACK & CURL ARMS";
        this._pipEl.appendChild(this._pipStatusBar);

        document.body.appendChild(this._pipEl);

        // Draw PiP Loop
        const drawPiP = () => {
            this._pipRaf = requestAnimationFrame(drawPiP);
            const ctx = this._pipCtx;
            if (!ctx) return;
            const w = this._pipCanvas.width;
            const h = this._pipCanvas.height;

            ctx.fillStyle = "#070a10";
            ctx.fillRect(0, 0, w, h);

            if (this.video && this.video.readyState >= 2) {
                // Mirror Video
                ctx.save();
                ctx.translate(w, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(this.video, 0, 0, w, h);
                ctx.restore();

                // Draw Pose Skeleton & Angle Overlays
                this.drawSkeletonOverlay(ctx, this.p1Tracker.landmarks, w, h, "#22c55e", "P1");
                this.drawSkeletonOverlay(ctx, this.p2Tracker.landmarks, w, h, "#fbbf24", "P2");

                // CRT Scanlines
                ctx.fillStyle = "rgba(0,0,0,0.16)";
                for (let y = 0; y < h; y += 3) {
                    ctx.fillRect(0, y, w, 1);
                }

                // Status message
                if (this.state === "SHOWDOWN") {
                    this._pipStatusBar.textContent = `P1: ${this.p1Tracker.reps} REPS  |  P2: ${this.p2Tracker.reps} REPS`;
                    this._pipStatusBar.style.color = "#34d399";
                } else if (this.state === "REVEAL") {
                    this._pipStatusBar.textContent = `COMPLETE // P1: ${this.p1Tracker.reps} vs P2: ${this.p2Tracker.reps}`;
                    this._pipStatusBar.style.color = "#f59e0b";
                } else {
                    this._pipStatusBar.textContent = "READY // STAND IN WEBCAM VIEW";
                    this._pipStatusBar.style.color = "#9ca3af";
                }
            } else {
                ctx.fillStyle = "#ef4444";
                ctx.font = "8px 'Press Start 2P', monospace";
                ctx.textAlign = "center";
                ctx.fillText("NO WEBCAM SIGNAL", w / 2, h / 2);
            }
        };

        drawPiP();
    }

    drawSkeletonOverlay(ctx, landmarks, w, h, color, label) {
        if (!landmarks || landmarks.length === 0) return;

        // Joints to connect: Left arm (11->13->15) and Right arm (12->14->16)
        const toCanvas = (pt) => ({
            x: (1 - pt.x) * w, // Mirrored X
            y: pt.y * h,
        });

        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        // Draw Right Arm
        const rs = landmarks[R_SHOULDER] ? toCanvas(landmarks[R_SHOULDER]) : null;
        const re = landmarks[R_ELBOW] ? toCanvas(landmarks[R_ELBOW]) : null;
        const rw = landmarks[R_WRIST] ? toCanvas(landmarks[R_WRIST]) : null;

        if (rs && re && rw) {
            ctx.beginPath();
            ctx.moveTo(rs.x, rs.y);
            ctx.lineTo(re.x, re.y);
            ctx.lineTo(rw.x, rw.y);
            ctx.stroke();

            [rs, re, rw].forEach((pt) => {
                ctx.beginPath();
                ctx.circle ? ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2) : ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });

            // Draw player label over shoulder
            ctx.font = "7px 'Press Start 2P', monospace";
            ctx.fillText(label, rs.x - 8, rs.y - 10);
        }

        // Draw Left Arm
        const ls = landmarks[L_SHOULDER] ? toCanvas(landmarks[L_SHOULDER]) : null;
        const le = landmarks[L_ELBOW] ? toCanvas(landmarks[L_ELBOW]) : null;
        const lw = landmarks[L_WRIST] ? toCanvas(landmarks[L_WRIST]) : null;

        if (ls && le && lw) {
            ctx.beginPath();
            ctx.moveTo(ls.x, ls.y);
            ctx.lineTo(le.x, le.y);
            ctx.lineTo(lw.x, lw.y);
            ctx.stroke();

            [ls, le, lw].forEach((pt) => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }
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
        this.poseRunning = false;
        if (this.poseRaf) {
            cancelAnimationFrame(this.poseRaf);
            this.poseRaf = null;
        }
        if (this.poseLandmarker) {
            try { this.poseLandmarker.close(); } catch (e) {}
            this.poseLandmarker = null;
        }
        if (this._createdStream) {
            this._createdStream.getTracks().forEach((t) => t.stop());
            this._createdStream = null;
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
