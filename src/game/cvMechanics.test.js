// src/game/cvMechanics.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAngle, BicepRepTracker } from './Level4PowerMeter.js';
import { calculateSmileScore } from './Level5Platformer.js';

test('calculateAngle computes exact geometric angles', () => {
    // 90 degree right angle: (0, 1) -> (0, 0) -> (1, 0)
    const a = { x: 0, y: 1 };
    const b = { x: 0, y: 0 };
    const c = { x: 1, y: 0 };
    const angle90 = calculateAngle(a, b, c);
    assert.ok(Math.abs(angle90 - 90) < 0.01, `Expected 90, got ${angle90}`);

    // Straight line: (-1, 0) -> (0, 0) -> (1, 0) => 180 degrees
    const straightA = { x: -1, y: 0 };
    const straightC = { x: 1, y: 0 };
    const angle180 = calculateAngle(straightA, b, straightC);
    assert.ok(Math.abs(angle180 - 180) < 0.01, `Expected 180, got ${angle180}`);

    // Acute 45 degree angle: (1, 1) -> (0, 0) -> (1, 0)
    const acuteA = { x: 1, y: 1 };
    const angle45 = calculateAngle(acuteA, b, c);
    assert.ok(Math.abs(angle45 - 45) < 0.01, `Expected 45, got ${angle45}`);
});

test('BicepRepTracker completes full curl cycle and increments reps', () => {
    const tracker = new BicepRepTracker('P1');
    assert.equal(tracker.reps, 0);
    assert.equal(tracker.state, 'EXTENDED');

    // Feed extended arm angle (> 135 deg)
    const landmarksExtended = [
        ...Array(11).fill({ x: 0, y: 0 }),
        { x: 0.5, y: 0.2 }, // 11: L_SHOULDER
        { x: 0.5, y: 0.2 }, // 12: R_SHOULDER
        { x: 0.5, y: 0.5 }, // 13: L_ELBOW
        { x: 0.5, y: 0.5 }, // 14: R_ELBOW
        { x: 0.5, y: 0.8 }, // 15: L_WRIST (straight down => ~180 deg)
        { x: 0.5, y: 0.8 }  // 16: R_WRIST
    ];

    let t = 1000;
    for (let i = 0; i < 5; i++) {
        t += 33;
        tracker.update(landmarksExtended, t);
    }
    assert.equal(tracker.state, 'EXTENDED');

    // Move wrist upwards to start curling (~90 deg bend)
    const landmarksCurling = [
        ...Array(11).fill({ x: 0, y: 0 }),
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.7, y: 0.5 }, // 90 deg bend
        { x: 0.7, y: 0.5 }
    ];
    for (let i = 0; i < 5; i++) {
        t += 33;
        tracker.update(landmarksCurling, t);
    }
    assert.equal(tracker.state, 'CURLING');

    // Fully contracted arm (< 75 deg)
    const landmarksContracted = [
        ...Array(11).fill({ x: 0, y: 0 }),
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.25 }, // wrist close to shoulder => < 40 deg
        { x: 0.5, y: 0.25 }
    ];
    for (let i = 0; i < 5; i++) {
        t += 33;
        tracker.update(landmarksContracted, t);
    }
    assert.equal(tracker.state, 'CONTRACTED');

    // Return towards extended (> 135 deg) after cooldown
    t += 500;
    let completed = false;
    for (let i = 0; i < 6; i++) {
        t += 33;
        if (tracker.update(landmarksExtended, t)) {
            completed = true;
        }
    }
    assert.equal(completed, true, 'Rep should be completed');
    assert.equal(tracker.reps, 1, 'Reps should equal 1');
});

test('calculateSmileScore differentiates neutral and smiling facial landmarks', () => {
    // Neutral face: standard mouth width relative to eye distance
    // L_EYE_OUTER=33, R_EYE_OUTER=263, L_LIP_CORNER=61, R_LIP_CORNER=291, UPPER_LIP=13
    const neutralLandmarks = [];
    neutralLandmarks[33] = { x: 0.35, y: 0.3 };
    neutralLandmarks[263] = { x: 0.65, y: 0.3 }; // eyeW = 0.30
    neutralLandmarks[61] = { x: 0.38, y: 0.7 };
    neutralLandmarks[291] = { x: 0.62, y: 0.7 }; // mouthW = 0.24 (ratio = 0.8)
    neutralLandmarks[13] = { x: 0.5, y: 0.65 };  // topLip above mouth corners

    const neutralScore = calculateSmileScore(neutralLandmarks);
    assert.ok(neutralScore < 0.3, `Neutral score expected < 0.3, got ${neutralScore}`);

    // Smiling face: wide mouth width (0.36, ratio = 1.2) with lifted corners
    const smileLandmarks = [];
    smileLandmarks[33] = { x: 0.35, y: 0.3 };
    smileLandmarks[263] = { x: 0.65, y: 0.3 }; // eyeW = 0.30
    smileLandmarks[61] = { x: 0.32, y: 0.62 };
    smileLandmarks[291] = { x: 0.68, y: 0.62 }; // mouthW = 0.36 (ratio = 1.2)
    smileLandmarks[13] = { x: 0.5, y: 0.66 };   // corners are higher than top lip

    const smileScore = calculateSmileScore(smileLandmarks);
    assert.ok(smileScore > 0.5, `Smile score expected > 0.5, got ${smileScore}`);
});
