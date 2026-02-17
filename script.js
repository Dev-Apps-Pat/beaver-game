// PWA SERVICE WORKER REGISTRATION
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered!', reg))
            .catch(err => console.log('SW failed!', err));
    });
}

// LEVELS CONFIG
const LEVELS = [
    { name: "🌲 Forest Stream", grid: [3, 3], bg: "url('assets/img/background.png')", count: 9 },
    { name: "🪵 Beaver Dam", grid: [4, 3], bg: "url('assets/img/background2.png')", count: 12 },
    { name: "❄️ Winter Night", grid: [4, 4], bg: "url('assets/img/background3.png')", count: 16 }
];

let currentLevelIndex = 0;

// CONFIG
const CONFIG = { baseSpeed: 1200, minSpeed: 600, decrease: 15 };
let state = {
    score: 0, level: 1, lives: 3,
    activeTimers: new Map(),
    busyCells: new Set(),
    isOver: false, speed: 1000, combo: 0, maxCombo: 0, isPaused: false
};

// PERSISTENCE
let records = {
    highScore: parseInt(localStorage.getItem('beaver_highScore') || 0),
    maxCombo: parseInt(localStorage.getItem('beaver_maxCombo') || 0)
};

// DOM
const els = {
    gameContainer: document.getElementById('game-container'),
    intro: document.getElementById('intro-screen'),
    levelSelector: document.getElementById('level-selector'),
    levelsContainer: document.querySelector('.levels-container'),
    gameOver: document.getElementById('game-over'),
    pauseScreen: document.getElementById('pause-screen'),
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    finalScore: document.getElementById('final-score'),
    finalCombo: document.getElementById('final-combo'),
    comboCnt: document.getElementById('combo-cnt'),
    introHighScore: document.getElementById('intro-high-score'),
    introMaxCombo: document.getElementById('intro-max-combo')
};

// INIT UI
updateIntroStats();

function updateIntroStats() {
    els.introHighScore.innerText = records.highScore;
    els.introMaxCombo.innerText = records.maxCombo;
}

function saveRecords() {
    if (state.score > records.highScore) {
        records.highScore = state.score;
        localStorage.setItem('beaver_highScore', records.highScore);
    }
    if (state.maxCombo > records.maxCombo) {
        records.maxCombo = state.maxCombo;
        localStorage.setItem('beaver_maxCombo', records.maxCombo);
    }
}

// AUDIO SYSTEM (Music + SFX)
const ctx = new (window.AudioContext || window.webkitAudioContext)();

function beep(f, t, vol = 0.1, dur = 0.1) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = f; o.type = t;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
    o.start(); o.stop(ctx.currentTime + dur);
}

// MUSIC ENGINE
const Music = {
    isPlaying: false,
    tempo: 1.0,
    nextNoteTime: 0,
    noteIndex: 0,
    melody: [523.25, 0, 659.25, 0, 783.99, 0, 880.00, 0, 932.33, 0, 880.00, 0, 783.99, 0, 659.25, 0],
    bass: [261.63, 261.63, 329.63, 329.63, 392.00, 392.00, 440.00, 440.00, 466.16, 466.16, 440.00, 440.00, 392.00, 392.00, 329.63, 329.63],
    timerID: null,

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.nextNoteTime = ctx.currentTime + 0.1;
        this.scheduler();
    },

    stop() {
        this.isPlaying = false;
        clearTimeout(this.timerID);
    },

    setTempo(multiplier) {
        this.tempo = multiplier;
    },

    scheduler() {
        if (!this.isPlaying) return;
        while (this.nextNoteTime < ctx.currentTime + 0.1) {
            this.playStep(this.nextNoteTime);
            const secondsPerStep = 0.125 / this.tempo;
            this.nextNoteTime += secondsPerStep;
        }
        this.timerID = setTimeout(() => this.scheduler(), 25);
    },

    playStep(time) {
        const step = this.noteIndex % 16;
        if (this.melody[step] > 0) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.value = this.melody[step];
            gain.gain.setValueAtTime(0.02, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            osc.start(time); osc.stop(time + 0.1);
        }
        if (this.bass[step] > 0) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.value = this.bass[step] / 2;
            gain.gain.setValueAtTime(0.05, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
            osc.start(time); osc.stop(time + 0.2);
        }
        this.noteIndex++;
    }
};

function playSadMusic() {
    Music.stop();
    const notes = [
        { f: 392.00, d: 0.5 }, { f: 311.13, d: 0.5 }, { f: 261.63, d: 0.5 },
        { f: 196.00, d: 1.0 }, { f: 155.56, d: 1.5 }
    ];
    let time = ctx.currentTime;
    notes.forEach(n => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = n.f;
        g.gain.setValueAtTime(0.15, time); g.gain.exponentialRampToValueAtTime(0.01, time + n.d);
        o.start(time); o.stop(time + n.d);
        time += n.d * 0.8;
    });
}

// PAUSE LOGIC
function togglePause() {
    if (state.isOver) return;
    state.isPaused = !state.isPaused;

    if (state.isPaused) {
        Music.stop();
        state.activeTimers.forEach((timer, idx) => clearTimeout(timer));
        els.pauseScreen.classList.add('show');
    } else {
        els.pauseScreen.classList.remove('show');
        Music.start();
        state.activeTimers.clear();
        state.busyCells.clear();
        document.querySelectorAll('.cell').forEach(c => c.innerHTML = '');
        spawn();
    }
}

// LEVEL SYSTEM
function showLevelSelector() {
    if (ctx.state === 'suspended') ctx.resume();
    els.intro.classList.add('fade-out');
    els.levelSelector.style.display = 'flex';
    renderLevelSelector();
}

function backToIntro() {
    els.levelSelector.style.display = 'none';
    els.intro.classList.remove('fade-out');
}

function renderLevelSelector() {
    els.levelsContainer.innerHTML = '';
    LEVELS.forEach((lvl, idx) => {
        const card = document.createElement('div');
        card.className = 'level-card';
        card.innerHTML = `<h3>Level ${idx + 1}</h3><p>${lvl.name}</p><p>${lvl.grid[0]}x${lvl.grid[1]} Grid</p>`;
        card.onclick = () => startLevel(idx);
        els.levelsContainer.appendChild(card);
    });
}

function startLevel(idx) {
    currentLevelIndex = idx;
    els.levelSelector.style.display = 'none';
    initGrid(LEVELS[idx]);
    resetGame();
}

function initGrid(config) {
    const frame = document.getElementById('app-frame');

    // Set Background
    // If exact asset doesn't exist, it will fallback or just show color. 
    // We assume assets will be there or we use default for now if 404.
    frame.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), ${config.bg}`;

    // Reset Container
    els.gameContainer.innerHTML = '';

    // Set Grid Class
    els.gameContainer.className = ''; // clear previous
    if (config.grid[0] === 3) els.gameContainer.className = 'grid-3x3';
    if (config.grid[0] === 4 && config.grid[1] === 3) els.gameContainer.className = 'grid-4x3';
    if (config.grid[0] === 4 && config.grid[1] === 4) els.gameContainer.className = 'grid-4x4';

    // Create Cells
    for (let i = 0; i < config.count; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.onclick = () => hit(i);
        els.gameContainer.appendChild(cell);

        // Add combo container only once, efficiently? 
        // Actually, existing code had combo-cnt inside game-container. 
        // We should add it back after cells.
    }

    // Add shared combo container
    if (!document.getElementById('combo-cnt')) {
        const comboCnt = document.createElement('div');
        comboCnt.id = 'combo-cnt';
        comboCnt.className = 'combo-container';
        els.gameContainer.appendChild(comboCnt);
        els.comboCnt = comboCnt; // update Ref
    }
}

// GAME LOOP
function resetGame() {
    Music.start();
    Music.setTempo(1.0);

    if (state.activeTimers) state.activeTimers.forEach(t => clearTimeout(t));

    const levelConfig = LEVELS[currentLevelIndex];

    state = {
        score: 0, level: 1, lives: 3,
        activeTimers: new Map(),
        busyCells: new Set(),
        isOver: false, speed: CONFIG.baseSpeed, combo: 0, maxCombo: 0, isPaused: false
    };

    updateUI();
    els.gameOver.classList.remove('show');

    // Clear cells via DOM
    const cells = document.querySelectorAll('.cell');
    cells.forEach(c => c.innerHTML = '');
    if (els.comboCnt) els.comboCnt.innerHTML = '';

    setTimeout(spawn, 500);
}

function spawn() {
    if (state.isOver || state.isPaused) return;

    // Difficulty Scaling based on In-Game Level (not Stage)
    // As score goes up, more simultaneous beavers.
    const maxBeavers = Math.min(4, Math.floor((state.level - 1) / 5) + 1);

    if (state.activeTimers.size >= maxBeavers) {
        setTimeout(spawn, 500);
        return;
    }

    const cells = document.querySelectorAll('.cell');
    let availableIdx = [];
    cells.forEach((_, i) => {
        if (!state.activeTimers.has(i) && !state.busyCells.has(i)) {
            availableIdx.push(i);
        }
    });

    if (availableIdx.length === 0) {
        setTimeout(spawn, 300);
        return;
    }

    const idx = availableIdx[Math.floor(Math.random() * availableIdx.length)];

    // Create Beaver
    const beaver = document.createElement('div');
    beaver.className = 'hole-mask';
    beaver.style.pointerEvents = "none";
    beaver.innerHTML = `<div class="beaver"><div class="beaver-container"><div class="beaver-img normal"></div></div></div>`;
    cells[idx].appendChild(beaver);

    // Set Timer
    const timerId = setTimeout(() => miss(idx), state.speed);
    state.activeTimers.set(idx, timerId);

    const nextSpawnTime = Math.max(300, state.speed / (maxBeavers * 0.9));
    setTimeout(spawn, nextSpawnTime);
}

function hit(idx) {
    if (state.isOver || state.isPaused) return;

    if (!state.activeTimers.has(idx)) {
        wrongHole();
        return;
    }

    clearTimeout(state.activeTimers.get(idx));
    state.activeTimers.delete(idx);
    state.busyCells.add(idx);

    const cells = document.querySelectorAll('.cell');
    const cell = cells[idx];
    const mask = cell.querySelector('.hole-mask');
    const img = mask ? mask.querySelector('.beaver-img') : null;
    if (img) img.className = 'beaver-img yes';

    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    showComboEffect(state.combo);

    const points = 10 * state.combo;
    state.score += points;
    state.level = Math.floor(state.score / 100) + 1;

    // Speed increases per level
    state.speed = Math.max(CONFIG.minSpeed, CONFIG.baseSpeed - (state.level * CONFIG.decrease));
    Music.setTempo(1.0 + (state.level * 0.05));

    beep(600 + (state.combo * 50), 'square');
    updateUI();

    setTimeout(() => {
        if (cells[idx]) cells[idx].innerHTML = '';
        state.busyCells.delete(idx);
    }, 300);
}

function wrongHole() {
    state.lives--;
    state.combo = 0;
    if (els.comboCnt) els.comboCnt.innerHTML = '';

    beep(150, 'sawtooth');

    const container = document.getElementById('game-container');
    container.classList.remove('shake');
    void container.offsetWidth;
    container.classList.add('shake');

    updateUI();

    if (state.lives <= 0) {
        endGame();
    }
}

function miss(idx) {
    if (state.isOver || state.isPaused) return;

    if (!state.activeTimers.has(idx)) return;
    state.activeTimers.delete(idx);
    state.busyCells.add(idx);

    state.combo = 0;
    if (els.comboCnt) els.comboCnt.innerHTML = '';

    const cells = document.querySelectorAll('.cell');
    const cell = cells[idx];
    const mask = cell.querySelector('.hole-mask');
    if (mask) {
        const beaver = mask.querySelector('.beaver');
        if (beaver) beaver.classList.add('miss');
        const img = mask.querySelector('.beaver-img');
        if (img) img.className = 'beaver-img no';
    }

    state.lives--;
    beep(200, 'sawtooth');
    updateUI();

    if (state.lives <= 0) {
        endGame();
    } else {
        setTimeout(() => {
            if (cells[idx]) cells[idx].innerHTML = '';
            state.busyCells.delete(idx);
        }, 300);
    }
}

function showComboEffect(val) {
    if (val < 2) return;
    if (els.comboCnt) els.comboCnt.innerHTML = `<div class="combo-pop">x${val}</div>`;
}

function endGame() {
    state.isOver = true;
    saveRecords();
    updateIntroStats();

    els.finalScore.innerText = state.score;
    els.finalCombo.innerText = state.maxCombo;

    els.gameOver.classList.add('show');
    playSadMusic();
}

function updateUI() {
    els.score.innerText = state.score;
    els.level.innerText = state.level;
    els.lives.innerHTML = '❤'.repeat(Math.max(0, state.lives));
}
