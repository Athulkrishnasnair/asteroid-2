// src/game/DevMenu.js
// Universal Developer Menu (CTRL + \) for Central Vienium
// Provides rapid testing controls: Level Skips, Hearts Reset, Power-ups,
// Rep injection for Level 4, CV debugging, and scene reloads.

export class DevMenu {
    constructor({ sceneManager }) {
        this.sceneManager = sceneManager;
        this.visible = false;
        this.container = null;
        this.initDOM();
        this.bindShortcuts();
    }

    initDOM() {
        if (document.getElementById("cv-dev-menu")) {
            this.container = document.getElementById("cv-dev-menu");
            return;
        }

        const menu = document.createElement("div");
        menu.id = "cv-dev-menu";
        menu.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            max-height: 90vh;
            overflow-y: auto;
            background: rgba(10, 14, 20, 0.96);
            border: 2px solid #f59e0b;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.85), inset 0 0 10px rgba(245, 158, 11, 0.2);
            color: #e5e7eb;
            font-family: 'Press Start 2P', monospace;
            font-size: 8px;
            padding: 14px;
            z-index: 99999;
            display: none;
            user-select: none;
        `;

        menu.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #374151; padding-bottom:8px; margin-bottom:10px;">
                <span style="color:#f59e0b; font-size:9px; letter-spacing:1px;">★ DEV / DEBUG MENU</span>
                <button id="dev-close-btn" style="background:none; border:none; color:#ef4444; font-size:12px; cursor:pointer; font-family:inherit;">✕</button>
            </div>

            <div style="margin-bottom:12px;">
                <div style="color:#38bdf8; margin-bottom:6px;">WARP / SCENE SELECT:</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                    <button class="dev-btn" data-action="scene" data-target="LEVEL1">LEVEL 1 (SPACE)</button>
                    <button class="dev-btn" data-action="scene" data-target="LEVEL2">LEVEL 2 (MAZE)</button>
                    <button class="dev-btn" data-action="scene" data-target="LEVEL3">LEVEL 3 (SUBWAY)</button>
                    <button class="dev-btn" data-action="scene" data-target="LEVEL4">LEVEL 4 (BICEPS)</button>
                    <button class="dev-btn" data-action="scene" data-target="LEVEL5">LEVEL 5 (PLATFORM)</button>
                    <button class="dev-btn" data-action="scene" data-target="FINAL_SCREEN">FINAL SCREEN</button>
                </div>
            </div>

            <div style="margin-bottom:12px;">
                <div style="color:#22c55e; margin-bottom:6px;">HEARTS & HEALTH:</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                    <button class="dev-btn" data-action="reset-hearts">RESET HEARTS (5)</button>
                    <button class="dev-btn" data-action="lose-heart">LOSE 1 HEART</button>
                </div>
            </div>

            <div style="margin-bottom:12px;">
                <div style="color:#fbbf24; margin-bottom:6px;">GAMEPLAY CHEATS:</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                    <button class="dev-btn" data-action="power-up">GIVE LASER/BOOST</button>
                    <button class="dev-btn" data-action="add-p1-rep">+1 P1 REP</button>
                    <button class="dev-btn" data-action="add-p2-rep">+1 P2 REP</button>
                    <button class="dev-btn" data-action="toggle-test">TOGGLE TEST MODE</button>
                </div>
            </div>

            <div style="margin-bottom:12px;">
                <div style="color:#a855f7; margin-bottom:6px;">CV & SYSTEM:</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                    <button class="dev-btn" data-action="toggle-cam">TOGGLE CAMERA</button>
                    <button class="dev-btn" data-action="reload-level">RELOAD LEVEL</button>
                </div>
            </div>

            <div style="color:#6b7280; font-size:7px; text-align:center; margin-top:8px; border-top:1px solid #1f2937; padding-top:6px;">
                PRESS [CTRL + \\] TO TOGGLE
            </div>
        `;

        document.body.appendChild(menu);
        this.container = menu;

        // Apply styles to dev buttons
        const style = document.createElement("style");
        style.textContent = `
            .dev-btn {
                background: #1e293b;
                border: 1px solid #475569;
                color: #e2e8f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 7px;
                padding: 6px 4px;
                cursor: pointer;
                transition: background 0.1s, border-color 0.1s;
                text-align: center;
                line-height: 1.2;
            }
            .dev-btn:hover {
                background: #334155;
                border-color: #f59e0b;
                color: #fef08a;
            }
        `;
        document.head.appendChild(style);

        // Attach event listeners
        document.getElementById("dev-close-btn").addEventListener("click", () => this.hide());

        menu.addEventListener("click", (e) => {
            const btn = e.target.closest(".dev-btn");
            if (!btn) return;
            const action = btn.dataset.action;
            const target = btn.dataset.target;
            this.handleAction(action, target);
        });
    }

    bindShortcuts() {
        window.addEventListener("keydown", (e) => {
            if (e.ctrlKey && (e.key === "\\" || e.code === "Backslash")) {
                e.preventDefault();
                this.toggle();
            } else if (e.key === "Escape" && this.visible) {
                this.hide();
            }
        });
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        this.visible = true;
        if (this.container) this.container.style.display = "block";
    }

    hide() {
        this.visible = false;
        if (this.container) this.container.style.display = "none";
    }

    handleAction(action, target) {
        console.log(`[DevMenu] Action: ${action}, target: ${target}`);
        const sm = this.sceneManager;
        if (!sm) return;

        switch (action) {
            case "scene":
                sm.changeScene(target);
                this.hide();
                break;

            case "reset-hearts":
                if (sm.game) {
                    sm.game.lives = 5;
                    sm.game.maxLives = 5;
                    if (sm.game.hud) sm.game.hud.updateLives(5, 5);
                }
                if (sm.level3 && typeof sm.level3.resetHearts === "function") {
                    sm.level3.resetHearts();
                }
                if (sm.level5 && typeof sm.level5.resetHearts === "function") {
                    sm.level5.resetHearts();
                }
                break;

            case "lose-heart":
                if (sm.game && typeof sm.game.loseLife === "function" && sm.currentScene === "LEVEL1") {
                    sm.game.loseLife();
                } else if (sm.level3 && typeof sm.level3.loseHeart === "function") {
                    sm.level3.loseHeart();
                } else if (sm.level5 && typeof sm.level5.loseHeart === "function") {
                    sm.level5.loseHeart();
                }
                break;

            case "power-up":
                if (sm.game && typeof sm.game.activatePowerUp === "function") {
                    sm.game.activatePowerUp();
                }
                break;

            case "add-p1-rep":
                if (sm.level4 && typeof sm.level4.injectRep === "function") {
                    sm.level4.injectRep(1);
                }
                break;

            case "add-p2-rep":
                if (sm.level4 && typeof sm.level4.injectRep === "function") {
                    sm.level4.injectRep(2);
                }
                break;

            case "toggle-test":
                if (sm.level3 && typeof sm.level3.toggleTestMode === "function") {
                    sm.level3.toggleTestMode();
                }
                break;

            case "toggle-cam":
                const pip = document.getElementById("level4-pip-overlay") || document.getElementById("level5-pip-overlay");
                if (pip) {
                    pip.style.display = pip.style.display === "none" ? "block" : "none";
                }
                break;

            case "reload-level":
                sm.changeScene(sm.currentScene);
                this.hide();
                break;
        }
    }
}
