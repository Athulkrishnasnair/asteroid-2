// src/game/level3Movement.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommands, normalizeTranscript } from '../services/voiceRecognizer.js';

// Logical helper replicating Level 3 authoritative 3-lane state transitions
function computeNextLane(currentLane, direction) {
    // 0 = LEFT, 1 = MIDDLE, 2 = RIGHT
    // direction: -1 (left), 1 (right)
    return Math.max(0, Math.min(2, currentLane + direction));
}

function computeTargetX(centerX, laneSpacing, lane) {
    const lanePositions = [
        centerX - laneSpacing, // 0 = LEFT
        centerX,               // 1 = MIDDLE
        centerX + laneSpacing  // 2 = RIGHT
    ];
    return lanePositions[lane];
}

test('Level 3 Three-Lane Movement: All 6 transition cases', () => {
    // 1. Starting in MIDDLE (1) + "left" (-1) -> LEFT (0)
    let lane = 1;
    lane = computeNextLane(lane, -1);
    assert.equal(lane, 0, 'MIDDLE + left should transition to LEFT (0)');

    // 2. Starting in MIDDLE (1) + "right" (+1) -> RIGHT (2)
    lane = 1;
    lane = computeNextLane(lane, 1);
    assert.equal(lane, 2, 'MIDDLE + right should transition to RIGHT (2)');

    // 3. Starting in RIGHT (2) + "left" (-1) -> MIDDLE (1)
    lane = 2;
    lane = computeNextLane(lane, -1);
    assert.equal(lane, 1, 'RIGHT + left should transition to MIDDLE (1)');

    // 4. Starting in LEFT (0) + "right" (+1) -> MIDDLE (1)
    lane = 0;
    lane = computeNextLane(lane, 1);
    assert.equal(lane, 1, 'LEFT + right should transition to MIDDLE (1)');

    // 5. LEFT (0) + "left" (-1) -> stays LEFT (0)
    lane = 0;
    lane = computeNextLane(lane, -1);
    assert.equal(lane, 0, 'LEFT + left should stay in LEFT (0)');

    // 6. RIGHT (2) + "right" (+1) -> stays RIGHT (2)
    lane = 2;
    lane = computeNextLane(lane, 1);
    assert.equal(lane, 2, 'RIGHT + right should stay in RIGHT (2)');
});

test('Level 3 Three-Lane Movement: Target X coordinates are distinct and valid', () => {
    const centerX = 500;
    const laneSpacing = 110;

    const leftX = computeTargetX(centerX, laneSpacing, 0);
    const middleX = computeTargetX(centerX, laneSpacing, 1);
    const rightX = computeTargetX(centerX, laneSpacing, 2);

    assert.equal(leftX, 390, 'Left X should equal centerX - laneSpacing');
    assert.equal(middleX, 500, 'Middle X should equal centerX');
    assert.equal(rightX, 610, 'Right X should equal centerX + laneSpacing');

    assert.notEqual(leftX, middleX);
    assert.notEqual(middleX, rightX);
    assert.notEqual(leftX, rightX);
});

test('Level 3 Three-Lane Movement: Repeated left/right commands never exceed boundaries', () => {
    let lane = 1;

    // 10 consecutive left commands
    for (let i = 0; i < 10; i++) {
        lane = computeNextLane(lane, -1);
    }
    assert.equal(lane, 0, 'Repeated left commands must clamp at LEFT (0)');

    // 10 consecutive right commands
    for (let i = 0; i < 10; i++) {
        lane = computeNextLane(lane, 1);
    }
    assert.equal(lane, 2, 'Repeated right commands must clamp at RIGHT (2)');
});

test('Voice Command Normalization & Token Extraction: JUMP, DUCK, LEFT, RIGHT', () => {
    const jumpRaw = "jump";
    const duckRaw = "duck";
    const leftRaw = "go left";
    const rightRaw = "turn right now";

    assert.deepEqual(extractCommands(normalizeTranscript(jumpRaw)), ["JUMP"]);
    assert.deepEqual(extractCommands(normalizeTranscript(duckRaw)), ["DUCK"]);
    assert.deepEqual(extractCommands(normalizeTranscript(leftRaw)), ["LEFT"]);
    assert.deepEqual(extractCommands(normalizeTranscript(rightRaw)), ["RIGHT"]);

    // Multiple chained utterances
    const multiRaw = "left jump duck right";
    assert.deepEqual(extractCommands(normalizeTranscript(multiRaw)), ["LEFT", "JUMP", "DUCK", "RIGHT"]);
});
