// src/game/level2Laser.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

// Helper replicating Level 2 exact line-segment to circle collision detection
function checkLaserCollision(x1, y1, x2, y2, px, py, radius) {
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

class Level2HealthSimulation {
    constructor() {
        this.lives = 5;
        this.maxLives = 5;
        this.invulnerableTimer = 0;
        this.gameOver = false;
    }

    update(dtSec) {
        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dtSec);
        }
    }

    loseHeart() {
        if (this.gameOver || this.invulnerableTimer > 0) return false;
        this.lives--;
        this.invulnerableTimer = 1.5;
        if (this.lives <= 0) {
            this.gameOver = true;
        }
        return true;
    }

    resetHearts() {
        this.lives = this.maxLives;
        this.gameOver = false;
        this.invulnerableTimer = 0;
    }
}

test('Level 2 Laser Collision: Detects direct hit and near miss', () => {
    // Vertical laser line from (200, 100) to (200, 300)
    const x1 = 200, y1 = 100, x2 = 200, y2 = 300;
    const radius = 14;

    // Player positioned directly on the laser beam at (200, 200)
    assert.ok(checkLaserCollision(x1, y1, x2, y2, 200, 200, radius), 'Player directly on beam should collide');

    // Player grazing the beam within radius at (210, 200) -> distance = 10 <= 17
    assert.ok(checkLaserCollision(x1, y1, x2, y2, 210, 200, radius), 'Player within collision radius should collide');

    // Player safely away from the beam at (240, 200) -> distance = 40 > 17
    assert.ok(!checkLaserCollision(x1, y1, x2, y2, 240, 200, radius), 'Player outside radius should not collide');

    // Player beyond laser vertical bounds at (200, 50) -> distance = 50 > 17
    assert.ok(!checkLaserCollision(x1, y1, x2, y2, 200, 50, radius), 'Player above beam should not collide');
});

test('Level 2 Damage Cooldown: Exactly 1 heart lost per laser hit over continuous frames', () => {
    const sim = new Level2HealthSimulation();
    assert.equal(sim.lives, 5);

    // Frame 1: Player enters laser beam
    const damagedFrame1 = sim.loseHeart();
    assert.ok(damagedFrame1, 'First contact should deal damage');
    assert.equal(sim.lives, 4, 'Lives should be 4');
    assert.ok(sim.invulnerableTimer > 1.0, 'Invulnerability cooldown must be active');

    // Next 60 frames (1 second inside the beam at 60fps)
    const dtSec = 1 / 60;
    for (let frame = 0; frame < 60; frame++) {
        sim.update(dtSec);
        const damageAttempt = sim.loseHeart();
        assert.equal(damageAttempt, false, 'Continuous contact during cooldown must NOT remove additional hearts');
    }

    assert.equal(sim.lives, 4, 'Lives must remain at 4 during invulnerability period');

    // Advance past the 1.5s invulnerability cooldown
    sim.update(0.6);
    assert.equal(sim.invulnerableTimer, 0, 'Invulnerability timer should have expired');

    // Second hit after cooldown expires
    const damagedHit2 = sim.loseHeart();
    assert.ok(damagedHit2, 'Hit after cooldown should deal damage');
    assert.equal(sim.lives, 3, 'Lives should now be 3');
});

test('Level 2 Health: Resetting hearts restores 5 lives and clears game-over state', () => {
    const sim = new Level2HealthSimulation();

    // Deplete all lives
    for (let i = 0; i < 5; i++) {
        sim.invulnerableTimer = 0;
        sim.loseHeart();
    }

    assert.equal(sim.lives, 0);
    assert.equal(sim.gameOver, true);

    // Restart / Reset
    sim.resetHearts();
    assert.equal(sim.lives, 5, 'Hearts should reset to 5');
    assert.equal(sim.gameOver, false, 'Game over should be false');
    assert.equal(sim.invulnerableTimer, 0, 'Cooldown should be cleared');
});
