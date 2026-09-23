import { Application, Container, Text, Assets, Sprite, Texture, Rectangle, Graphics, TilingSprite } from "pixi.js";
import { Player } from "../entities/Player.js";
import { Input } from "./Input.js";
import { Alien, GoldenAlien } from "../entities/Alien.js";
import { Bullet } from "../entities/Bullet.js";
import { SoundManager } from "./SoundManager.js";
import { HUD } from "./HUD.js";
import { voice } from "../services/voice.js";
import { commentary } from "../services/commentary.js";

// Visual asset imports
import shipImg from "../assets/MeduimQualityAssets/MeduimQualityAssets/SpaceShip(256px).png";
import goldShipImg from "../assets/MeduimQualityAssets/MeduimQualityAssets/GoldShip256.png";
import alienImg from "../assets/MeduimQualityAssets/MeduimQualityAssets/AlienSprite(m).png";
import bulletImg from "../assets/MeduimQualityAssets/MeduimQualityAssets/Bullet100.png";
import crosshairImg from "../assets/MeduimQualityAssets/MeduimQualityAssets/CrossHair(300px).png";
import bgImg from "../assets/MeduimQualityAssets/MeduimQualityAssets/TilableSpace.png";
import debrisImg from "../assets/MeduimQualityAssets/MeduimQualityAssets/AsteroidsAndAliens2(l).png";
import portalSheetImg from "../assets/Platformer assets/Animated Sprites/GandalfHardcore Portal sheet.png";
import hpBarImg from "../assets/Health etc/Hp bar.png";
import redBarImg from "../assets/Health etc/red bar.png";
import charIdleImg from "../assets/Characters/char_idle.png";
import charRightImg from "../assets/Characters/char_right_idle.png";
import floorTileImg from "../assets/Platformer assets/Floor Tiles1.png";

export class Game {
    constructor() {
        this.app = new Application();
        this.input = new Input();
        this.soundManager = new SoundManager();
        this.hud = null;
        this.active = true;
        this.onLevelComplete = null;


        // Texture storage
        this.textures = {
            playerFrames: null,
            goldFrames: null,
            alienFrames: null,
            bullet: null,
            crosshair: null,
            bg: null,
            debrisFrames: null,
            portalFrames: null,
            hpBar: null,
            redBar: null,
            charIdle: null,
            charRight: null,
            floorTile: null,
        };

        this.debrisList = [];
        this.missStreak = 0;
        this.survivalTimer = 0;
        this.survivalMilestoneTriggered = false;

        this.world = new Container();
        this.player = new Player();

        // Adding alien to the game world
        this.aliens = [];

        this.aliens.push(new Alien(100, 200));
        this.aliens.push(new Alien(400, 300));
        this.aliens.push(new Alien(600, 100));
    
        // Adding bullets to the game world
        this.bullets = [];

        // Adding a score property to keep track of the player's score
        this.score = 0;
        this.scoreText = new Text({
            text: "Score: 0",
            style: {
                fontSize: 24,
                fill: "white",
            },
        });
        this.scoreText.visible = false; // Managed by retro HUD
        
        // Spawn Timer for aliens (in seconds)
        this.spawnTimer = 0;
        this.spawnTimerMax = 2; // Spawn a new alien every 2 seconds
           
        // Game over 
        this.gameOver = false;
        this.gameOverText = new Text({
            text: "GAME OVER\nPress R to restart",
            style: {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 32,
                fill: "#EF4444",
                align: "center",
                lineHeight: 48,
            }
        });
    
        // Anchor the text
        this.gameOverText.anchor.set(0.5);
        this.gameOverText.visible = false;

        // Level complete state and text
        this.levelComplete = false;
        this.levelCompleteText = new Text({
            text: "LEVEL COMPLETE!\nSECTOR CV-07 SECURED",
            style: {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 32,
                fill: "#FBBF24",
                align: "center",
                lineHeight: 48,
            }
        });
        this.levelCompleteText.anchor.set(0.5);
        this.levelCompleteText.visible = false;

        // Crosshair
        this.mouse = {
            x: 0,
            y: 0,
            leftDown: false,
        };

        // Shooting cooldown (in seconds)
        this.shootCooldown = 0;
        this.shootCooldownMax = 0.2; // 200 ms between shots when holding left-click
        

        // Add 5 lives
        this.lives = 5;
        this.maxLives = 5;

        // Life text (managed by HUD)
        this.lifeText = new Text({
            text: "Lives: ❤️❤️❤️❤️❤️",
            style: {
                fontSize: 24,
                fill: "white",
            },
        });
        this.lifeText.visible = false;

        // Player invulnerability (in seconds)
        this.invulnerableTimer = 0;
        this.invulnerableDuration = 2;

        this.finalLife = false;

        // Power-up state (in seconds)
        this.powerUpActive = false;
        this.powerUpTimer = 0;
        this.powerUpDuration = 5;

        // Golden alien (in seconds)
        this.goldenAlien = null;
        this.goldenAlienSpawned = false;
        this.goldenAlienTimer = 0;
        this.goldenAlienDelay = 12; // Spawns after 12 seconds

        // Screen shake (in seconds)
        this.shakeDuration = 0.25; // 250 ms
        this.shakeTimer = 0;
        this.shakeIntensity = 8;
    }

    // Preload textures with nearest-neighbor filtering and frame slicing
    async loadGameAssets() {
        try {
            const [
                baseShip, baseGold, baseAlien, bulletTex, crosshairTex, bgTex, baseDebris,
                basePortal, hpBarTex, redBarTex, charIdleTex, charRightTex, floorTileTex
            ] = await Promise.all([
                Assets.load(shipImg),
                Assets.load(goldShipImg),
                Assets.load(alienImg),
                Assets.load(bulletImg),
                Assets.load(crosshairImg),
                Assets.load(bgImg),
                Assets.load(debrisImg),
                Assets.load(portalSheetImg).catch(() => null),
                Assets.load(hpBarImg).catch(() => null),
                Assets.load(redBarImg).catch(() => null),
                Assets.load(charIdleImg).catch(() => null),
                Assets.load(charRightImg).catch(() => null),
                Assets.load(floorTileImg).catch(() => null),
            ]);

            // Nearest-neighbor scaling for crisp pixel art
            baseShip.source.scaleMode = "nearest";
            baseGold.source.scaleMode = "nearest";
            baseAlien.source.scaleMode = "nearest";
            bulletTex.source.scaleMode = "nearest";
            crosshairTex.source.scaleMode = "nearest";
            bgTex.source.scaleMode = "nearest";
            baseDebris.source.scaleMode = "nearest";

            // Player frames (2 vertical frames of 256x256)
            this.textures.playerFrames = [
                new Texture({ source: baseShip.source, frame: new Rectangle(0, 0, 256, 256) }),
                new Texture({ source: baseShip.source, frame: new Rectangle(0, 256, 256, 256) }),
            ];

            // Golden alien frames (2 vertical frames of 256x256)
            this.textures.goldFrames = [
                new Texture({ source: baseGold.source, frame: new Rectangle(0, 0, 256, 256) }),
                new Texture({ source: baseGold.source, frame: new Rectangle(0, 256, 256, 256) }),
            ];

            // Normal alien frames (6 frames: 2 cols x 3 rows of 810x810)
            this.textures.alienFrames = [
                new Texture({ source: baseAlien.source, frame: new Rectangle(0, 0, 810, 810) }),
                new Texture({ source: baseAlien.source, frame: new Rectangle(810, 0, 810, 810) }),
                new Texture({ source: baseAlien.source, frame: new Rectangle(0, 810, 810, 810) }),
                new Texture({ source: baseAlien.source, frame: new Rectangle(810, 810, 810, 810) }),
                new Texture({ source: baseAlien.source, frame: new Rectangle(0, 1620, 810, 810) }),
                new Texture({ source: baseAlien.source, frame: new Rectangle(810, 1620, 810, 810) }),
            ];

            this.textures.bullet = bulletTex;
            this.textures.crosshair = crosshairTex;
            this.textures.bg = bgTex;

            // Debris frames from AsteroidsAndAliens2 (3 rock chunks of 800x800)
            this.textures.debrisFrames = [
                new Texture({ source: baseDebris.source, frame: new Rectangle(0, 0, 800, 800) }),
                new Texture({ source: baseDebris.source, frame: new Rectangle(800, 0, 800, 800) }),
                new Texture({ source: baseDebris.source, frame: new Rectangle(0, 800, 800, 800) }),
            ];

            // Animated portal frames (10 frames of 64x64 from 640x64 sheet)
            if (basePortal) {
                basePortal.source.scaleMode = "nearest";
                this.textures.portalFrames = [];
                for (let i = 0; i < 10; i++) {
                    this.textures.portalFrames.push(
                        new Texture({ source: basePortal.source, frame: new Rectangle(i * 64, 0, 64, 64) })
                    );
                }
            }

            // Health bar textures
            if (hpBarTex) {
                hpBarTex.source.scaleMode = "nearest";
                this.textures.hpBar = hpBarTex;
            }
            if (redBarTex) {
                redBarTex.source.scaleMode = "nearest";
                this.textures.redBar = redBarTex;
            }

            // Character textures
            if (charIdleTex) {
                charIdleTex.source.scaleMode = "nearest";
                this.textures.charIdle = charIdleTex;
            }
            if (charRightTex) {
                charRightTex.source.scaleMode = "nearest";
                this.textures.charRight = charRightTex;
            }
            if (floorTileTex) {
                floorTileTex.source.scaleMode = "nearest";
                this.textures.floorTile = floorTileTex;
            }

            console.log("All game visual assets loaded successfully!");
        } catch (err) {
            console.warn("Asset loading notice (using graphics fallback):", err);
        }
    }

    async start() {
        await this.app.init({
            resizeTo: window,
            background: "#111827",
        });

        // Preload visual assets with pixel-art nearest filtering
        await this.loadGameAssets();

        document.body.appendChild(this.app.canvas);

        // Parallax scrolling space background
        if (this.textures.bg) {
            this.bgSprite = new TilingSprite({
                texture: this.textures.bg,
                width: this.app.screen.width,
                height: this.app.screen.height,
            });
            this.world.addChildAt(this.bgSprite, 0);
        }

        // Mouse crosshair and controls
        this.app.canvas.addEventListener("mousemove", (e) => {
            const rect = this.app.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        this.app.canvas.addEventListener("mousedown", (e) => {
            if (e.button === 0) {
                this.mouse.leftDown = true;
            } else if (e.button === 2) {
                // Right click activates power-up
                this.activatePowerUp();
            }
        });

        this.app.canvas.addEventListener("mouseup", (e) => {
            if (e.button === 0) {
                this.mouse.leftDown = false;
            }
        });

        // Ensure leftDown resets if cursor released outside canvas
        window.addEventListener("mouseup", (e) => {
            if (e.button === 0) {
                this.mouse.leftDown = false;
            }
        });

        // Prevent browser context menu on right-click
        this.app.canvas.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });

        // Crosshair: use pixel asset sprite or fallback to Graphics
        if (this.textures.crosshair) {
            this.crosshair = new Sprite(this.textures.crosshair);
            this.crosshair.anchor.set(0.5);
            this.crosshair.width = 30;
            this.crosshair.height = 30;
        } else {
            this.crosshair = new Graphics();
            this.crosshair.circle(0, 0, 10);
            this.crosshair.stroke({
                color: 0xffffff,
                width: 2
            });
        }

        this.app.stage.addChild(this.world);
        this.app.stage.addChild(this.crosshair);

        // Apply loaded textures to initial player and aliens
        if (this.textures.playerFrames) {
            this.player.setTextures(this.textures.playerFrames);
        }
        for (const alien of this.aliens) {
            if (this.textures.alienFrames) {
                alien.setTextures(this.textures.alienFrames);
            }
        }

        this.setupPlayer();
        this.setupAlien();

        // Retro HUD (anchored to stage, immune to screen shake)
        this.hud = new HUD(this.app, this.soundManager);
        this.hud.updateScore(this.score);
        this.hud.updateLives(this.lives, this.maxLives);
        this.app.stage.addChild(this.hud.container);

        // Game over and level complete overlays
        this.app.stage.addChild(this.gameOverText);
        this.gameOverText.x = this.app.screen.width / 2;
        this.gameOverText.y = this.app.screen.height / 2;

        this.app.stage.addChild(this.levelCompleteText);
        this.levelCompleteText.x = this.app.screen.width / 2;
        this.levelCompleteText.y = this.app.screen.height / 2;

        // Window resize handler
        window.addEventListener("resize", () => {
            if (this.hud) this.hud.resize();
            if (this.bgSprite) {
                this.bgSprite.width = this.app.screen.width;
                this.bgSprite.height = this.app.screen.height;
            }
            this.gameOverText.x = this.app.screen.width / 2;
            this.gameOverText.y = this.app.screen.height / 2;
            this.levelCompleteText.x = this.app.screen.width / 2;
            this.levelCompleteText.y = this.app.screen.height / 2;
        });

        this.app.ticker.add((ticker) => {
            this.update(ticker.deltaTime);
        });
    }

    // Initialize the player and add it to the game world
    setupPlayer() {
        this.player.sprite.x = this.app.screen.width / 2;
        this.player.sprite.y = this.app.screen.height / 2;

        this.world.addChild(this.player.sprite);
    }

    // Initialize the alien and add it to the game world
    setupAlien() {
        for (const alien of this.aliens) {
            this.world.addChild(alien.sprite);
        }
    }

    // Spawn pixel-art asteroid debris upon alien destruction
    spawnDebris(x, y) {
        if (!this.textures.debrisFrames || this.textures.debrisFrames.length === 0) return;
        const count = 4;
        for (let i = 0; i < count; i++) {
            const frame = this.textures.debrisFrames[i % this.textures.debrisFrames.length];
            const s = new Sprite(frame);
            s.anchor.set(0.5);
            s.x = x;
            s.y = y;
            s.width = 18;
            s.height = 18;

            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2.5;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const rotSpeed = (Math.random() - 0.5) * 0.2;

            this.debrisList.push({ sprite: s, vx, vy, rotSpeed, life: 1.0 });
            this.world.addChild(s);
        }
    }

    // Update debris particles
    updateDebris(deltaTime) {
        for (let i = this.debrisList.length - 1; i >= 0; i--) {
            const d = this.debrisList[i];
            d.sprite.x += d.vx * deltaTime;
            d.sprite.y += d.vy * deltaTime;
            d.sprite.rotation += d.rotSpeed * deltaTime;
            d.life -= (deltaTime / 60) * 2.2; // ~0.45s lifespan
            d.sprite.alpha = Math.max(0, d.life);

            if (d.life <= 0) {
                this.world.removeChild(d.sprite);
                d.sprite.destroy();
                this.debrisList.splice(i, 1);
            }
        }
    }

    // Shoot a bullet from the player's position
    shoot() {
        const bullet = new Bullet(
            this.player.sprite.x,
            this.player.sprite.y,
            this.mouse.x,
            this.mouse.y,
            this.textures.bullet
        );

        this.bullets.push(bullet);
        this.world.addChild(bullet.sprite);

        // Play shoot laser sound
        this.soundManager.playShoot();

        // Track miss streak
        this.missStreak++;
        if (this.missStreak === 6 && this.hud) {
            this.hud.triggerJoke("missStreak");
            commentary.recordStat("level1Misses", 6);
        }
    }

    // Remove a bullet from the game world and the bullets array
    removeBullet(bullet) {

        // Remoce the bullet's sprite from the world
        this.world.removeChild(bullet.sprite);;

        // Destroy the bullet's sprite to free up resources
        bullet.sprite.destroy();

        // Remove the bullet from the bullets array
        const index = this.bullets.indexOf(bullet);
        if (index !== -1) {
             this.bullets.splice(index, 1);
     }        
    }

    // Remove an alien from the game world and the aliens array
    removeAlien(alien) {
        // Remove the alien's sprite from the world
        this.world.removeChild(alien.sprite);

        // Destroy the alien's sprite to free up resources
        alien.sprite.destroy();

        // Remove the aliens array
        const index = this.aliens.indexOf(alien);
        if (index !== -1) {
            this.aliens.splice(index, 1);
        }

    }

    // Spwan alien
    spawnAlien() {
        // const x = Math.random() * this.app.screen.width;
        // const y = Math.random() * this.app.screen.height;

        let x;
        let y;

        const side = Math.floor(Math.random() * 4);

        if (side === 0) {
            // Top
            x = Math.random() * this.app.screen.width;
            y = -50
        } else if (side === 1) {
        // Right
        x = this.app.screen.width + 50;
        y = Math.random() * this.app.screen.height;
        } else if (side === 2) {
            // Bottom
            x = Math.random() * this.app.screen.width;
            y = this.app.screen.height + 50;
        } else {
            // Left
            x = -50;
            y = Math.random() * this.app.screen.height;
        }

        const alien = new Alien(x, y, this.textures.alienFrames);

        if (this.finalLife) {
            alien.speed *= 1.8;
        }

        this.aliens.push(alien);
        this.world.addChild(alien.sprite);
    }

    // Restart Game
    restart() {
        this.gameOver = false;
        this.levelComplete = false;
        this.score = 0;
        this.scoreText.text = "Score: 0";
        if (this.hud) {
            this.hud.reset();
            this.hud.updateScore(0);
            this.hud.updateLives(this.maxLives, this.maxLives);
            this.hud.updatePowerUp(false, 0);
        }
        
        this.lives = this.maxLives;
        this.finalLife = false;
        this.invulnerableTimer = 0;
        this.player.sprite.alpha = 1.0;
        this.updateLifeText();

        this.powerUpActive = false;
        this.powerUpTimer = 0;
        this.player.deactivatePowerUp();

        this.goldenAlienSpawned = false;
        this.goldenAlienTimer = 0;
        this.removeGoldenAlien();

        this.world.x = 0;
        this.world.y = 0;
        this.shakeTimer = 0;
        this.shootCooldown = 0;

        // Clean up active debris
        for (const d of this.debrisList) {
            this.world.removeChild(d.sprite);
            d.sprite.destroy();
        }
        this.debrisList = [];

        this.missStreak = 0;
        this.survivalTimer = 0;
        this.survivalMilestoneTriggered = false;

        this.gameOverText.visible = false;
        this.levelCompleteText.visible = false;

        // Put player back in center
        this.player.sprite.x = this.app.screen.width / 2;
        this.player.sprite.y = this.app.screen.height / 2;

        // Remove existing aliens
        for (const alien of [...this.aliens]) {
            this.removeAlien(alien);
        }

        // Remove Bullets
        for (const bullet of [...this.bullets]) {
            this.removeBullet(bullet);
        }

        // Reset spawn timer
        this.spawnTimer = 0;

        // Add a few starting aliens
        this.aliens.push(new Alien(-100, 200, this.textures.alienFrames));
        this.aliens.push(new Alien(400, 300, this.textures.alienFrames));
        this.aliens.push(new Alien(600, 100, this.textures.alienFrames));

        this.setupAlien();
    }

    // Update life
    updateLifeText() {
        this.lifeText.text =
            "Lives: " + "❤️".repeat(this.lives) + "🖤".repeat(this.maxLives - this.lives);
    }

    // Power-up activation (triggered by right-click)
    activatePowerUp() {
        if (this.powerUpActive || this.gameOver || this.levelComplete) {
            return;
        }

        this.powerUpActive = true;
        this.powerUpTimer = this.powerUpDuration;
        this.player.activatePowerUp();

        this.soundManager.playPowerUp();
        if (this.hud) {
            this.hud.updatePowerUp(true, this.powerUpTimer);
            this.hud.triggerJoke("powerUp", true);
        }

        console.log("POWER-UP ACTIVATED");
    }

    // Update power-up duration
    updatePowerUp(deltaTime) {
        if (!this.powerUpActive) {
            return;
        }

        this.powerUpTimer -= deltaTime / 60;
        if (this.hud) {
            this.hud.updatePowerUp(this.powerUpActive, this.powerUpTimer);
        }

        if (this.powerUpTimer <= 0) {
            this.powerUpActive = false;
            this.powerUpTimer = 0;
            this.player.deactivatePowerUp();
            if (this.hud) {
                this.hud.updatePowerUp(false, 0);
            }

            console.log("POWER-UP ENDED");
        }
    }

    // Trigger subtle screen shake on world container (camera impact)
    triggerScreenShake(duration = 0.25, intensity = 8) {
        this.shakeDuration = duration;
        this.shakeTimer = duration;
        this.shakeIntensity = intensity;
    }

    // Update screen shake offset
    updateScreenShake(deltaTime) {
        if (this.shakeTimer > 0) {
            this.shakeTimer -= deltaTime / 60;
            if (this.shakeTimer <= 0) {
                this.shakeTimer = 0;
                this.world.x = 0;
                this.world.y = 0;
            } else {
                const progress = this.shakeTimer / this.shakeDuration;
                const currentIntensity = this.shakeIntensity * progress;
                this.world.x = (Math.random() * 2 - 1) * currentIntensity;
                this.world.y = (Math.random() * 2 - 1) * currentIntensity;
            }
        }
    }

    // Lose life
    loseLife() {
        this.lives--;
        this.updateLifeText();
        if (this.hud) {
            this.hud.updateLives(this.lives, this.maxLives);
        }

        this.soundManager.playPlayerHit();

        if (this.hud) {
            if (this.lives === 1) {
                this.hud.triggerJoke("finalLife", true);
            } else if (this.lives > 0) {
                this.hud.triggerJoke("playerHit", true);
            }
        }

        // Reset player to center
        this.player.sprite.x = this.app.screen.width / 2;
        this.player.sprite.y = this.app.screen.height / 2;

        this.invulnerableTimer = this.invulnerableDuration;

        // Push any nearby aliens away from the center spawn point
        for (const alien of this.aliens) {
            const dx = alien.sprite.x - this.player.sprite.x;
            const dy = alien.sprite.y - this.player.sprite.y;
            const dist = Math.hypot(dx, dy);
            const minSafe = this.player.radius + alien.radius + 40;
            if (dist < minSafe) {
                const angle = dist > 0 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
                alien.sprite.x = this.player.sprite.x + Math.cos(angle) * minSafe;
                alien.sprite.y = this.player.sprite.y + Math.sin(angle) * minSafe;
            }
        }

        // Trigger short camera shake
        this.triggerScreenShake(0.25, 8);

        // Last life: aliens become threatening but harmless
        if (this.lives === 1) {
            this.enterFinalLife();
        }
    }

    // Third-life behavior initialization
    enterFinalLife() {
        if (this.finalLife) return;
        this.finalLife = true;

        for (const alien of this.aliens) {
            alien.speed *= 1.8;
        }
    }

    // Golden alien spawn
    spawnGoldenAlien() {
        this.goldenAlienSpawned = true;
        console.log("GOLDEN ALIEN HAS ARRIVED!");

        this.goldenAlien = new GoldenAlien(this.app.screen.width / 2, 100, this.textures.goldFrames);
        this.world.addChild(this.goldenAlien.sprite);

        this.soundManager.playGoldenSpawn();
        if (this.hud) {
            this.hud.triggerJoke("goldenSpawn", true);
        }
    }

    // Remove golden alien safely
    removeGoldenAlien() {
        if (this.goldenAlien) {
            this.world.removeChild(this.goldenAlien.sprite);
            this.goldenAlien.destroy();
            this.goldenAlien = null;
        }
    }

    // Complete Level 1
    completeLevel() {
        this.levelComplete = true;
        this.levelCompleteText.visible = true;
        console.log("LEVEL 1 COMPLETE!");

        this.soundManager.playLevelComplete();

        // Reset any camera shake or power-up
        this.world.x = 0;
        this.world.y = 0;
        this.shakeTimer = 0;

        if (this.powerUpActive) {
            this.powerUpActive = false;
            this.powerUpTimer = 0;
            this.player.deactivatePowerUp();
            if (this.hud) {
                this.hud.updatePowerUp(false, 0);
            }
        }

        // Clear remaining bullets
        for (const bullet of [...this.bullets]) {
            this.removeBullet(bullet);
        }

        // Trigger voice commentary for level 1 complete
        voice.commentate("LEVEL1_COMPLETE");

        // Hook for Level 2 transition
        this.startLevel2();
    }

    // Clear hook where Level 2 or cutscene can be started
    startLevel2() {
        if (typeof this.onLevelComplete === "function") {
            setTimeout(() => {
                this.onLevelComplete();
            }, 1800);
        }
    }

    hide() {
        this.active = false;
        this.world.visible = false;
        if (this.hud) this.hud.container.visible = false;
        if (this.crosshair) this.crosshair.visible = false;
        this.levelCompleteText.visible = false;
        this.gameOverText.visible = false;
    }

    show() {
        this.active = true;
        this.world.visible = true;
        if (this.hud) this.hud.container.visible = true;
        if (this.crosshair) this.crosshair.visible = true;
    }

    // Game logic update method, called every frame by the ticker
    update(deltaTime) {
        if (!this.active) return;

        // Restart game
        if (this.gameOver) {
            if (this.input.wasPressed("r")) {
                this.restart();
            }
            return;
        }

        // If level is complete, freeze gameplay updates
        if (this.levelComplete) {
            return;
        }


        // Subtle background stars drift
        if (this.bgSprite) {
            this.bgSprite.tilePosition.y += 0.4 * deltaTime;
        }

        // Screen shake camera update
        this.updateScreenShake(deltaTime);

        // Update debris particles
        this.updateDebris(deltaTime);

        // Update HUD animations, timers, and commentary ticker
        if (this.hud) {
            this.hud.update(deltaTime);
        }

        // Central Vienium survival milestone commentary (30s)
        this.survivalTimer += deltaTime / 60;
        if (!this.survivalMilestoneTriggered && this.survivalTimer >= 30) {
            this.survivalMilestoneTriggered = true;
            if (this.hud) {
                this.hud.triggerJoke("survival");
            }
        }

        // Player invulnerability update and visual flash feedback
        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer -= deltaTime / 60;
            this.player.sprite.alpha = Math.floor(this.invulnerableTimer * 8) % 2 === 0 ? 0.4 : 0.9;
        } else {
            this.player.sprite.alpha = 1.0;
        }

        // Power-up duration update
        this.updatePowerUp(deltaTime);

        // Crosshair position
        this.crosshair.x = this.mouse.x;
        this.crosshair.y = this.mouse.y;

        // Alien spawn timer (in seconds)
        this.spawnTimer += deltaTime / 60;
        if (this.spawnTimer >= this.spawnTimerMax) {
            this.spawnAlien();
            this.spawnTimer = 0;
        }

        // Golden alien appears after delay (in seconds)
        this.goldenAlienTimer += deltaTime / 60;
        if (
            !this.goldenAlienSpawned &&
            this.goldenAlienTimer >= this.goldenAlienDelay
        ) {
            this.spawnGoldenAlien();
        }

        // Update golden alien movement if present
        if (this.goldenAlien) {
            this.goldenAlien.update(
                deltaTime,
                this.player,
                this.app.screen.width,
                this.app.screen.height
            );
        }

        // Update the player based on input and deltaTime
        this.player.update(this.input, deltaTime);
        this.player.clampToScreen(
            this.app.screen.width,
            this.app.screen.height
        );

        // Shooting cooldown (in seconds) & firing logic
        if (this.shootCooldown > 0) {
            this.shootCooldown -= deltaTime / 60;
        }

        const wantsToShoot = this.input.wasPressed(" ") || this.mouse.leftDown;
        if (wantsToShoot && this.shootCooldown <= 0) {
            this.shoot();
            this.shootCooldown = this.shootCooldownMax;
        }

        // Normal and final life alien behavior
        for (const alien of this.aliens) {
            if (this.finalLife) {
                // Final life: separate movement logic that guarantees distance >= safeDistance
                const safeDistance = this.player.radius + alien.radius + 80;
                alien.updateFinalLife(this.player, deltaTime, safeDistance);
                // Completely skip normal-life collision check and damage
                continue;
            }

            // Normal-life behavior: alien chases player
            alien.update(this.player, deltaTime);

            // Re-check distance to strictly prevent visual overlap and handle damage
            const newDx = alien.sprite.x - this.player.sprite.x;
            const newDy = alien.sprite.y - this.player.sprite.y;
            const newDistance = Math.hypot(newDx, newDy);
            const minDistance = this.player.radius + alien.radius;

            if (newDistance < minDistance) {
                // Push alien to the boundary so it never visually overlaps the player
                if (newDistance > 0) {
                    alien.sprite.x = this.player.sprite.x + (newDx / newDistance) * minDistance;
                    alien.sprite.y = this.player.sprite.y + (newDy / newDistance) * minDistance;
                }

                // Damage player if not invulnerable
                if (
                    this.invulnerableTimer <= 0 &&
                    this.player.isColliding(alien)
                ) {
                    this.loseLife();
                    break; // Only one alien damages the player per frame
                }
            }
        }

        // Bullets update and collision
        for (const bullet of [...this.bullets]) {
            bullet.update(deltaTime);

            // Clean up bullets that have left the screen
            if (
                bullet.sprite.x < -100 ||
                bullet.sprite.x > this.app.screen.width + 100 ||
                bullet.sprite.y < -100 ||
                bullet.sprite.y > this.app.screen.height + 100
            ) {
                this.removeBullet(bullet);
                continue;
            }

            // Check collision with golden alien
            if (this.goldenAlien && bullet.isColliding(this.goldenAlien)) {
                console.log("Bullet hit golden alien!");
                this.score += 500;
                this.scoreText.text = `Score: ${this.score}`;
                if (this.hud) {
                    this.hud.updateScore(this.score);
                    this.hud.triggerJoke("goldenHit", true);
                }
                commentary.setStat("level1GoldenHit", true);

                this.soundManager.playGoldenHit();
                this.spawnDebris(this.goldenAlien.sprite.x, this.goldenAlien.sprite.y);
                this.missStreak = 0;

                this.removeBullet(bullet);
                this.removeGoldenAlien();
                this.completeLevel();
                break;
            }

            // Check for collision between the bullet and each normal alien
            for (const alien of [...this.aliens]) {
                if (bullet.isColliding(alien)) {
                    console.log("Bullet hit alien!");

                    this.score += 100;
                    this.scoreText.text = `Score: ${this.score}`;
                    if (this.hud) {
                        this.hud.updateScore(this.score);
                        this.hud.triggerJoke("alienKill");
                    }
                    commentary.recordStat("level1Kills");

                    this.soundManager.playAlienExplosion();
                    this.spawnDebris(alien.sprite.x, alien.sprite.y);
                    this.missStreak = 0;

                    this.removeAlien(alien);
                    this.removeBullet(bullet);
                    break;
                }
            }
        }

        // Clear the justPressedKeys set at the end of each frame
        this.input.update();
    }
}
