import * as THREE from 'three';

// --- CONFIGURAÇÃO INICIAL ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
scene.fog = new THREE.Fog(0x0a0a0a, 10, 60);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 4, 8);
camera.lookAt(0, 1, -5);

const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#game-canvas'),
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// --- ESTADO DO JOGO ---
let gameActive = false;
let score = 0;
let speed = 0.2;
const LANES = [-2, 0, 2];
let currentLane = 1;
let isJumping = false;
let isSliding = false;
let jumpVelocity = 0;
const gravity = -0.012;

// --- POWER-UPS ---
let activePowerup = null; // 'magnet', 'rocket', 'superjump'
let powerupTimer = 0;
const POWERUP_DURATION = 5000; // 5 segundos

// --- OBJETOS ---
let player;
let gru;
let gruNose;
const obstacles = [];
const coins = [];
const powerups = [];
const floorSegments = [];

// --- INICIALIZAÇÃO ---
function init() {
    createLights();
    createPlayer();
    createGru();
    createEnvironment();
    setupControls();
    animate();
}

function createLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
}

function createPlayer() {
    const group = new THREE.Group();
    // Corpo
    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.4, 0.8, 4, 16),
        new THREE.MeshStandardMaterial({ color: 0xfde047 })
    );
    body.position.y = 0.7;
    group.add(body);
    // Macacão
    const suit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.41, 0.41, 0.4, 16),
        new THREE.MeshStandardMaterial({ color: 0x2563eb })
    );
    suit.position.y = 0.4;
    group.add(suit);

    player = group;
    scene.add(player);
}

function createGru() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 3, 1),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    body.position.y = 1.5;
    group.add(body);

    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 8, 12),
        new THREE.MeshStandardMaterial({ color: 0xccaa99 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 2.2, -4);
    gruNose = nose;
    group.add(nose);

    gru = group;
    gru.position.set(0, 0, 8);
    scene.add(gru);
}

function createEnvironment() {
    for (let i = 0; i < 10; i++) addFloorSegment(i * -20);
}

function addFloorSegment(z) {
    const seg = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 20),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    seg.rotation.x = -Math.PI / 2;
    seg.position.z = z;
    const grid = new THREE.GridHelper(10, 10, 0x00ffff, 0x222222);
    grid.rotation.x = Math.PI / 2;
    seg.add(grid);
    scene.add(seg);
    floorSegments.push(seg);
}

// --- SPAWNERS ---
function spawnItem() {
    const lane = LANES[Math.floor(Math.random() * 3)];
    const rand = Math.random();

    if (rand < 0.6) { // Moeda
        const coin = new THREE.Mesh(
            new THREE.TorusGeometry(0.3, 0.05, 8, 16),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 })
        );
        coin.position.set(lane, 0.7, -80);
        scene.add(coin);
        coins.push(coin);
    } else if (rand < 0.8) { // Obstáculo
        const type = Math.random() > 0.5 ? 'low' : 'high';
        const obs = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, type === 'low' ? 0.8 : 3, 1),
            new THREE.MeshStandardMaterial({ color: type === 'low' ? 0xef4444 : 0x10b981 })
        );
        obs.position.set(lane, type === 'low' ? 0.4 : 1.5, -80);
        obs.userData = { type };
        scene.add(obs);
        obstacles.push(obs);
    } else if (rand < 0.85) { // Power-up
        const types = ['magnet', 'rocket', 'superjump'];
        const type = types[Math.floor(Math.random() * types.length)];
        const pu = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.5),
            new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 0.5 })
        );
        pu.position.set(lane, 0.8, -80);
        pu.userData = { type };
        scene.add(pu);
        powerups.push(pu);
    }
}

// --- GAME LOOP ---
function update() {
    if (!gameActive) return;

    score += 1;
    document.getElementById('score-value').innerText = score.toString().padStart(5, '0');
    speed += 0.00002;
    document.getElementById('speed-bar').style.width = `${Math.min((speed - 0.2) * 500, 100)}%`;

    // Movimento Lateral
    player.position.x = THREE.MathUtils.lerp(player.position.x, LANES[currentLane], 0.15);

    // Física e Power-ups
    handlePhysics();
    handleItems();

    // Gru perseguindo
    gru.position.z = THREE.MathUtils.lerp(gru.position.z, 6 + (Math.sin(Date.now() * 0.001) * 0.5), 0.01);

    if (Math.random() < 0.05) spawnItem();
}

function handlePhysics() {
    if (activePowerup === 'rocket') {
        player.position.y = THREE.MathUtils.lerp(player.position.y, 4, 0.1);
    } else {
        if (isJumping) {
            player.position.y += jumpVelocity;
            jumpVelocity += gravity;
            if (player.position.y <= 0) {
                player.position.y = 0;
                isJumping = false;
            }
        } else if (!isSliding) {
            player.position.y = THREE.MathUtils.lerp(player.position.y, 0, 0.1);
        }
    }

    if (powerupTimer > 0) {
        powerupTimer -= 16.6; // ~60fps
        document.getElementById('powerup-timer-bar').style.width = `${(powerupTimer / POWERUP_DURATION) * 100}%`;
        if (powerupTimer <= 0) deactivatePowerup();
    }
}

function handleItems() {
    // Chão infinito
    floorSegments.forEach(s => {
        s.position.z += speed;
        if (s.position.z > 20) s.position.z -= 200;
    });

    // Moedas
    coins.forEach((c, i) => {
        c.position.z += speed;
        c.rotation.y += 0.05;

        // Magnetismo
        if (activePowerup === 'magnet' && c.position.distanceTo(player.position) < 8) {
            c.position.lerp(player.position, 0.1);
        }

        if (c.position.distanceTo(player.position) < 1) {
            score += 100;
            scene.remove(c);
            coins.splice(i, 1);
        } else if (c.position.z > 10) {
            scene.remove(c);
            coins.splice(i, 1);
        }
    });

    // Obstáculos
    obstacles.forEach((o, i) => {
        o.position.z += speed;
        const dx = Math.abs(player.position.x - o.position.x);
        const dz = Math.abs(player.position.z - o.position.z);

        if (dx < 0.7 && dz < 0.7 && activePowerup !== 'rocket') {
            if (o.userData.type === 'low' && !isJumping) gameOver();
            if (o.userData.type === 'high' && !isSliding) gameOver();
        }

        if (o.position.z > 10) {
            scene.remove(o);
            obstacles.splice(i, 1);
        }
    });

    // Power-ups
    powerups.forEach((p, i) => {
        p.position.z += speed;
        p.rotation.x += 0.02;
        if (p.position.distanceTo(player.position) < 1) {
            activatePowerup(p.userData.type);
            scene.remove(p);
            powerups.splice(i, 1);
        }
    });
}

function activatePowerup(type) {
    activePowerup = type;
    powerupTimer = POWERUP_DURATION;
    const ui = document.getElementById('powerup-status');
    const name = document.getElementById('powerup-name');
    ui.classList.remove('hidden');
    name.innerText = type.toUpperCase();
}

function deactivatePowerup() {
    activePowerup = null;
    document.getElementById('powerup-status').classList.add('hidden');
}

function setupControls() {
    window.addEventListener('keydown', (e) => {
        if (!gameActive) return;
        if (e.key === 'ArrowLeft' || e.key === 'a') currentLane = Math.max(0, currentLane - 1);
        if (e.key === 'ArrowRight' || e.key === 'd') currentLane = Math.min(2, currentLane + 1);
        if ((e.key === 'ArrowUp' || e.key === 'w') && !isJumping) {
            isJumping = true;
            jumpVelocity = activePowerup === 'superjump' ? 0.4 : 0.22;
        }
        if ((e.key === 'ArrowDown' || e.key === 's') && !isSliding) {
            isSliding = true;
            player.scale.y = 0.5;
            setTimeout(() => { player.scale.y = 1; isSliding = false; }, 600);
        }
    });

    document.getElementById('start-button').onclick = startGame;
    document.getElementById('restart-button').onclick = startGame;
}

function startGame() {
    score = 0;
    speed = 0.2;
    currentLane = 1;
    gameActive = true;
    deactivatePowerup();
    obstacles.forEach(o => scene.remove(o)); obstacles.length = 0;
    coins.forEach(c => scene.remove(c)); coins.length = 0;
    document.getElementById('start-menu').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
}

function gameOver() {
    gameActive = false;
    document.getElementById('game-over').classList.remove('hidden');
    document.getElementById('final-score-value').innerText = score;
}

function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

init();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
