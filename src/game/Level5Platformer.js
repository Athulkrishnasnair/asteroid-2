// src/game/Level5Platformer.js
// Level 5 — Alien Escape: 2D Arcade Platformer with Webcam Interaction
// Features:
// 1. Player 2 Avatar Snapshot: Captured via webcam, masked as alien entity.
// 2. Player 1 Mouth/Tongue Webcam Controls: Mouth left/right to move, mouth open to jump.
// 3. Player 2 Smile Detection: If Player 2 smiles/laughs, game pauses with funny failure alert!
// 4. Compact 2D Platformer: Platforms, moving platforms, hazard lasers, checkpoint, finish escape pod.
// 5. 5-Heart System, funny sound design, keyboard fallback, and clean destruction.

import { Container, Graphics, Text, Sprite, AnimatedSprite, Texture } from "pixi.js";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { commentary } from "../services/commentary.js";

const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Key Facial Landmark Indices
const NOSE_TIP = 1;
const TOP_HEAD = 10;
const CHIN = 152;
const L_LIP_CORNER = 61;
const R_LIP_CORNER = 291;
const UPPER_LIP = 13;
const LOWER_LIP = 14;
const L_EYE_OUTER = 33;
const R_EYE_OUTER = 263;

export function calculateSmileScore(landmarks) {
    if (!landmarks) return 0;
    const leftLip = landmarks[L_LIP_CORNER];
    const rightLip = landmarks[R_LIP_CORNER];
    const topLip = landmarks[UPPER_LIP];
    const leftEye = landmarks[L_EYE_OUTER];
    const rightEye = landmarks[R_EYE_OUTER];

    if (!leftLip || !rightLip || !leftEye || !rightEye) return 0;

    const mouthW = Math.hypot(rightLip.x - leftLip.x, rightLip.y - leftLip.y);
    const eyeW = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 0.2;
    const widthRatio = mouthW / eyeW;

    const avgCornerY = (leftLip.y + rightLip.y) / 2;
    const lift = topLip ? ((topLip.y - avgCornerY) / (eyeW || 0.2)) : 0;

    const rawScore = (widthRatio - 0.92) * 1.8 + Math.max(0, lift) * 2.2;
    return Math.max(0, Math.min(1.0, rawScore));
}

export class Level5Platformer {
    constructor({ app, input, soundManager, textures, faceTracker, onComplete }) {
        this.app = app;
        this.input = input;
        this.soundManager = soundManager;
        this.textures = textures || {};
        this.faceTracker = faceTracker;
        this.onComplete = onComplete || (() => {});

        this.container = new Container();
        this.bgLayer = new Container();
        this.levelLayer = new Container();
        this.hazardLayer = new Container();
        this.playerLayer = new Container();
        this.avatarLayer = new Container();
        this.uiLayer = new Container();

        this.container.addChild(this.bgLayer);
        this.container.addChild(this.levelLayer);
        this.container.addChild(this.hazardLayer);
        this.container.addChild(this.playerLayer);
        this.container.addChild(this.avatarLayer);
        this.container.addChild(this.uiLayer);

        this.fontFamily = "'Press Start 2P', monospace";

        // Level State Machine:
        // CAPTURE_AVATAR -> PLAYING -> PAUSED_SMILE_FAIL -> VICTORY -> COMPLETE
        this.state = "CAPTURE_AVATAR";
        this.stateTimer = 0;

        // 5-heart system
        this.lives = 5;
        this.maxLives = 5;

        // Player 1 Platformer Entity
        this.player = {
            x: 80,
            y: 300,
            vx: 0,
            vy: 0,
            width: 32,
            height: 38,
            speed: 5.4,
            jumpStrength: 13.5,
            gravity: 0.68,
            isGrounded: false,
            invulnerableTimer: 0,
            sprite: new Container(),
            checkpointX: 80,
            checkpointY: 300,
        };

        // Player 1 Mouth Tracking State
        this.p1Mouth = {
            horizontalOffset: 0, // -1 (left) to +1 (right)
            openness: 0, // 0 to 1
            isJumpTriggered: false,
            smoothedDir: 0,
        };

        // Player 2 Smile Detection State
        this.p2Smile = {
            isSmiling: false,
            smileConfidence: 0, // 0 to 1
            smileDurationMs: 0,
            smileThreshold: 0.52,
            maintainedThresholdMs: 320, // Must hold smile for >320ms to trigger fail
            visible: false,
            landmarks: null,
        };

        // Captured Player 2 Avatar Texture
        this.p2AvatarTexture = null;
        this.p2AvatarSprite = null;

        // MediaPipe FaceLandmarker
        this.landmarker = null;
        this.cvRunning = false;
        this.cvOffline = false;
        this.video = null;
        this.cvRaf = null;

        // Platformer Level Geometry & Hazards
        this.platforms = [];
        this.movingPlatforms = [];
        this.hazards = [];
        this.exitGoal = null;

        this.initBackground();
        this.initPlatforms();
        this.initPlayer();
        this.initHUD();
        this.initWebcamPiP();
        this.initMediaPipeCV();

        // Prompt initial avatar capture
        this.showAvatarCapturePrompt();
    }

    async initMediaPipeCV() {
        try {
            const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
            this.landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: FACE_MODEL_URL,
                    delegate: "GPU",
                },
                runningMode: "VIDEO",
                numFaces: 2,
            });

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

            this.cvRunning = true;
            this.cvOffline = false;
            this._startCVLoop();
        } catch (err) {
            console.warn("[Level 5] FaceLandmarker initialization notice:", err);
            this.cvOffline = true;
        }
    }

    _startCVLoop() {
        const loop = () => {
            if (!this.cvRunning) return;
            const now = performance.now();

            if (this.video && this.video.readyState >= 2 && this.landmarker) {
                try {
                    const result = this.landmarker.detectForVideo(this.video, now);
                    if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
                        // Sort faces by X: Left = Player 1, Right = Player 2
                        const sortedFaces = [...result.faceLandmarks].sort((a, b) => {
                            return (a[NOSE_TIP]?.x || 0) - (b[NOSE_TIP]?.x || 0);
                        });

                        const p1Face = sortedFaces[0] || null;
                        const p2Face = sortedFaces.length > 1 ? sortedFaces[1] : (sortedFaces[0] || null);

                        // Process Player 1 Mouth/Tongue Controls
                        if (p1Face) {
                            this.processP1Mouth(p1Face);
                        }

                        // Process Player 2 Smile Detection
                        if (p2Face) {
                            this.processP2Smile(p2Face, now);
                        }
                    } else {
                        this.p2Smile.visible = false;
                    }
                } catch (e) {
                    // Frame drop tolerance
                }
            }

            this.cvRaf = requestAnimationFrame(loop);
        };

        this.cvRaf = requestAnimationFrame(loop);
    }

    processP1Mouth(landmarks) {
        const nose = landmarks[NOSE_TIP];
        const leftLip = landmarks[L_LIP_CORNER];
        const rightLip = landmarks[R_LIP_CORNER];
        const topLip = landmarks[UPPER_LIP];
        const botLip = landmarks[LOWER_LIP];
        const topHead = landmarks[TOP_HEAD];
        const chin = landmarks[CHIN];

        if (!nose || !leftLip || !rightLip || !topLip || !botLip) return;

        // 1. Mouth Horizontal Shift: distance of mouth center from nose
        const mouthCenterX = (leftLip.x + rightLip.x) / 2;
        const faceWidth = Math.abs(landmarks[R_EYE_OUTER]?.x - landmarks[L_EYE_OUTER]?.x) || 0.2;
        const rawOffset = (mouthCenterX - nose.x) / faceWidth;

        // Smoothing
        this.p1Mouth.horizontalOffset = this.p1Mouth.horizontalOffset * 0.7 + rawOffset * 0.3;

        // 2. Mouth Openness (Jump / Tongue Impulse)
        const faceHeight = Math.abs(chin.y - topHead.y) || 0.3;
        const lipGap = Math.abs(botLip.y - topLip.y);
        const openRatio = lipGap / faceHeight;

        this.p1Mouth.openness = Math.min(1.0, openRatio * 6.5);
        this.p1Mouth.isJumpTriggered = this.p1Mouth.openness > 0.45;
    }

    processP2Smile(landmarks, nowMs) {
        this.p2Smile.visible = true;
        this.p2Smile.landmarks = landmarks;

        const rawScore = calculateSmileScore(landmarks);
        this.p2Smile.smileConfidence = Math.max(0, Math.min(1.0, this.p2Smile.smileConfidence * 0.7 + rawScore * 0.3));

        const isCurrentlySmiling = this.p2Smile.smileConfidence > this.p2Smile.smileThreshold;

        if (isCurrentlySmiling) {
            this.p2Smile.smileDurationMs += 33; // Approx ms per frame
            if (this.p2Smile.smileDurationMs >= this.p2Smile.maintainedThresholdMs) {
                this.p2Smile.isSmiling = true;
                if (this.state === "PLAYING") {
                    this.triggerSmileFailure();
                }
            }
        } else {
            this.p2Smile.smileDurationMs = Math.max(0, this.p2Smile.smileDurationMs - 50);
            this.p2Smile.isSmiling = false;
        }
    }

    triggerSmileFailure() {
        this.state = "PAUSED_SMILE_FAIL";
        if (this.soundManager) this.soundManager.playLaughFail();

        console.log("[Level 5] PLAYER 2 LAUGHED! Challenge Failed.");
        commentary.say("PLAYER 2 SMILED! Challenge breached. Laughter is strictly prohibited in Sector CV-07.", { force: true });

        this.loseHeart();

        // Show Failure Overlay
        this.smileFailModal.visible = true;
    }

    resumeAfterSmileFail() {
        this.smileFailModal.visible = false;
        this.p2Smile.smileDurationMs = 0;
        this.p2Smile.isSmiling = false;
        this.p2Smile.smileConfidence = 0;

        // Respawn player at checkpoint
        this.player.x = this.player.checkpointX;
        this.player.y = this.player.checkpointY;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.invulnerableTimer = 1.5;

        if (this.lives > 0) {
            this.state = "PLAYING";
        }
    }

    // ─── Player 2 Avatar Webcam Snapshot ──────────────────────────────────────

    showAvatarCapturePrompt() {
        this.state = "CAPTURE_AVATAR";

        this.captureCard = new Container();
        const sw = this.app.screen.width;
        const cardW = Math.min(620, sw - 40);
        const cardH = 260;

        const bg = new Graphics();
        bg.roundRect(0, 0, cardW, cardH, 8);
        bg.fill({ color: 0x0a0f1d, alpha: 0.96 });
        bg.stroke({ color: 0xf59e0b, width: 3 });
        this.captureCard.addChild(bg);

        const title = new Text({
            text: "LEVEL 5 // PLAYER 2 ALIEN AVATAR SYNTHESIS",
            style: { fontFamily: this.fontFamily, fontSize: 10.5, fill: "#F59E0B" },
        });
        title.anchor.set(0.5, 0);
        title.x = cardW / 2;
        title.y = 20;
        this.captureCard.addChild(title);

        const desc = new Text({
            text: "Capturing Player 2 biometrics for the platformer avatar.\nLook directly into the webcam and click [CAPTURE PHOTO]!",
            style: { fontFamily: "'VT323', monospace", fontSize: 20, fill: "#E2E8F0", align: "center", lineHeight: 22 },
        });
        desc.anchor.set(0.5, 0);
        desc.x = cardW / 2;
        desc.y = 60;
        this.captureCard.addChild(desc);

        // Capture Button
        const btn = new Container();
        const bBg = new Graphics();
        bBg.roundRect(0, 0, 320, 42, 4);
        bBg.fill({ color: 0xd97706 });
        bBg.stroke({ color: 0xfef08a, width: 2 });
        btn.addChild(bBg);

        const bText = new Text({
            text: "[ CAPTURE PLAYER 2 AVATAR ]",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#000" },
        });
        bText.anchor.set(0.5);
        bText.x = 160;
        bText.y = 21;
        btn.addChild(bText);

        btn.x = (cardW - 320) / 2;
        btn.y = 170;
        btn.eventMode = "static";
        btn.cursor = "pointer";
        btn.on("pointertap", () => this.capturePlayer2Avatar());
        this.captureCard.addChild(btn);

        this.captureCard.x = (sw - cardW) / 2;
        this.captureCard.y = 80;
        this.uiLayer.addChild(this.captureCard);

        commentary.say("Player 2. Smile for the biometric scanner. This photo will become your alien avatar.", { force: true });
    }

    capturePlayer2Avatar() {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = 120;
            canvas.height = 120;
            const ctx = canvas.getContext("2d");

            if (this.video && this.video.readyState >= 2) {
                const vw = this.video.videoWidth || 640;
                const vh = this.video.videoHeight || 480;

                // Crop Player 2 (right half of video)
                ctx.save();
                ctx.beginPath();
                ctx.arc(60, 60, 54, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(this.video, vw * 0.35, vh * 0.1, vw * 0.55, vh * 0.8, 0, 0, 120, 120);
                ctx.restore();

                // Cyber glowing border ring
                ctx.strokeStyle = "#f59e0b";
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.arc(60, 60, 54, 0, Math.PI * 2);
                ctx.stroke();

                this.p2AvatarTexture = Texture.from(canvas);
            }
        } catch (e) {
            console.warn("Player 2 avatar capture fallback:", e);
        }

        if (this.soundManager) this.soundManager.playSelect();
        if (this.captureCard) this.captureCard.visible = false;

        this.mountPlayer2AvatarInWorld();
        this.startPlatformerGameplay();
    }

    mountPlayer2AvatarInWorld() {
        this.avatarLayer.removeChildren();

        // Place Player 2 Alien Avatar inside a floating surveillance pod above the goal
        const avatarContainer = new Container();
        avatarContainer.x = this.app.screen.width - 120;
        avatarContainer.y = 120;

        // Pod Base
        const podBg = new Graphics();
        podBg.roundRect(-40, -40, 80, 80, 8);
        podBg.fill({ color: 0x0a0f1d, alpha: 0.95 });
        podBg.stroke({ color: 0xf59e0b, width: 3 });
        avatarContainer.addChild(podBg);

        // Player 2 Face Sprite
        if (this.p2AvatarTexture) {
            this.p2AvatarSprite = new Sprite(this.p2AvatarTexture);
            this.p2AvatarSprite.anchor.set(0.5);
            this.p2AvatarSprite.width = 64;
            this.p2AvatarSprite.height = 64;
            avatarContainer.addChild(this.p2AvatarSprite);
        } else if (this.textures.alienFrames && this.textures.alienFrames.length > 0) {
            const spr = new Sprite(this.textures.alienFrames[0]);
            spr.anchor.set(0.5);
            spr.width = 60;
            spr.height = 60;
            avatarContainer.addChild(spr);
        }

        const tag = new Text({
            text: "PLAYER 2 (TARGET)",
            style: { fontFamily: this.fontFamily, fontSize: 6.5, fill: "#FBBF24" },
        });
        tag.anchor.set(0.5, 0);
        tag.y = 44;
        avatarContainer.addChild(tag);

        this.avatarLayer.addChild(avatarContainer);
        this.avatarPod = avatarContainer;
    }

    startPlatformerGameplay() {
        this.state = "PLAYING";
        this.stateTimer = 0;
        commentary.say(
            "Player 1: Control the runner using mouth movement. Player 2: DO NOT SMILE! If Player 2 smiles, the mission instantly fails.",
            { force: true }
        );
    }

    // ─── Platformer World Geometry ───────────────────────────────────────────

    initBackground() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, sw, sh);
        bg.fill({ color: 0x05070a });
        this.bgLayer.addChild(bg);
    }

    initPlatforms() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;
        const baseFloorY = sh * 0.78;

        this.levelLayer.removeChildren();
        this.platforms = [];
        this.movingPlatforms = [];
        this.hazards = [];

        // 1. Starting Platform
        this.addPlatform(40, baseFloorY, 200, 24, 0x1e293b, 0x38bdf8);

        // 2. Stepping Platforms
        this.addPlatform(280, baseFloorY - 60, 140, 20, 0x1e293b, 0x38bdf8);
        this.addPlatform(460, baseFloorY - 120, 150, 20, 0x1e293b, 0x38bdf8);

        // 3. Moving Platform
        const mp = this.addPlatform(650, baseFloorY - 140, 130, 18, 0x0f766e, 0x2dd4bf);
        mp.isMoving = true;
        mp.minX = 640;
        mp.maxX = Math.min(sw - 280, 840);
        mp.speed = 2.0;
        mp.dir = 1;
        this.movingPlatforms.push(mp);

        // 4. Upper Platform & Checkpoint
        const upX = Math.min(sw - 260, 870);
        this.addPlatform(upX, baseFloorY - 90, 160, 20, 0x1e293b, 0x38bdf8);
        this.player.checkpointX = upX + 30;
        this.player.checkpointY = baseFloorY - 130;

        // 5. Final Goal Platform & Extraction Pod
        const goalX = sw - 200;
        this.addPlatform(goalX, baseFloorY - 40, 180, 24, 0x14532d, 0x22c55e);

        // Extraction Gateway Pad (Finish)
        this.exitGoal = {
            x: goalX + 90,
            y: baseFloorY - 60,
            radius: 40,
        };

        const goalGfx = new Graphics();
        goalGfx.roundRect(-30, -50, 60, 50, 6);
        goalGfx.fill({ color: 0x15803d, alpha: 0.85 });
        goalGfx.stroke({ color: 0x86efac, width: 2 });
        goalGfx.x = this.exitGoal.x;
        goalGfx.y = baseFloorY - 40;
        this.levelLayer.addChild(goalGfx);

        const goalText = new Text({
            text: "ESCAPE\nPOD",
            style: { fontFamily: this.fontFamily, fontSize: 7, fill: "#86EFAC", align: "center", lineHeight: 10 },
        });
        goalText.anchor.set(0.5);
        goalText.x = this.exitGoal.x;
        goalText.y = baseFloorY - 65;
        this.levelLayer.addChild(goalText);

        // Hazard Laser Beam between platform 1 and 2
        this.addHazard(240, baseFloorY + 10, 40, 12);
        this.addHazard(610, baseFloorY + 10, 40, 12);
    }

    addPlatform(x, y, width, height, fillColor = 0x1e293b, strokeColor = 0x38bdf8) {
        const plat = { x, y, width, height, sprite: new Graphics() };
        plat.sprite.roundRect(0, 0, width, height, 4);
        plat.sprite.fill({ color: fillColor });
        plat.sprite.stroke({ color: strokeColor, width: 2 });
        plat.sprite.x = x;
        plat.sprite.y = y;
        this.levelLayer.addChild(plat.sprite);
        this.platforms.push(plat);
        return plat;
    }

    addHazard(x, y, width, height) {
        const haz = { x, y, width, height, sprite: new Graphics() };
        haz.sprite.rect(0, 0, width, height);
        haz.sprite.fill({ color: 0xef4444, alpha: 0.85 });
        haz.sprite.x = x;
        haz.sprite.y = y;
        this.hazardLayer.addChild(haz.sprite);
        this.hazards.push(haz);
        return haz;
    }

    initPlayer() {
        this.player.sprite.removeChildren();

        if (this.textures.playerFrames && this.textures.playerFrames.length > 0) {
            const spr = new Sprite(this.textures.playerFrames[0]);
            spr.anchor.set(0.5);
            spr.width = 38;
            spr.height = 38;
            this.player.shipSpr = spr;
            this.player.sprite.addChild(spr);
        } else {
            const g = new Graphics();
            g.circle(0, 0, 16);
            g.fill({ color: 0x38bdf8 });
            g.stroke({ color: 0xffffff, width: 2 });
            this.player.sprite.addChild(g);
        }

        this.player.x = 80;
        this.player.y = 300;
        this.playerLayer.addChild(this.player.sprite);
    }

    initHUD() {
        // Level Title
        this.titleText = new Text({
            text: "LEVEL 5: ALIEN ESCAPE // PLAYER 1: MOUTH CONTROL | PLAYER 2: DO NOT SMILE",
            style: { fontFamily: this.fontFamily, fontSize: 9.5, fill: "#F59E0B", letterSpacing: 1 },
        });
        this.titleText.x = 18;
        this.titleText.y = 14;
        this.uiLayer.addChild(this.titleText);

        // 5-Heart Life Display
        this.livesText = new Text({
            text: "LIVES: ❤️❤️❤️❤️❤️",
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: "#EF4444" },
        });
        this.livesText.x = 18;
        this.livesText.y = 34;
        this.uiLayer.addChild(this.livesText);

        // Controls Status Badge
        this.ctrlBadge = new Text({
            text: "P1 MOUTH: NEUTRAL // P2 EXPRESSION: 😐 SAFE",
            style: { fontFamily: this.fontFamily, fontSize: 8.5, fill: "#34D399" },
        });
        this.ctrlBadge.x = 18;
        this.ctrlBadge.y = 54;
        this.uiLayer.addChild(this.ctrlBadge);

        // Smile Failure Modal (Hidden until smile occurs)
        this.smileFailModal = new Container();
        const modalW = 520;
        const modalH = 170;
        const mBg = new Graphics();
        mBg.roundRect(0, 0, modalW, modalH, 8);
        mBg.fill({ color: 0x0a0e14, alpha: 0.98 });
        mBg.stroke({ color: 0xef4444, width: 3 });
        this.smileFailModal.addChild(mBg);

        const failTitle = new Text({
            text: "😂 PLAYER 2 LAUGHED!",
            style: { fontFamily: this.fontFamily, fontSize: 16, fill: "#EF4444" },
        });
        failTitle.anchor.set(0.5);
        failTitle.x = modalW / 2;
        failTitle.y = 36;
        this.smileFailModal.addChild(failTitle);

        const failSub = new Text({
            text: "MISSION FAILED — -1 HEART PENALTY\nRESUME PLATFORMER AT CHECKPOINT",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#FBBF24", align: "center", lineHeight: 18 },
        });
        failSub.anchor.set(0.5);
        failSub.x = modalW / 2;
        failSub.y = 80;
        this.smileFailModal.addChild(failSub);

        const resumeBtn = new Container();
        const rBg = new Graphics();
        rBg.roundRect(0, 0, 220, 34, 4);
        rBg.fill({ color: 0x1e293b });
        rBg.stroke({ color: 0x38bdf8, width: 2 });
        resumeBtn.addChild(rBg);

        const rText = new Text({
            text: "[ RESUME RUN ]",
            style: { fontFamily: this.fontFamily, fontSize: 8.5, fill: "#38BDF8" },
        });
        rText.anchor.set(0.5);
        rText.x = 110;
        rText.y = 17;
        resumeBtn.addChild(rText);

        resumeBtn.x = (modalW - 220) / 2;
        resumeBtn.y = 118;
        resumeBtn.eventMode = "static";
        resumeBtn.cursor = "pointer";
        resumeBtn.on("pointertap", () => this.resumeAfterSmileFail());
        this.smileFailModal.addChild(resumeBtn);

        this.smileFailModal.x = (this.app.screen.width - modalW) / 2;
        this.smileFailModal.y = (this.app.screen.height - modalH) / 2;
        this.smileFailModal.visible = false;
        this.uiLayer.addChild(this.smileFailModal);

        // Subtitle dialogue box
        this.dialogueBox = new Container();
        this.dialogueBg = new Graphics();
        this.dialogueBox.addChild(this.dialogueBg);

        this.dialogueText = new Text({
            text: "",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 10.5,
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

        this.unsubscribeCommentary = commentary.onDialogue((text, duration) => {
            this.showDialogue(text, duration);
        });
    }

    showDialogue(text, duration = 3.5) {
        if (!text) return;
        this.dialogueText.text = `"${text}"`;
        const width = this.app.screen.width;
        const boxW = Math.min(640, width - 36);
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

        if (this.soundManager) this.soundManager.playDialogue();
    }

    update(deltaTime) {
        const dtSec = deltaTime / 60;
        this.stateTimer += dtSec;

        // Hover avatar pod
        if (this.avatarPod) {
            this.avatarPod.y = 120 + Math.sin(Date.now() * 0.005) * 8;
        }

        if (this.state !== "PLAYING") return;

        // 1. Process Player 1 Platformer Movement & Physics
        this.handlePlayerPhysics(deltaTime, dtSec);

        // 2. Update Moving Platforms
        this.updateMovingPlatforms(deltaTime);

        // 3. Check Hazards & Fall Off Screen
        this.checkHazardsAndBoundaries();

        // 4. Check Victory Goal Reach
        this.checkVictoryGoal();

        // 5. Update HUD Status
        const smileText = this.p2Smile.isSmiling ? "😂 SMILE DETECTED!" : this.p2Smile.smileConfidence > 0.3 ? "⚠️ TWITCHING..." : "😐 SAFE";
        const mouthText = this.p1Mouth.horizontalOffset < -0.08 ? "MOUTH: LEFT [←]" : this.p1Mouth.horizontalOffset > 0.08 ? "MOUTH: RIGHT [→]" : "MOUTH: CENTER";
        this.ctrlBadge.text = `P1 ${mouthText} // P2: ${smileText}`;
        this.ctrlBadge.style.fill = this.p2Smile.isSmiling ? "#EF4444" : "#34D399";

        // 6. Dialogue Timer
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

    handlePlayerPhysics(deltaTime, dtSec) {
        // Horizontal Input: Mouth Tracking + Keyboard Fallback
        let moveDir = 0;

        if (this.p1Mouth.horizontalOffset < -0.06) moveDir -= 1;
        if (this.p1Mouth.horizontalOffset > 0.06) moveDir += 1;

        if (this.input) {
            if (this.input.isDown("a") || this.input.isDown("A") || this.input.isDown("ArrowLeft")) moveDir -= 1;
            if (this.input.isDown("d") || this.input.isDown("D") || this.input.isDown("ArrowRight")) moveDir += 1;
        }

        this.player.vx = moveDir * this.player.speed;

        // Jump Input: Mouth Open / Tongue Gesture + Keyboard Space/W/Up
        const wantsJump = this.p1Mouth.isJumpTriggered ||
            (this.input && (this.input.wasPressed("w") || this.input.wasPressed("W") || this.input.wasPressed(" ") || this.input.wasPressed("ArrowUp")));

        if (wantsJump && this.player.isGrounded) {
            this.player.vy = -this.player.jumpStrength;
            this.player.isGrounded = false;
            if (this.soundManager) this.soundManager.playJump();
        }

        // Apply Gravity
        this.player.vy += this.player.gravity * (deltaTime / 1.0);

        // Move X & Check Horizontal Platform Collisions
        this.player.x += this.player.vx * (deltaTime / 1.0);

        // Move Y & Check Vertical Platform Collisions
        this.player.y += this.player.vy * (deltaTime / 1.0);
        this.player.isGrounded = false;

        const pBox = {
            left: this.player.x - this.player.width / 2,
            right: this.player.x + this.player.width / 2,
            top: this.player.y - this.player.height,
            bottom: this.player.y,
        };

        for (const plat of this.platforms) {
            const platBox = {
                left: plat.x,
                right: plat.x + plat.width,
                top: plat.y,
                bottom: plat.y + plat.height,
            };

            // Landing on top of platform
            if (
                pBox.right > platBox.left &&
                pBox.left < platBox.right &&
                pBox.bottom >= platBox.top &&
                pBox.bottom <= platBox.top + 16 &&
                this.player.vy >= 0
            ) {
                this.player.y = platBox.top;
                this.player.vy = 0;
                this.player.isGrounded = true;

                // Carry with moving platform
                if (plat.isMoving) {
                    this.player.x += plat.speed * plat.dir * (deltaTime / 1.0);
                }
            }
        }

        // Update player sprite position
        this.player.sprite.x = this.player.x;
        this.player.sprite.y = this.player.y;

        // Invulnerability visual flash
        if (this.player.invulnerableTimer > 0) {
            this.player.invulnerableTimer -= dtSec;
            this.player.sprite.alpha = Math.floor(this.player.invulnerableTimer * 8) % 2 === 0 ? 0.4 : 0.9;
        } else {
            this.player.sprite.alpha = 1.0;
        }
    }

    updateMovingPlatforms(deltaTime) {
        for (const mp of this.movingPlatforms) {
            mp.x += mp.speed * mp.dir * (deltaTime / 1.0);
            if (mp.x > mp.maxX) {
                mp.x = mp.maxX;
                mp.dir = -1;
            } else if (mp.x < mp.minX) {
                mp.x = mp.minX;
                mp.dir = 1;
            }
            mp.sprite.x = mp.x;
        }
    }

    checkHazardsAndBoundaries() {
        const pBox = {
            left: this.player.x - this.player.width / 2,
            right: this.player.x + this.player.width / 2,
            top: this.player.y - this.player.height,
            bottom: this.player.y,
        };

        // Fall Off Screen
        if (this.player.y > this.app.screen.height + 60) {
            this.loseHeart();
            this.player.x = this.player.checkpointX;
            this.player.y = this.player.checkpointY;
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.invulnerableTimer = 1.2;
            return;
        }

        // Hazards Collision
        if (this.player.invulnerableTimer <= 0) {
            for (const haz of this.hazards) {
                if (
                    pBox.right > haz.x &&
                    pBox.left < haz.x + haz.width &&
                    pBox.bottom > haz.y &&
                    pBox.top < haz.y + haz.height
                ) {
                    this.loseHeart();
                    this.player.x = this.player.checkpointX;
                    this.player.y = this.player.checkpointY;
                    this.player.vx = 0;
                    this.player.vy = 0;
                    this.player.invulnerableTimer = 1.2;
                    break;
                }
            }
        }
    }

    checkVictoryGoal() {
        if (!this.exitGoal) return;
        const dist = Math.hypot(this.player.x - this.exitGoal.x, this.player.y - this.exitGoal.y);
        if (dist <= this.exitGoal.radius) {
            this.triggerVictory();
        }
    }

    triggerVictory() {
        if (this.state === "VICTORY" || this.state === "COMPLETE") return;
        this.state = "VICTORY";

        console.log("LEVEL 5 ALIEN ESCAPE COMPLETE!");
        if (this.soundManager) this.soundManager.playLevelComplete();

        commentary.say(
            "Extraordinary escape! Player 1 navigated the alien obstacle course while Player 2 successfully suppressed all humor. Triplicate custody clearance finalized!",
            { force: true }
        );

        this.ctrlBadge.text = "★ ESCAPE POD REACHED! FINAL EVALUATION CHAMBER OPENING...";
        this.ctrlBadge.style.fill = "#22C55E";

        setTimeout(() => {
            this.state = "COMPLETE";
            this.onComplete();
        }, 3200);
    }

    updateLivesText() {
        if (!this.livesText) return;
        const hearts = "❤️".repeat(Math.max(0, this.lives));
        const empty = "🖤".repeat(Math.max(0, this.maxLives - this.lives));
        this.livesText.text = `LIVES: ${hearts}${empty}`;
    }

    loseHeart() {
        this.lives = Math.max(0, this.lives - 1);
        this.updateLivesText();
        if (this.soundManager) this.soundManager.playPlayerHit();

        if (this.lives <= 0) {
            this.state = "PAUSED_SMILE_FAIL";
            if (this.smileFailModal) this.smileFailModal.visible = true;
        }
    }

    resetHearts() {
        this.lives = this.maxLives;
        this.updateLivesText();
        if (this.smileFailModal) this.smileFailModal.visible = false;
        if (this.state === "PAUSED_SMILE_FAIL") this.state = "PLAYING";
    }

    // ─── Webcam PiP Panel for Player 2 Smile Expression ──────────────────────

    initWebcamPiP() {
        if (document.getElementById("level5-pip-overlay")) return;

        this._pipEl = document.createElement("div");
        this._pipEl.id = "level5-pip-overlay";
        Object.assign(this._pipEl.style, {
            position: "fixed",
            bottom: "20px",
            left: "20px",
            width: "260px",
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
            fontSize: "7px",
            letterSpacing: "1px",
            padding: "5px 10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        });
        header.innerHTML = '<span>P2 SMILE DETECTOR</span><span style="color:#22c55e">● LIVE</span>';
        this._pipEl.appendChild(header);

        this._pipCanvas = document.createElement("canvas");
        this._pipCanvas.width = 260;
        this._pipCanvas.height = 180;
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
            fontSize: "6px",
            padding: "4px 8px",
            letterSpacing: "1px",
        });
        this._pipStatusBar.textContent = "PLAYER 2: MAINTAIN SERIOUS FACE";
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
                // Draw Mirrored Video
                ctx.save();
                ctx.translate(w, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(this.video, 0, 0, w, h);
                ctx.restore();

                // Draw Smile Detection Indicator Box
                const isSmiling = this.p2Smile.isSmiling;
                ctx.strokeStyle = isSmiling ? "#ef4444" : "#34d399";
                ctx.lineWidth = 3;
                ctx.strokeRect(6, 6, w - 12, h - 12);

                // Expression Tag in PiP
                ctx.fillStyle = isSmiling ? "#ef4444" : "#22c55e";
                ctx.font = "8px 'Press Start 2P', monospace";
                ctx.fillText(isSmiling ? "😂 SMILE DETECTED!" : "😐 SAFE", 14, 24);

                // Smile Gauge Bar
                const fillW = Math.round((w - 28) * this.p2Smile.smileConfidence);
                ctx.fillStyle = isSmiling ? "#ef4444" : this.p2Smile.smileConfidence > 0.4 ? "#f59e0b" : "#38bdf8";
                ctx.fillRect(14, h - 14, fillW, 6);

                this._pipStatusBar.textContent = isSmiling ? "LAUGHTER BREACH — MISSION HALTED" : "MAINTAIN STONE FACE (NO SMILING)";
                this._pipStatusBar.style.color = isSmiling ? "#ef4444" : "#9ca3af";
            } else {
                ctx.fillStyle = "#ef4444";
                ctx.font = "8px 'Press Start 2P', monospace";
                ctx.textAlign = "center";
                ctx.fillText("CAMERA OFFLINE", w / 2, h / 2);
            }
        };

        drawPiP();
    }

    destroyWebcamPiP() {
        if (this._pipRaf) {
            cancelAnimationFrame(this._pipRaf);
            this._pipRaf = null;
        }
        const el = document.getElementById("level5-pip-overlay");
        if (el) el.remove();
        this._pipEl = null;
        this._pipCanvas = null;
        this._pipCtx = null;
    }

    destroy() {
        this.cvRunning = false;
        if (this.cvRaf) {
            cancelAnimationFrame(this.cvRaf);
            this.cvRaf = null;
        }
        if (this.landmarker) {
            try { this.landmarker.close(); } catch (e) {}
            this.landmarker = null;
        }
        if (this._createdStream) {
            this._createdStream.getTracks().forEach((t) => t.stop());
            this._createdStream = null;
        }
        if (this.unsubscribeCommentary) this.unsubscribeCommentary();
        this.destroyWebcamPiP();
        this.container.destroy({ children: true });
    }
}
