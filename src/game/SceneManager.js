// src/game/SceneManager.js
// Master scene state machine:
// INTRO -> LEVEL1 -> TRANSITION_1_2 -> LEVEL2 -> TRANSITION_2_3 -> LEVEL3
// -> TRANSITION_3_4 -> LEVEL4 -> TRANSITION_4_FINAL -> FINAL_SCREEN

import { Container, Graphics, Text, Sprite } from "pixi.js";
import { Level2Maze } from "./Level2Maze.js";
import { Level3Subway } from "./Level3Subway.js";
import { Level4PowerMeter } from "./Level4PowerMeter.js";
import { FinalScreen } from "./FinalScreen.js";
import { TrackingHUD } from "./TrackingHUD.js";
import { voice } from "../services/voice.js";
import { commentary } from "../services/commentary.js";

export class SceneManager {
    constructor({ game, faceTracker }) {
        this.game = game;
        this.faceTracker = faceTracker;
        this.currentScene = "INTRO";

        this.app = game.app;
        this.trackingHud = null;
        this.level2 = null;
        this.level3 = null;
        this.level4 = null;
        this.finalScreen = null;

        this.transitionContainer = new Container();
        this.fontFamily = "'Press Start 2P', monospace";
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.app.stage.addChild(this.transitionContainer);
        this.transitionContainer.visible = false;

        // Listen for Level 1 complete
        this.game.onLevelComplete = () => {
            this.changeScene("TRANSITION_1_2");
        };

        this.initFaceTracking();

        this.app.ticker.add((ticker) => {
            this.update(ticker.deltaTime);
        });

        window.addEventListener("resize", () => {
            if (this.currentScene === "LEVEL2" && this.level2) {
                this.level2.recalculateLayout();
            }
        });
    }

    initFaceTracking() {
        this.trackingHud = new TrackingHUD({
            faceTracker: this.faceTracker,
        });
        this.trackingHud.hide();

        if (this.faceTracker) {
            const originalOnResults = this.faceTracker.onResults;
            this.faceTracker.onResults = (results) => {
                if (typeof originalOnResults === "function") {
                    originalOnResults(results);
                }
                if (this.trackingHud) {
                    this.trackingHud.updateResults(results);
                }
                if (this.currentScene === "LEVEL2" && this.level2) {
                    this.level2.updateTracking(results);
                }
            };
        }
    }

    changeScene(newScene) {
        console.log(`[SceneManager] ${this.currentScene} -> ${newScene}`);
        this.currentScene = newScene;

        // Clear any active transition tickers and listeners
        this._clearActiveTransition();

        if (newScene === "LEVEL1") {
            if (this.trackingHud) this.trackingHud.hide();
            this._destroyLevel2();
            this._destroyLevel3();
            this._destroyLevel4();
            this._destroyFinalScreen();
            this.game.show();
            this.game.restart();
            commentary.say("Sector CV-07 custody protocol active. Defend your vessel.", { force: true });

        } else if (newScene === "TRANSITION_1_2") {
            this.game.hide();
            if (this.trackingHud) this.trackingHud.hide();
            this.playTransitionCutscene(
                "SECTOR CV-07 CLEARED.\nINITIATING BIOMETRIC CUSTODY GRID...\nMAINTAIN PARTNER EYE CONTACT.",
                "LEVEL2",
                3.0
            );

        } else if (newScene === "LEVEL2") {
            this.game.hide();
            this.mountLevel2();
            if (this.trackingHud) this.trackingHud.show();

        } else if (newScene === "TRANSITION_2_3") {
            if (this.trackingHud) this.trackingHud.hide();
            this._destroyLevel2();
            this.playTransition23Cutscene();

        } else if (newScene === "LEVEL3") {
            this.mountLevel3();

        } else if (newScene === "TRANSITION_3_4") {
            this._destroyLevel3();
            this.playTransitionCutscene(
                "TRANSIT POLICE INTERCEPTION COMPLETE.\nTRANSPORTING DEFENDANTS TO PHYSICAL EVALUATION:\nTHE ALIEN POWER-O-METER.",
                "LEVEL4",
                3.0
            );

        } else if (newScene === "LEVEL4") {
            this.mountLevel4();

        } else if (newScene === "TRANSITION_4_FINAL") {
            this._destroyLevel4();
            this.playTransitionCutscene(
                "PHYSICAL POWER CAPACITANCE COMPILED.\nOPENING SUPREME INQUIRY CHAMBER FOR FINAL VERDICT.",
                "FINAL_SCREEN",
                3.0
            );

        } else if (newScene === "FINAL_SCREEN") {
            this.mountFinalScreen();
        }
    }

    _destroyLevel2() {
        if (this.level2) {
            this.level2.destroy();
            this.level2 = null;
        }
    }

    _destroyLevel3() {
        if (this.level3) {
            this.level3.destroy();
            this.level3 = null;
        }
    }

    _destroyLevel4() {
        if (this.level4) {
            this.level4.destroy();
            this.level4 = null;
        }
    }

    _destroyFinalScreen() {
        if (this.finalScreen) {
            this.finalScreen.destroy();
            this.finalScreen = null;
        }
    }

    _clearActiveTransition() {
        if (this._currentTransitionTicker) {
            try { this.app.ticker.remove(this._currentTransitionTicker); } catch (e) {}
            this._currentTransitionTicker = null;
        }
        if (this._currentSkipHandler) {
            window.removeEventListener("keydown", this._currentSkipHandler);
            window.removeEventListener("pointerup", this._currentSkipHandler);
            this._currentSkipHandler = null;
        }
        this.transitionContainer.visible = false;
    }

    // ─── Generic Cinematic Transition Cutscene ────────────────────────────────

    playTransitionCutscene(messageText, nextScene, duration = 3.0) {
        this._clearActiveTransition();
        this.transitionContainer.removeChildren();
        this.transitionContainer.visible = true;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x05070a, alpha: 0.96 });
        this.transitionContainer.addChild(bg);

        // Warp streaks
        const streaks = [];
        for (let i = 0; i < 40; i++) {
            const streak = new Graphics();
            streak.rect(0, 0, 3, 20 + Math.random() * 50);
            streak.fill({ color: 0x38bdf8, alpha: 0.4 + Math.random() * 0.5 });
            streak.x = Math.random() * w;
            streak.y = Math.random() * h;
            streak.speed = 12 + Math.random() * 18;
            this.transitionContainer.addChild(streak);
            streaks.push(streak);
        }

        let shipSpr = null;
        if (this.game.textures.playerFrames && this.game.textures.playerFrames.length > 0) {
            shipSpr = new Sprite(this.game.textures.playerFrames[0]);
            shipSpr.anchor.set(0.5);
            shipSpr.width = 68;
            shipSpr.height = 68;
            shipSpr.x = w / 2;
            shipSpr.y = h * 0.65;
            this.transitionContainer.addChild(shipSpr);
        }

        const bannerBox = new Container();
        const bannerBg = new Graphics();
        const bannerW = Math.min(640, w - 40);
        bannerBg.roundRect(0, 0, bannerW, 110, 6);
        bannerBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        bannerBg.stroke({ color: 0xf59e0b, width: 2 });
        bannerBox.addChild(bannerBg);

        const subTitle = new Text({
            text: "TRANSMISSION // CENTRAL VIENIUM SECTOR COMMAND",
            style: { fontFamily: this.fontFamily, fontSize: 9.5, fill: "#F59E0B" },
        });
        subTitle.x = 20;
        subTitle.y = 16;
        bannerBox.addChild(subTitle);

        const bodyText = new Text({
            text: messageText,
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: "#E5E7EB", lineHeight: 22 },
        });
        bodyText.x = 20;
        bodyText.y = 42;
        bannerBox.addChild(bodyText);

        bannerBox.x = (w - bannerW) / 2;
        bannerBox.y = 70;
        this.transitionContainer.addChild(bannerBox);

        const promptText = new Text({
            text: "[ CLICK OR PRESS SPACE TO ADVANCE ]",
            style: { fontFamily: this.fontFamily, fontSize: 8, fill: "#9CA3AF" },
        });
        promptText.anchor.set(0.5);
        promptText.x = w / 2;
        promptText.y = bannerBox.y + 130;
        this.transitionContainer.addChild(promptText);

        let finished = false;
        const startTime = Date.now();
        const tickerFunc = () => {
            if (finished) return;
            const elapsed = (Date.now() - startTime) / 1000;
            for (const s of streaks) {
                s.y += s.speed;
                if (s.y > h) s.y = -60;
            }
            if (shipSpr) {
                shipSpr.y -= 1.8;
                shipSpr.scale.x = 1.0 + Math.sin(Date.now() * 0.01) * 0.05;
                shipSpr.scale.y = 1.0 + Math.sin(Date.now() * 0.01) * 0.05;
            }
            if (elapsed >= duration) {
                finish();
            }
        };

        const finish = () => {
            if (finished) return;
            finished = true;
            this._clearActiveTransition();
            this.changeScene(nextScene);
        };

        const skipHandler = (e) => {
            if (e.type === "keydown" && e.code !== "Space") return;
            finish();
        };

        this._currentTransitionTicker = tickerFunc;
        this._currentSkipHandler = skipHandler;

        window.addEventListener("keydown", skipHandler);
        window.addEventListener("pointerup", skipHandler);
        this.app.ticker.add(tickerFunc);
    }

    // ─── Level 2 → Level 3 Transit Police Arrest Cutscene ─────────────────────

    playTransition23Cutscene() {
        this._clearActiveTransition();
        this.transitionContainer.removeChildren();
        this.transitionContainer.visible = true;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x030508, alpha: 1 });
        this.transitionContainer.addChild(bg);

        // Siren flash overlay
        const sirenFlash = new Graphics();
        sirenFlash.rect(0, 0, w, h);
        sirenFlash.fill({ color: 0xef4444, alpha: 0.0 });
        this.transitionContainer.addChild(sirenFlash);

        const lines = [];
        const CUTSCENE_LINES = [
            "CONGRATULATIONS.",
            "YOU HAVE ESCAPED THE MAZE.",
            "UNFORTUNATELY...",
            "YOU ARE NOW UNDER ARREST!",
            "WELCOME TO THE CENTRAL VIENIUM TRANSIT AUTHORITY.",
            "",
            "TO MOVE LEFT — SAY: LEFT",
            "TO MOVE RIGHT — SAY: RIGHT",
            "TO JUMP — SAY: UP (OR JUMP)",
            "TO DUCK — SAY: DOWN (OR DUCK)",
            "",
            "OR USE KEYBOARD: A/D/W/S",
            "",
            "[ CLICK OR PRESS SPACE TO ADVANCE ]",
        ];

        CUTSCENE_LINES.forEach((txt, i) => {
            const isPrompt = i === CUTSCENE_LINES.length - 1;
            const t = new Text({
                text: txt,
                style: {
                    fontFamily: this.fontFamily,
                    fontSize: isPrompt ? 8 : (i < 5 ? 12 : 9),
                    fill: isPrompt ? "#9CA3AF" : (i === 3 ? "#EF4444" : i >= 6 && i <= 9 ? "#38BDF8" : "#E5E7EB"),
                    letterSpacing: 1,
                },
            });
            t.anchor.set(0.5, 0);
            t.x = w / 2;
            t.y = h * 0.10 + i * 34;
            t.alpha = 0;
            this.transitionContainer.addChild(t);
            lines.push(t);
        });

        if (this.game.soundManager) {
            this.game.soundManager.playGoldenSpawn();
        }

        commentary.say(
            "Congratulations. You escaped the maze. Unfortunately... you are now under arrest! Welcome to the Central Vienium Transit Authority.",
            { force: true }
        );

        let finished = false;
        const startTime = Date.now();
        const tickerFunc = () => {
            if (finished) return;
            const elapsed = (Date.now() - startTime) / 1000;
            sirenFlash.alpha = (Math.sin(elapsed * 8) > 0) ? 0.08 : 0;

            const targetLine = Math.min(lines.length - 1, Math.floor(elapsed / 0.35));
            for (let i = 0; i <= targetLine; i++) {
                if (lines[i].alpha < 1) {
                    lines[i].alpha = Math.min(1, lines[i].alpha + 0.1);
                }
            }

            if (elapsed >= 5.0) {
                finish();
            }
        };

        const finish = () => {
            if (finished) return;
            finished = true;
            this._clearActiveTransition();
            this.changeScene("LEVEL3");
        };

        const skipHandler = (e) => {
            if (e.type === "keydown" && e.code !== "Space") return;
            finish();
        };

        this._currentTransitionTicker = tickerFunc;
        this._currentSkipHandler = skipHandler;

        window.addEventListener("keydown", skipHandler);
        window.addEventListener("pointerup", skipHandler);
        this.app.ticker.add(tickerFunc);
    }

    // ─── Scene Mount Handlers ─────────────────────────────────────────────────

    mountLevel2() {
        this._destroyLevel2();

        this.level2 = new Level2Maze({
            app: this.app,
            input: this.game.input,
            soundManager: this.game.soundManager,
            textures: this.game.textures,
            trackingHud: this.trackingHud,
            onComplete: () => {
                this.changeScene("TRANSITION_2_3");
            },
        });

        this.app.stage.addChild(this.level2.container);
    }

    mountLevel3() {
        this._destroyLevel3();

        this.level3 = new Level3Subway({
            app: this.app,
            input: this.game.input,
            soundManager: this.game.soundManager,
            textures: this.game.textures,
            onComplete: () => {
                this.changeScene("TRANSITION_3_4");
            },
        });

        this.app.stage.addChild(this.level3.container);
        commentary.say("Welcome to the Central Vienium Transit Authority. Say your commands clearly or use keyboard override.", { force: true });
    }

    mountLevel4() {
        this._destroyLevel4();

        this.level4 = new Level4PowerMeter({
            app: this.app,
            input: this.game.input,
            soundManager: this.game.soundManager,
            textures: this.game.textures,
            faceTracker: this.faceTracker,
            onComplete: () => {
                this.changeScene("TRANSITION_4_FINAL");
            },
        });

        this.app.stage.addChild(this.level4.container);
    }

    mountFinalScreen() {
        this._destroyFinalScreen();

        this.finalScreen = new FinalScreen({
            app: this.app,
            soundManager: this.game.soundManager,
            textures: this.game.textures,
            onRestart: () => {
                this.changeScene("LEVEL1");
            },
        });

        this.app.stage.addChild(this.finalScreen.container);
    }

    // ─── Main Game Loop Update ────────────────────────────────────────────────

    update(deltaTime) {
        try {
            if (this.currentScene === "LEVEL2" && this.level2) {
                this.level2.update(deltaTime);
            }
            if (this.currentScene === "LEVEL3" && this.level3) {
                this.level3.update(deltaTime);
            }
            if (this.currentScene === "LEVEL4" && this.level4) {
                this.level4.update(deltaTime);
            }
            if (this.currentScene === "FINAL_SCREEN" && this.finalScreen) {
                this.finalScreen.update(deltaTime);
            }
        } catch (err) {
            console.error(`[SceneManager] Error in scene update loop (${this.currentScene}):`, err);
        }
    }
}
