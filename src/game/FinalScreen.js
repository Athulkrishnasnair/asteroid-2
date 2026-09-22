// src/game/FinalScreen.js
// Final Screen & Evaluation Suite for Central Vienium
// Includes: Step-Forward detection, Area of Expertise Interview with Piper questions,
// dramatic animated fictional meters, contextual dynamic Alien Roast, and Archive QR.

import { Container, Graphics, Text, AnimatedSprite } from "pixi.js";
import { commentary } from "../services/commentary.js";

const TOPICS = [
    "Programming",
    "Computer Science",
    "Mathematics",
    "Physics",
    "Electronics",
    "Engineering",
    "Biology",
    "Chemistry",
    "History",
    "Music",
    "Art",
    "Gaming",
    "General Knowledge",
];

const QUESTIONS_BY_TOPIC = {
    Programming: {
        q: "What is the time complexity of searching an item in a balanced binary search tree?",
        options: ["A) O(1)", "B) O(log n)", "C) O(n)", "D) O(n^2)"],
        correct: 1,
    },
    "Computer Science": {
        q: "In cryptography, what does RSA rely on for security?",
        options: ["A) Elliptic curves", "B) Prime factorization", "C) SHA-256", "D) Quantum tunneling"],
        correct: 1,
    },
    Mathematics: {
        q: "What is the derivative of the natural logarithm function ln(x)?",
        options: ["A) 1/x", "B) e^x", "C) x", "D) 1/(x^2)"],
        correct: 0,
    },
    Physics: {
        q: "Which physical constant defines the quantum of electromagnetic action?",
        options: ["A) Planck's constant", "B) Boltzmann's constant", "C) Speed of light", "D) Gravitational constant"],
        correct: 0,
    },
    Electronics: {
        q: "Which electronic component opposes sudden changes in current?",
        options: ["A) Capacitor", "B) Resistor", "C) Inductor", "D) Diode"],
        correct: 2,
    },
    Engineering: {
        q: "In structural mechanics, what is the ratio of stress to strain in the elastic region?",
        options: ["A) Poisson's ratio", "B) Young's modulus", "C) Shear modulus", "D) Yield point"],
        correct: 1,
    },
    Biology: {
        q: "Which organelle is responsible for cellular respiration and ATP synthesis?",
        options: ["A) Ribosome", "B) Mitochondria", "C) Golgi apparatus", "D) Lysosome"],
        correct: 1,
    },
    Chemistry: {
        q: "What is the oxidation state of oxygen in most covalent peroxide compounds?",
        options: ["A) -2", "B) -1", "C) 0", "D) +1"],
        correct: 1,
    },
    History: {
        q: "In what year did the Apollo 11 lunar module successfully land on the Moon?",
        options: ["A) 1967", "B) 1969", "C) 1971", "D) 1973"],
        correct: 1,
    },
    Music: {
        q: "What is the musical term for gradually increasing in volume?",
        options: ["A) Diminuendo", "B) Crescendo", "C) Staccato", "D) Legato"],
        correct: 1,
    },
    Art: {
        q: "Which art movement was pioneered by Pablo Picasso and Georges Braque in the early 20th century?",
        options: ["A) Impressionism", "B) Cubism", "C) Surrealism", "D) Baroque"],
        correct: 1,
    },
    Gaming: {
        q: "In the 1980 arcade classic Space Invaders, what sound accompanies the mystery spaceship?",
        options: ["A) High-pitched siren", "B) Low thud", "C) Morse code", "D) Laser blast"],
        correct: 0,
    },
    "General Knowledge": {
        q: "What is the only celestial body other than Earth where active liquid lakes have been confirmed?",
        options: ["A) Europa", "B) Titan", "C) Mars", "D) Ganymede"],
        correct: 1,
    },
};

export class FinalScreen {
    constructor({ app, soundManager, textures, onRestart }) {
        this.app = app;
        this.soundManager = soundManager;
        this.textures = textures || {};
        this.onRestart = onRestart || (() => {});

        this.container = new Container();
        this.bgLayer = new Container();
        this.contentLayer = new Container();
        this.uiLayer = new Container();

        this.container.addChild(this.bgLayer);
        this.container.addChild(this.contentLayer);
        this.container.addChild(this.uiLayer);

        this.fontFamily = "'Press Start 2P', monospace";

        // Evaluation Flow State:
        // P1_STEP -> P1_INTERVIEW -> P2_STEP -> P2_INTERVIEW -> METERS -> ROAST_SUMMARY
        this.state = "P1_STEP";
        this.stateTimer = 0;

        this.p1Topic = "Programming";
        this.p2Topic = "Gaming";
        this.p1AnswerCorrect = false;
        this.p2AnswerCorrect = false;

        this.metersProgress = {
            compatibility: 0,
            teamwork: 0,
            alienTrust: 0,
            tacticalSkill: 0,
            idiotness: 0,
        };

        this.targetMeters = {
            compatibility: 74,
            teamwork: 88,
            alienTrust: 62,
            tacticalSkill: 81,
            idiotness: 43,
        };

        this.initBackground();
        this.initDialogueBox();
        this.startP1StepForward();
    }

    initBackground() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, sw, sh);
        bg.fill({ color: 0x05080e, alpha: 0.98 });
        this.bgLayer.addChild(bg);
    }

    initDialogueBox() {
        this.dialogueBox = new Container();
        this.dialogueBg = new Graphics();
        this.dialogueBox.addChild(this.dialogueBg);

        this.dialogueText = new Text({
            text: "",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 10,
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
        const boxH = 52;

        this.dialogueBg.clear();
        this.dialogueBg.roundRect(0, 0, boxW, boxH, 4);
        this.dialogueBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        this.dialogueBg.stroke({ color: 0x38bdf8, width: 2 });

        this.dialogueBox.x = (width - boxW) / 2;
        this.dialogueBox.y = this.app.screen.height - boxH - 16;
        this.dialogueBox.visible = true;
        this.dialogueBox.alpha = 1;
        this.dialogueTimer = duration;

        if (this.soundManager) {
            this.soundManager.playDialogue();
        }
    }

    // ─── Phase 1: Player 1 Step Forward ───────────────────────────────────────

    startP1StepForward() {
        this.state = "P1_STEP";
        this.contentLayer.removeChildren();
        const sw = this.app.screen.width;

        const card = new Container();
        const cardW = Math.min(640, sw - 40);
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, 280, 8);
        cardBg.fill({ color: 0x0a0f1d, alpha: 0.95 });
        cardBg.stroke({ color: 0x22c55e, width: 2 });
        card.addChild(cardBg);

        const title = new Text({
            text: "INTERVIEW STAGE // BIOMETRIC VERIFICATION",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#22C55E" },
        });
        title.anchor.set(0.5, 0);
        title.x = cardW / 2;
        title.y = 20;
        card.addChild(title);

        const prompt = new Text({
            text: "PLAYER ONE. STEP FORWARD TO THE TERMINAL.",
            style: { fontFamily: this.fontFamily, fontSize: 13, fill: "#FFF", align: "center" },
        });
        prompt.anchor.set(0.5, 0);
        prompt.x = cardW / 2;
        prompt.y = 65;
        card.addChild(prompt);

        const sub = new Text({
            text: "Lean toward the webcam sensor to verify identity,\nor click the confirmation override below.",
            style: { fontFamily: "'VT323', monospace", fontSize: 20, fill: "#94A3B8", align: "center" },
        });
        sub.anchor.set(0.5, 0);
        sub.x = cardW / 2;
        sub.y = 110;
        card.addChild(sub);

        // Confirmation / Override button
        const btn = new Container();
        const bG = new Graphics();
        bG.roundRect(0, 0, 320, 42, 4);
        bG.fill({ color: 0x15803d });
        bG.stroke({ color: 0x86efac, width: 2 });
        btn.addChild(bG);

        const bT = new Text({
            text: "[ STEP FORWARD (CONFIRM) ]",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#FFF" },
        });
        bT.anchor.set(0.5);
        bT.x = 160;
        bT.y = 21;
        btn.addChild(bT);

        btn.x = (cardW - 320) / 2;
        btn.y = 180;
        btn.eventMode = "static";
        btn.cursor = "pointer";
        btn.on("pointertap", () => {
            this.showTopicSelection(1);
        });
        card.addChild(btn);

        card.x = (sw - cardW) / 2;
        card.y = 70;
        this.contentLayer.addChild(card);

        commentary.say("Player One. Step forward to the scanner. Let us inspect your cognitive profile.", { force: true });
    }

    // ─── Phase 2: Player 2 Step Forward ───────────────────────────────────────

    startP2StepForward() {
        this.state = "P2_STEP";
        this.contentLayer.removeChildren();
        const sw = this.app.screen.width;

        const card = new Container();
        const cardW = Math.min(640, sw - 40);
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, 280, 8);
        cardBg.fill({ color: 0x0a0f1d, alpha: 0.95 });
        cardBg.stroke({ color: 0xfbbf24, width: 2 });
        card.addChild(cardBg);

        const title = new Text({
            text: "INTERVIEW STAGE // BIOMETRIC VERIFICATION",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#FBBF24" },
        });
        title.anchor.set(0.5, 0);
        title.x = cardW / 2;
        title.y = 20;
        card.addChild(title);

        const prompt = new Text({
            text: "PLAYER TWO. STEP FORWARD TO THE TERMINAL.",
            style: { fontFamily: this.fontFamily, fontSize: 13, fill: "#FFF", align: "center" },
        });
        prompt.anchor.set(0.5, 0);
        prompt.x = cardW / 2;
        prompt.y = 65;
        card.addChild(prompt);

        const sub = new Text({
            text: "Lean toward the webcam sensor to verify identity,\nor click the confirmation override below.",
            style: { fontFamily: "'VT323', monospace", fontSize: 20, fill: "#94A3B8", align: "center" },
        });
        sub.anchor.set(0.5, 0);
        sub.x = cardW / 2;
        sub.y = 110;
        card.addChild(sub);

        const btn = new Container();
        const bG = new Graphics();
        bG.roundRect(0, 0, 320, 42, 4);
        bG.fill({ color: 0xb45309 });
        bG.stroke({ color: 0xfde047, width: 2 });
        btn.addChild(bG);

        const bT = new Text({
            text: "[ STEP FORWARD (CONFIRM) ]",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#FFF" },
        });
        bT.anchor.set(0.5);
        bT.x = 160;
        bT.y = 21;
        btn.addChild(bT);

        btn.x = (cardW - 320) / 2;
        btn.y = 180;
        btn.eventMode = "static";
        btn.cursor = "pointer";
        btn.on("pointertap", () => {
            this.showTopicSelection(2);
        });
        card.addChild(btn);

        card.x = (sw - cardW) / 2;
        card.y = 70;
        this.contentLayer.addChild(card);

        commentary.say("Player Two. Your turn. Step forward to the scanner.", { force: true });
    }

    // ─── Area of Expertise Selection ──────────────────────────────────────────

    showTopicSelection(playerIndex) {
        this.contentLayer.removeChildren();
        const sw = this.app.screen.width;
        const color = playerIndex === 1 ? "#22C55E" : "#FBBF24";

        const card = new Container();
        const cardW = Math.min(700, sw - 30);
        const cardH = 340;
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, cardH, 8);
        cardBg.fill({ color: 0x0a0f1d, alpha: 0.96 });
        cardBg.stroke({ color: playerIndex === 1 ? 0x22c55e : 0xfbbf24, width: 2 });
        card.addChild(cardBg);

        const title = new Text({
            text: `PLAYER ${playerIndex} // WHAT IS YOUR AREA OF EXPERTISE?`,
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: color },
        });
        title.anchor.set(0.5, 0);
        title.x = cardW / 2;
        title.y = 16;
        card.addChild(title);

        // Topic Grid
        const cols = 3;
        const btnW = Math.floor((cardW - 60) / cols);
        const btnH = 34;

        TOPICS.forEach((topic, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);

            const b = new Container();
            const bg = new Graphics();
            bg.roundRect(0, 0, btnW - 8, btnH, 4);
            bg.fill({ color: 0x1e293b });
            bg.stroke({ color: 0x475569, width: 1.5 });
            b.addChild(bg);

            const label = new Text({
                text: topic,
                style: { fontFamily: this.fontFamily, fontSize: 7.5, fill: "#E2E8F0" },
            });
            label.anchor.set(0.5);
            label.x = (btnW - 8) / 2;
            label.y = btnH / 2;
            b.addChild(label);

            b.x = 24 + col * btnW;
            b.y = 52 + row * (btnH + 10);
            b.eventMode = "static";
            b.cursor = "pointer";

            b.on("pointerover", () => { bg.tint = 0x88bbdd; });
            b.on("pointerout", () => { bg.tint = 0xffffff; });
            b.on("pointertap", () => {
                if (playerIndex === 1) {
                    this.p1Topic = topic;
                    commentary.setStat("p1Expertise", topic);
                } else {
                    this.p2Topic = topic;
                    commentary.setStat("p2Expertise", topic);
                }
                this.askQuestion(playerIndex, topic);
            });

            card.addChild(b);
        });

        card.x = (sw - cardW) / 2;
        card.y = 60;
        this.contentLayer.addChild(card);

        commentary.say(`Player ${playerIndex}, select your alleged area of expertise from the terminal.`, { force: true });
    }

    // ─── Question Prompt & Answer ─────────────────────────────────────────────

    askQuestion(playerIndex, topic) {
        this.contentLayer.removeChildren();
        const sw = this.app.screen.width;
        const item = QUESTIONS_BY_TOPIC[topic] || QUESTIONS_BY_TOPIC["General Knowledge"];
        const color = playerIndex === 1 ? "#22C55E" : "#FBBF24";

        const card = new Container();
        const cardW = Math.min(680, sw - 30);
        const cardH = 320;
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, cardH, 8);
        cardBg.fill({ color: 0x0a0f1d, alpha: 0.98 });
        cardBg.stroke({ color: playerIndex === 1 ? 0x22c55e : 0xfbbf24, width: 2 });
        card.addChild(cardBg);

        const header = new Text({
            text: `EVALUATION // PLAYER ${playerIndex}: ${topic.toUpperCase()}`,
            style: { fontFamily: this.fontFamily, fontSize: 10, fill: color },
        });
        header.anchor.set(0.5, 0);
        header.x = cardW / 2;
        header.y = 16;
        card.addChild(header);

        const qText = new Text({
            text: item.q,
            style: {
                fontFamily: this.fontFamily,
                fontSize: 10,
                fill: "#FFF",
                wordWrap: true,
                wordWrapWidth: cardW - 48,
                lineHeight: 20,
            },
        });
        qText.x = 24;
        qText.y = 52;
        card.addChild(qText);

        // 4 Options
        item.options.forEach((opt, optIdx) => {
            const optBtn = new Container();
            const bg = new Graphics();
            bg.roundRect(0, 0, cardW - 48, 38, 4);
            bg.fill({ color: 0x1e293b });
            bg.stroke({ color: 0x38bdf8, width: 1.5 });
            optBtn.addChild(bg);

            const txt = new Text({
                text: opt,
                style: { fontFamily: this.fontFamily, fontSize: 8.5, fill: "#E2E8F0" },
            });
            txt.x = 16;
            txt.y = 12;
            optBtn.addChild(txt);

            optBtn.x = 24;
            optBtn.y = 125 + optIdx * 46;
            optBtn.eventMode = "static";
            optBtn.cursor = "pointer";

            optBtn.on("pointerover", () => { bg.tint = 0xaaccff; });
            optBtn.on("pointerout", () => { bg.tint = 0xffffff; });
            optBtn.on("pointertap", () => {
                const isCorrect = optIdx === item.correct;
                if (playerIndex === 1) this.p1AnswerCorrect = isCorrect;
                else this.p2AnswerCorrect = isCorrect;

                if (isCorrect) {
                    bg.fill({ color: 0x15803d });
                    commentary.say(
                        `Correct. A shocking display of baseline competence from Player ${playerIndex}.`,
                        { force: true }
                    );
                } else {
                    bg.fill({ color: 0xb91c1c });
                    commentary.say(
                        `Incorrect. Your degree in ${topic} appears to be completely theoretical.`,
                        { force: true }
                    );
                }

                if (this._questionTimeout) clearTimeout(this._questionTimeout);
                this._questionTimeout = setTimeout(() => {
                    this._questionTimeout = null;
                    if (playerIndex === 1) {
                        this.startP2StepForward();
                    } else {
                        this.showFinalMeters();
                    }
                }, 3500);
            });

            card.addChild(optBtn);
        });

        card.x = (sw - cardW) / 2;
        card.y = 60;
        this.contentLayer.addChild(card);

        // Alien speaks question through Piper
        commentary.say(`Player ${playerIndex}. Topic: ${topic}. Question: ${item.q}`, { force: true });
    }

    // ─── Phase 3: Dramatic Final Meters ───────────────────────────────────────

    showFinalMeters() {
        this.state = "METERS";
        this.contentLayer.removeChildren();
        const sw = this.app.screen.width;

        const card = new Container();
        const cardW = Math.min(680, sw - 30);
        const cardH = 360;
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, cardH, 8);
        cardBg.fill({ color: 0x0a0f1d, alpha: 0.98 });
        cardBg.stroke({ color: 0x38bdf8, width: 3 });
        card.addChild(cardBg);

        const title = new Text({
            text: "FINAL BIOMETRIC EVALUATION // METRIC SUMMARY",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#38BDF8" },
        });
        title.anchor.set(0.5, 0);
        title.x = cardW / 2;
        title.y = 16;
        card.addChild(title);

        const meterKeys = [
            { key: "compatibility", label: "COMPATIBILITY", color: 0x38bdf8 },
            { key: "teamwork", label: "TEAMWORK", color: 0x22c55e },
            { key: "alienTrust", label: "ALIEN TRUST", color: 0xf59e0b },
            { key: "tacticalSkill", label: "TACTICAL SKILL", color: 0x8b5cf6 },
            { key: "idiotness", label: "IDIOTNESS", color: 0xef4444 },
        ];

        this.meterGfx = [];

        meterKeys.forEach((m, idx) => {
            const rowY = 54 + idx * 56;

            const label = new Text({
                text: `${m.label}:`,
                style: { fontFamily: this.fontFamily, fontSize: 8.5, fill: "#E2E8F0" },
            });
            label.x = 24;
            label.y = rowY;
            card.addChild(label);

            const barBg = new Graphics();
            barBg.roundRect(24, rowY + 18, cardW - 120, 20, 3);
            barBg.fill({ color: 0x1e293b });
            barBg.stroke({ color: 0x334155, width: 1 });
            card.addChild(barBg);

            const barFill = new Graphics();
            card.addChild(barFill);

            const valText = new Text({
                text: "0%",
                style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#FFF" },
            });
            valText.x = cardW - 84;
            valText.y = rowY + 22;
            card.addChild(valText);

            this.meterGfx.push({
                key: m.key,
                color: m.color,
                barFill,
                valText,
                startX: 24,
                startY: rowY + 18,
                maxW: cardW - 120,
            });
        });

        card.x = (sw - cardW) / 2;
        card.y = 50;
        this.contentLayer.addChild(card);

        commentary.say("Compiling final metrics. Compatibility. Teamwork. Alien trust. Tactical skill. And idiotness.", { force: true });

        // Animate meters filling up
        let t = 0;
        const meterAnim = () => {
            t += 0.02;
            const progress = Math.min(1.0, t);

            this.meterGfx.forEach((m) => {
                const target = this.targetMeters[m.key];
                const currentVal = Math.round(target * progress);
                m.valText.text = `${currentVal}%`;

                m.barFill.clear();
                m.barFill.roundRect(m.startX, m.startY, m.maxW * (currentVal / 100), 20, 3);
                m.barFill.fill({ color: m.color });
            });

            if (progress >= 1.0) {
                if (this._meterAnimTicker) {
                    this.app.ticker.remove(this._meterAnimTicker);
                    this._meterAnimTicker = null;
                }
                this._roastTimeout = setTimeout(() => {
                    this._roastTimeout = null;
                    this.showFinalRoast();
                }, 3000);
            }
        };

        this._meterAnimTicker = meterAnim;
        this.app.ticker.add(meterAnim);
    }

    // ─── Phase 4: Final Screen & Alien Roast ──────────────────────────────────

    showFinalRoast() {
        this.state = "ROAST_SUMMARY";
        this.contentLayer.removeChildren();
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        const cardW = Math.min(720, sw - 30);
        const cardH = 380;
        const card = new Container();

        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, cardH, 8);
        cardBg.fill({ color: 0x080d18, alpha: 0.98 });
        cardBg.stroke({ color: 0xf59e0b, width: 3 });
        card.addChild(cardBg);

        const header = new Text({
            text: "CENTRAL VIENIUM // CUSTODY CERTIFICATE CV-07",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#F59E0B" },
        });
        header.anchor.set(0.5, 0);
        header.x = cardW / 2;
        header.y = 16;
        card.addChild(header);

        // Assembled dynamic roast based on actual stats
        const stats = commentary.getStats();
        let roastText = "After exhaustive surveillance, Central Vienium has completed your evaluation.\n\n";

        if (stats.level1Misses > 10) {
            roastText += "• Sector CV-07 shooting was legally questionable; space is empty, yet you still missed it.\n";
        } else {
            roastText += "• Sector CV-07 clearance filed with acceptable ballistic competence.\n";
        }

        if (stats.mazeDisagreements > 3) {
            roastText += "• Your relationship maze consensus resembled a committee arguing over door hinges.\n";
        } else {
            roastText += "• Your maze synchronization was surprisingly non-catastrophic.\n";
        }

        if (stats.subwayHits > 2) {
            roastText += "• Subway retreat featured multiple unauthorized collisions with transit infrastructure.\n";
        } else {
            roastText += "• Subway sprint was moderately agile before mandatory transit police interception.\n";
        }

        roastText += `• Power Test: P1 produced ${stats.p1PowerScore} AU, P2 produced ${stats.p2PowerScore} AU.\n`;
        roastText += `• Status: Legally granted joint custody clearance. Triplicate paperwork filed.`;

        const roastBox = new Text({
            text: roastText,
            style: {
                fontFamily: "'VT323', monospace",
                fontSize: 18,
                fill: "#E2E8F0",
                lineHeight: 22,
                wordWrap: true,
                wordWrapWidth: cardW - 180,
            },
        });
        roastBox.x = 24;
        roastBox.y = 52;
        card.addChild(roastBox);

        // Decorative Pixel QR Code
        const qrContainer = new Container();
        qrContainer.x = cardW - 150;
        qrContainer.y = 60;

        const qrBg = new Graphics();
        qrBg.rect(0, 0, 120, 120);
        qrBg.fill({ color: 0xffffff });
        qrContainer.addChild(qrBg);

        // Pixel QR pattern simulation
        const qrPixels = new Graphics();
        const pattern = [
            [1,1,1,1,1,1,1,0,1,1,1,1,1,1,1],
            [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
            [1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
            [1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
            [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
            [1,1,1,1,1,1,1,0,1,1,1,1,1,1,1],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [1,0,1,1,0,1,0,1,0,1,1,0,1,0,1],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [1,1,1,1,1,1,1,0,1,0,1,1,0,1,0],
            [1,0,0,0,0,0,1,0,0,1,0,1,1,0,1],
            [1,0,1,1,1,0,1,0,1,1,0,0,1,1,0],
            [1,1,1,1,1,1,1,0,1,0,1,1,0,1,1],
        ];

        const cellSize = 8;
        pattern.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell === 1) {
                    qrPixels.rect(c * cellSize + 8, r * cellSize + 8, cellSize, cellSize);
                }
            });
        });
        qrPixels.fill({ color: 0x000000 });
        qrContainer.addChild(qrPixels);

        const qrLabel = new Text({
            text: "CENTRAL VIENIUM\nARCHIVE",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 6,
                fill: "#F59E0B",
                align: "center",
                lineHeight: 10,
            },
        });
        qrLabel.anchor.set(0.5, 0);
        qrLabel.x = 60;
        qrLabel.y = 126;
        qrContainer.addChild(qrLabel);

        card.addChild(qrContainer);

        // Restart Button
        const restartBtn = new Container();
        const rBg = new Graphics();
        rBg.roundRect(0, 0, 320, 44, 4);
        rBg.fill({ color: 0x1e293b });
        rBg.stroke({ color: 0x38bdf8, width: 2 });
        restartBtn.addChild(rBg);

        const rText = new Text({
            text: "[ RE-RUN EVALUATION PROTOCOL ]",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#38BDF8" },
        });
        rText.anchor.set(0.5);
        rText.x = 160;
        rText.y = 22;
        restartBtn.addChild(rText);

        restartBtn.x = (cardW - 320) / 2;
        restartBtn.y = cardH - 58;
        restartBtn.eventMode = "static";
        restartBtn.cursor = "pointer";

        restartBtn.on("pointerover", () => { rBg.tint = 0x88bbdd; });
        restartBtn.on("pointerout", () => { rBg.tint = 0xffffff; });
        restartBtn.on("pointertap", () => {
            this.onRestart();
        });

        card.addChild(restartBtn);

        card.x = (sw - cardW) / 2;
        card.y = (sh - cardH) / 2 - 20;
        this.contentLayer.addChild(card);

        // Final spoken roast via Piper
        commentary.say(
            "Evaluation finalized. Central Vienium has completed your review. You have demonstrated questionable navigation, absurd physical power, and adequate endurance. Joint custody certified.",
            { force: true }
        );
    }

    update(deltaTime) {
        const dtSec = deltaTime / 60;
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

    destroy() {
        if (this._meterAnimTicker) {
            try { this.app.ticker.remove(this._meterAnimTicker); } catch (e) {}
            this._meterAnimTicker = null;
        }
        if (this._roastTimeout) {
            clearTimeout(this._roastTimeout);
            this._roastTimeout = null;
        }
        if (this._questionTimeout) {
            clearTimeout(this._questionTimeout);
            this._questionTimeout = null;
        }
        if (this.unsubscribeCommentary) this.unsubscribeCommentary();
        this.container.destroy({ children: true });
    }
}
