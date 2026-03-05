import * as THREE from 'three';

// --- CONFIGURAÇÃO INICIAL ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);
scene.fog = new THREE.Fog(0x020617, 10, 80);

// --- CARREGAMENTO DE TEXTURAS ---
const textureLoader = new THREE.TextureLoader();
const textures = {
    body: textureLoader.load('assets/body.png'),
    suit: textureLoader.load('assets/suit.png'),
    floor: textureLoader.load('assets/floor.png'),
    banana: textureLoader.load('assets/banana.png'),
    building: textureLoader.load('assets/building.png'),
    barrier: textureLoader.load('assets/barrier.png')
};

// Ajuste para repetição infinita no chão e prédios
textures.floor.wrapS = textures.floor.wrapT = THREE.RepeatWrapping;
textures.floor.repeat.set(1, 4);
textures.building.wrapS = textures.building.wrapT = THREE.RepeatWrapping;
textures.building.repeat.set(1, 2);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 12);
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
let selectedSkin = 'default';
let isJumping = false;
let isSliding = false;
let jumpVelocity = 0;
const gravity = -0.012;

// --- ÁUDIO (SoundManager Sintético) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(freq, type, duration) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const sounds = {
    jump: () => playSound(400, 'square', 0.1),
    collect: () => { playSound(600, 'sine', 0.1); setTimeout(() => playSound(800, 'sine', 0.1), 50); },
    powerup: () => { playSound(300, 'sawtooth', 0.3); playSound(500, 'sawtooth', 0.3); },
    hit: () => playSound(100, 'sawtooth', 0.4),
    button: () => playSound(440, 'sine', 0.1)
};

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
const particles = [];
let playerHeroLight;

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
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Luz de acompanhamento (Hero Light)
    const heroLight = new THREE.PointLight(0x3b82f6, 1, 10);
    heroLight.position.set(0, 2, 0);
    scene.add(heroLight);
    playerHeroLight = heroLight; // Necessário declarar no topo ou usar global
}

function createPlayer() {
    // Remover player existente se houver
    if (player) {
        scene.remove(player);
        player.children.length = 0; // Limpar children para evitar duplicação
    }

    const group = new THREE.Group();

    // Configurações de Skin
    let bodyColor = 0xfde047;
    let suitColor = 0x2563eb;
    let isPurple = selectedSkin === 'purple';
    let isPrisoner = selectedSkin === 'prisoner';
    let isPrincess = selectedSkin === 'princess';

    if (isPurple) {
        bodyColor = 0x9333ea;
        suitColor = 0x7c3aed;
    } else if (isPrincess) {
        suitColor = 0xf472b6;
    }

    // Corpo
    const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.7, 4, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
        map: textures.body,
        color: bodyColor,
        roughness: 0.4
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    group.add(body);

    // Macacão/Roupa
    if (isPrisoner) {
        // Macacão Listrado (Segmentos)
        for (let i = 0; i < 4; i++) {
            const stripeMat = new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xffffff : 0x111111 });
            const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 16), stripeMat);
            stripe.position.y = 0.3 + i * 0.1;
            group.add(stripe);
        }
    } else {
        const suit = new THREE.Mesh(
            new THREE.CylinderGeometry(0.36, 0.36, 0.35, 16),
            new THREE.MeshStandardMaterial({
                map: textures.suit,
                color: suitColor
            })
        );
        suit.position.y = 0.45;
        group.add(suit);

        // Alças do Macacão
        const strapGeo = new THREE.BoxGeometry(0.1, 0.5, 0.05);
        const strapMat = new THREE.MeshStandardMaterial({ map: textures.suit, color: suitColor });
        for (let i of [-1, 1]) {
            const strap = new THREE.Mesh(strapGeo, strapMat);
            strap.position.set(i * 0.25, 0.7, 0);
            strap.rotation.x = -0.5;
            strap.rotation.z = i * 0.3;
            group.add(strap);

            // Botões
            const button = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 }));
            button.position.set(i * 0.22, 0.58, 0.36);
            group.add(button);
        }
    }

    if (!isPurple && !isPrisoner && !isPrincess) {
        const logo = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        logo.position.set(0, 0.45, 0.37);
        group.add(logo);
    }

    // Óculos
    const frameColor = isPurple ? 0x444444 : 0x888888;
    const goggleFrame = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.05, 12, 32),
        new THREE.MeshStandardMaterial({
            color: frameColor,
            metalness: 1.0,
            roughness: 0.1,
            envMapIntensity: 1
        })
    );
    goggleFrame.position.set(0, 0.85, 0.28);
    group.add(goggleFrame);

    const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    eye.position.set(0, 0.85, 0.28);
    group.add(eye);

    const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x000000 })
    );
    pupil.position.set(0, 0.85, 0.42);
    group.add(pupil);

    const shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff })
    );
    shine.position.set(0.03, 0.88, 0.45);
    group.add(shine);

    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    strap.rotation.x = Math.PI / 2;
    strap.position.y = 0.85;
    group.add(strap);

    // Expressão (Boca)
    if (isPurple) {
        // Boca Nervosa (Dentes)
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        mouth.position.set(0, 0.65, 0.32);
        group.add(mouth);
    } else {
        const smileGeo = new THREE.TorusGeometry(0.1, 0.015, 8, 16, Math.PI);
        const smile = new THREE.Mesh(smileGeo, new THREE.MeshStandardMaterial({ color: 0x422006 }));
        smile.position.set(0, 0.65, 0.3);
        smile.rotation.x = Math.PI;
        group.add(smile);
    }

    // Cabelo
    if (isPurple) {
        // Cabelo Maluco
        for (let i = 0; i < 15; i++) {
            const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.01, 0.4), new THREE.MeshStandardMaterial({ color: 0x9333ea }));
            hair.position.set((Math.random() - 0.5) * 0.4, 1.1, (Math.random() - 0.5) * 0.4);
            hair.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(hair);
        }
    } else {
        const hairsCount = isPrisoner ? 2 : 5;
        for (let i = -Math.floor(hairsCount / 2); i <= Math.floor(hairsCount / 2); i++) {
            const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.25), new THREE.MeshStandardMaterial({ color: 0x000000 }));
            hair.position.set(i * 0.06, 1.15, 0);
            hair.rotation.z = i * 0.15;
            group.add(hair);
        }
    }

    // Acessórios de Skin
    if (isPrincess) {
        // Coroa Refinada (Tiara)
        const crownGroup = new THREE.Group();
        const crownBase = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.03, 8, 32, Math.PI),
            new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.1 })
        );
        crownBase.rotation.x = -Math.PI / 2;
        crownBase.position.y = 1.15;
        crownGroup.add(crownBase);

        // Joia na Coroa
        const gem = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.06),
            new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: 0.5 })
        );
        gem.position.set(0, 1.25, 0.15);
        crownGroup.add(gem);

        for (let i = -1; i <= 1; i++) {
            const point = new THREE.Mesh(
                new THREE.ConeGeometry(0.04, 0.15, 4),
                new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1 })
            );
            point.position.set(i * 0.12, 1.22, 0.1);
            point.rotation.x = 0.2;
            crownGroup.add(point);
        }
        group.add(crownGroup);

        // Tutu (Saia de Bailarina)
        const tutuGeo = new THREE.CylinderGeometry(0.45, 0.65, 0.15, 20);
        const tutuMat = new THREE.MeshStandardMaterial({
            color: 0xf472b6,
            transparent: true,
            opacity: 0.8,
            roughness: 0.9
        });
        const tutu = new THREE.Mesh(tutuGeo, tutuMat);
        tutu.position.y = 0.4;
        group.add(tutu);

        // Detalhe de babado no tutu
        const ruffleGeo = new THREE.TorusGeometry(0.55, 0.05, 8, 32);
        const ruffle = new THREE.Mesh(ruffleGeo, tutuMat);
        ruffle.rotation.x = Math.PI / 2;
        ruffle.position.y = 0.35;
        group.add(ruffle);
    }

    // Braços
    const armMat = new THREE.MeshStandardMaterial({ color: bodyColor });
    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4);
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.4, 0.55, 0);
    leftArm.rotation.z = 0.5;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.4, 0.55, 0);
    rightArm.rotation.z = -0.5;
    group.add(rightArm);

    // Pernas
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.2);
    const bootGeo = new THREE.BoxGeometry(0.15, 0.1, 0.25);
    const leftLeg = new THREE.Mesh(legGeo, blackMat);
    leftLeg.position.set(-0.15, 0.15, 0);
    group.add(leftLeg);
    const leftBoot = new THREE.Mesh(bootGeo, blackMat);
    leftBoot.position.set(-0.15, 0.05, 0.05);
    group.add(leftBoot);

    const rightLeg = new THREE.Mesh(legGeo, blackMat);
    rightLeg.position.set(0.15, 0.15, 0);
    group.add(rightLeg);
    const rightBoot = new THREE.Mesh(bootGeo, blackMat);
    rightBoot.position.set(0.15, 0.05, 0.05);
    group.add(rightBoot);

    // Jetpack (Invisível por padrão)
    const jetpackGroup = new THREE.Group();
    const jpBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 1.0, roughness: 0.1 }));
    jpBody.position.set(0, 0.6, -0.3);
    jetpackGroup.add(jpBody);

    for (let i of [-1, 1]) {
        const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 1 }));
        thruster.position.set(i * 0.25, 0.6, -0.35);
        jetpackGroup.add(thruster);

        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff4500, emissiveIntensity: 2 }));
        flame.position.set(i * 0.25, 0.3, -0.35);
        flame.rotation.x = Math.PI;
        thruster.userData.flame = flame;
        jetpackGroup.add(flame);
    }
    jetpackGroup.visible = false;
    group.add(jetpackGroup);

    player = group;
    player.jetpack = jetpackGroup; // Referência direta
    // Store references to animated parts for easier access
    player.leftArm = leftArm;
    player.rightArm = rightArm;
    player.leftLeg = leftLeg;
    player.rightLeg = rightLeg;

    scene.add(player);
}

function createGru() {
    const group = new THREE.Group();
    group.scale.set(0.6, 0.6, 0.6); // Gru menor conforme solicitado

    // Tronco (Hunched & Top-Heavy)
    const bodyGeometry = new THREE.SphereGeometry(1.2, 16, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.set(1.4, 1.9, 0.85);
    body.position.y = 2.2;
    body.rotation.x = -0.15; // Inclinado para frente (em direção ao player)
    group.add(body);

    // Gola Alta do Sobretudo
    const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.8, 0.7, 16),
        new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    collar.position.y = 3.6;
    collar.rotation.x = -0.1;
    group.add(collar);

    // Cachecol Volumoso (Anéis)
    const scarfGroup = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.12, 8, 16),
            new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x222222 : 0x444444 })
        );
        ring.rotation.x = Math.PI / 2 - 0.1;
        ring.position.y = 3.5 + i * 0.12;
        ring.position.z = -0.05;
        scarfGroup.add(ring);
    }
    group.add(scarfGroup);

    // Cabeça (Forma de Ovo/Oval)
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xccaa99 })
    );
    head.scale.set(1, 1.4, 0.9);
    head.position.y = 4.0;
    head.position.z = -0.1;
    group.add(head);

    // Nariz Icônico (Voltado para o Player)
    const noseGeo = new THREE.ConeGeometry(0.12, 1.2, 8);
    const nose = new THREE.Mesh(noseGeo, new THREE.MeshStandardMaterial({ color: 0xccaa99 }));
    nose.rotation.x = Math.PI / 2; // Aponta para frente (-Z)
    nose.position.set(0, 4.0, -0.7);
    gruNose = nose;
    group.add(nose);

    // Olhos e Sobrancelhas
    const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000 });

    for (let i of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(i * 0.18, 4.1, -0.4);
        group.add(eye);

        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), pupilMat);
        pupil.position.set(i * 0.18, 4.1, -0.46);
        group.add(pupil);

        // Sobrancelhas Anguladas (Expressão Malvada)
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), pupilMat);
        brow.position.set(i * 0.2, 4.25, -0.45);
        brow.rotation.z = i * 0.45;
        group.add(brow);

        // Orelhas
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xccaa99 }));
        ear.position.set(i * 0.45, 4.0, -0.1);
        ear.scale.set(0.5, 1, 1);
        group.add(ear);
    }

    // Braços Longos e Finos
    const armMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2);

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.9, 2.4, 0);
    leftArm.rotation.z = 0.5;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.9, 2.4, 0);
    rightArm.rotation.z = -0.5;
    group.add(rightArm);

    // Mãos/Luvas Pretas
    const handGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const handMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const lHand = new THREE.Mesh(handGeo, handMat);
    lHand.position.set(-1.45, 1.4, 0);
    group.add(lHand);
    const rHand = new THREE.Mesh(handGeo, handMat);
    rHand.position.set(1.45, 1.4, 0);
    group.add(rHand);

    // Pernas Muito Finas (O clássico do Gru)
    const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 1.2);
    for (let i of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, armMat);
        leg.position.set(i * 0.2, 0.6, 0);
        group.add(leg);

        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), handMat);
        shoe.position.set(i * 0.2, 0.1, 0.1);
        group.add(shoe);
    }

    gru = group;
    gru.position.set(0, 0, 7);
    scene.add(gru);
}

function createEnvironment() {
    for (let i = 0; i < 10; i++) addFloorSegment(i * -20);
}

function addFloorSegment(z) {
    const group = new THREE.Group();

    // Pista (Asfalto Tech)
    const seg = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 20),
        new THREE.MeshStandardMaterial({
            map: textures.floor,
            color: 0x888888,
            roughness: 0.8
        })
    );
    seg.rotation.x = -Math.PI / 2;
    group.add(seg);

    const grid = new THREE.GridHelper(10, 20, 0x3b82f6, 0x1e293b);
    grid.rotation.x = Math.PI / 2;
    seg.add(grid);

    // Prédios de Alturas Diferentes
    for (let side of [-1, 1]) {
        for (let j = 0; j < 2; j++) {
            const h = 5 + Math.random() * 20;
            const buildGeo = new THREE.BoxGeometry(4, h, 8);
            const buildMat = new THREE.MeshStandardMaterial({
                map: textures.building,
                color: 0x1e293b
            });
            const build = new THREE.Mesh(buildGeo, buildMat);
            build.position.set(side * 8, h / 2, (j - 0.5) * 10);
            group.add(build);

            // Luzes Neon nas janelas
            for (let k = 0; k < h / 2; k++) {
                const win = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.4, 0.4),
                    new THREE.MeshStandardMaterial({
                        color: Math.random() > 0.5 ? 0x00ffff : 0xfde047,
                        emissive: Math.random() > 0.5 ? 0x00ffff : 0xfde047,
                        emissiveIntensity: 2
                    })
                );
                win.position.set(side * 5.9, 1 + k * 2, (j - 0.5) * 10 + (Math.random() - 0.5) * 6);
                win.rotation.y = -side * Math.PI / 2;
                group.add(win);
            }
        }
    }

    group.position.z = z;
    scene.add(group);
    floorSegments.push(group);
}

// --- SPAWNERS ---
function spawnItem() {
    const lane = LANES[Math.floor(Math.random() * 3)];
    const rand = Math.random();

    if (rand < 0.6) { // Banana Orgânica Procedural
        const bananaGroup = new THREE.Group();

        // Criar a curva da espinha da banana
        const points = [];
        for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const angle = (t - 0.5) * 2.2;
            const radius = 0.5;
            points.push(new THREE.Vector3(
                Math.cos(angle) * radius - radius,
                Math.sin(angle) * radius,
                0
            ));
        }
        const curve = new THREE.CatmullRomCurve3(points);

        const material = new THREE.MeshStandardMaterial({
            map: textures.banana,
            color: 0xffffff,
            roughness: 0.4,
            metalness: 0.1
        });
        const body = new THREE.Mesh(geometry, material);
        bananaGroup.add(body);

        // Ponta de Maturação (Preta)
        const tipGeo = new THREE.SphereGeometry(0.09, 8, 8);
        const tipMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.copy(points[0]);
        bananaGroup.add(tip);

        // Cabo (Marrom)
        const stemGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.2, 6);
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.copy(points[points.length - 1]);
        stem.position.y += 0.05;
        stem.rotation.z = -0.6;
        bananaGroup.add(stem);

        bananaGroup.scale.set(1.5, 1.5, 1.5);
        bananaGroup.position.set(lane, 0.8, -80);
        scene.add(bananaGroup);
        coins.push(bananaGroup);
    } else if (rand < 0.8) { // Obstáculos Premium
        const lane = LANES[Math.floor(Math.random() * 3)];
        const subRand = Math.random();
        const obsGroup = new THREE.Group();
        let type = 'low';

        if (subRand < 0.4) { // Barreira de Alerta
            type = 'low';
            const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x334155 }));
            const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.1), new THREE.MeshStandardMaterial({
                map: textures.barrier,
                color: 0xffffff,
                emissive: 0xef4444,
                emissiveIntensity: 0.2
            }));
            sign.position.y = 0.5;
            obsGroup.add(base, sign);
            obsGroup.position.y = 0.1;
        } else if (subRand < 0.7) { // Arma de Peido Volumétrica Animada
            type = 'low';
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 1.8), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 }));
            barrel.rotation.z = Math.PI / 2;
            const tank = new THREE.Mesh(new THREE.SphereGeometry(0.55), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
            tank.position.x = -1; barrel.add(tank);

            const smokeGroup = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const fart = new THREE.Mesh(new THREE.SphereGeometry(0.35 + Math.random() * 0.2), new THREE.MeshStandardMaterial({ color: 0x84cc16, transparent: true, opacity: 0.5 }));
                fart.position.set(0.8 + i * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4);
                smokeGroup.add(fart);
            }
            obsGroup.add(smokeGroup);
            obsGroup.add(barrel);

            // Detalhes da Arma
            const nozzle = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 16), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 }));
            nozzle.rotation.y = Math.PI / 2;
            nozzle.position.x = 0.9;
            obsGroup.add(nozzle);

            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            handle.position.set(-0.5, -0.6, 0);
            obsGroup.add(handle);

            obsGroup.position.y = 0.8;
            obsGroup.userData.isFartGun = true;
            obsGroup.userData.smokeGroup = smokeGroup;
            obsGroup.userData.barrel = barrel;
        } else { // Dr. Nefário com Super Scooter
            type = 'high';
            const scooter = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 }));
            scooter.position.y = -0.5;
            const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 8, 32), new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, emissiveIntensity: 2 }));
            ring.rotation.x = Math.PI / 2;
            ring.position.y = -0.3;
            scooter.add(ring);

            const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, emissiveIntensity: 5 }));
            thruster.position.y = -0.4; scooter.add(thruster);

            const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.5), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 }));
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.35), new THREE.MeshStandardMaterial({ color: 0xddbb99 }));
            head.position.y = 1.0;
            const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 1 }));
            glasses.position.set(0, 1.0, 0.25);

            obsGroup.add(scooter, coat, head, glasses);
            obsGroup.position.y = 1.0;
            obsGroup.userData.isNefario = true;
            obsGroup.userData.baseX = lane;
            obsGroup.userData.offset = Math.random() * Math.PI * 2;
        }

        obsGroup.position.set(lane, obsGroup.position.y, -80);
        obsGroup.userData.type = type;
        scene.add(obsGroup);
        obstacles.push(obsGroup);
    } else if (rand < 0.85) { // Power-up
        const types = ['magnet', 'rocket', 'superjump'];
        const type = types[Math.floor(Math.random() * types.length)];
        const puGroup = new THREE.Group();

        let model;
        if (type === 'magnet') {
            model = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
            model.rotation.x = Math.PI;
        } else if (type === 'rocket') {
            model = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            tip.position.y = 0.5;
            model.add(tip);
        } else {
            model = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 12), new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            model.add(core);
        }

        puGroup.add(model);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, emissive: 0xffffff, emissiveIntensity: 0.5 }));
        puGroup.add(glow);

        puGroup.position.set(lane, 0.8, -80);
        puGroup.userData = { type };
        scene.add(puGroup);
        powerups.push(puGroup);
    }
}

function createDust() {
    if (!gameActive || isJumping || isSliding || activePowerup === 'rocket') return;

    const pGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const pMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.6 });
    const p = new THREE.Mesh(pGeo, pMat);

    p.position.set(player.position.x + (Math.random() - 0.5) * 0.5, 0.1, player.position.z + 0.5);
    scene.add(p);
    particles.push({
        mesh: p,
        life: 1.0,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, Math.random() * 0.05, 0.1)
    });
}

// --- GAME LOOP ---
function update() {
    if (!gameActive) return;

    score += 1;
    document.getElementById('score-value').innerText = score.toString().padStart(5, '0');

    // Dificuldade Progressiva (Velocidade aumenta mais rápido)
    speed += 0.00005;
    document.getElementById('speed-bar').style.width = `${Math.min((speed - 0.2) * 200, 100)}%`;

    // Movimento Lateral
    player.position.x = THREE.MathUtils.lerp(player.position.x, LANES[currentLane], 0.15);

    // Física e Power-ups
    handlePhysics();
    handleItems();

    // Animação de Corrida (Braços e Pernas)
    if (gameActive && !isJumping && !isSliding && activePowerup !== 'rocket') {
        const time = Date.now() * 0.01;
        const moveAmount = Math.sin(time) * 0.5;
        if (player.leftArm && player.rightArm && player.leftLeg && player.rightLeg) {
            player.leftArm.rotation.x = moveAmount;
            player.rightArm.rotation.x = -moveAmount;
            player.leftLeg.rotation.x = -moveAmount;
            player.rightLeg.rotation.x = moveAmount;
        }
    }

    // Movimento da Luz de Acompanhamento
    if (playerHeroLight && player) {
        playerHeroLight.position.x = player.position.x;
        playerHeroLight.position.y = player.position.y + 2.5;
        playerHeroLight.position.z = player.position.z + 1;
    }

    // Gru perseguindo (Distância maior para melhor visibilidade)
    const timeGru = Date.now() * 0.002;
    const gruTargetZ = 8.5 + (Math.sin(timeGru) * 0.8);
    gru.position.z = THREE.MathUtils.lerp(gru.position.z, gruTargetZ, 0.02);

    // Animar nariz Pulsante (Escalar nos eixos da base)
    const noseScale = 1 + Math.sin(Date.now() * 0.01) * 0.15;
    gruNose.scale.set(noseScale, 1, noseScale);

    // Animação dos Braços do Gru (Movimento de Garra/Agarrar)
    if (gru.children) {
        gru.children.forEach(child => {
            if (child.geometry && child.geometry.type === 'CylinderGeometry' && child.position.y > 2) {
                // Identificar braços pela posição X
                if (child.position.x < 0) child.rotation.z = 0.5 + Math.sin(timeGru * 2) * 0.2;
                if (child.position.x > 0) child.rotation.z = -0.5 - Math.sin(timeGru * 2) * 0.2;
            }
        });
    }

    // Aviso do Nariz (Ativo se estiver quase tocando)
    const warning = document.getElementById('warning-message');
    if (gru.position.z < 5) {
        warning.classList.remove('hidden');
    } else {
        warning.classList.add('hidden');
    }

    // Rotação quando está com foguete (Jetpack)
    const targetRotation = activePowerup === 'rocket' ? Math.PI : 0;
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRotation, 0.1);

    // Animação dos Obstáculos
    obstacles.forEach(o => {
        if (o.userData.isNefario) {
            const time = Date.now() * 0.002 + o.userData.offset;
            o.position.x = o.userData.baseX + Math.sin(time) * 2.5;
            o.rotation.y = Math.sin(time * 5) * 0.3;
            o.position.y = 1.2 + Math.abs(Math.sin(time * 10)) * 0.2;
        }
        if (o.userData.isFartGun) {
            const time = Date.now() * 0.01;
            // Vibrar o barril
            o.userData.barrel.position.y = Math.sin(time * 5) * 0.05;
            o.userData.barrel.rotation.z = Math.PI / 2 + Math.sin(time * 10) * 0.05;
            // Pulsar fumaça
            o.userData.smokeGroup.children.forEach((s, idx) => {
                s.scale.setScalar(1 + Math.sin(time * 2 + idx) * 0.2);
            });

            // Animação das Chamas do Jetpack
            if (activePowerup === 'rocket' && player.jetpack) {
                player.jetpack.children.forEach(child => {
                    if (child.geometry.type === 'ConeGeometry') {
                        child.scale.set(1, 1 + Math.sin(Date.now() * 0.05) * 0.2, 1);
                    }
                });
            }
        }
    });

    // Partículas
    if (Math.random() < 0.3) createDust();
    particles.forEach((p, i) => {
        p.mesh.position.add(p.vel);
        p.life -= 0.02;
        p.mesh.material.opacity = p.life;
        p.mesh.scale.setScalar(p.life);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    });

    // Taxa de Spawn aumenta com a velocidade
    const spawnChance = 0.04 + (speed * 0.1);
    if (Math.random() < Math.min(spawnChance, 0.15)) spawnItem();
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

    // Moedas (Bananas)
    coins.forEach((c, i) => {
        c.position.z += speed;
        c.rotation.y += 0.05;

        // Distância até o player (considerando o centro do corpo)
        const playerPos = player.position.clone();
        playerPos.y += 0.7; // Ajuste para o centro do Minion
        const dist = c.position.distanceTo(playerPos);

        // Magnetismo Ativo (Apenas com o Power-up Magnet)
        if (activePowerup === 'magnet' && dist < 8) {
            c.position.lerp(playerPos, 0.2);
        }

        // Coleta Direta (Raio 1.2)
        if (dist < 1.2) {
            sounds.collect();
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
    sounds.powerup();
    activePowerup = type;
    powerupTimer = POWERUP_DURATION;
    const ui = document.getElementById('powerup-status');
    const name = document.getElementById('powerup-name');
    ui.classList.remove('hidden');
    name.innerText = type.toUpperCase();

    if (type === 'rocket' && player.jetpack) {
        player.jetpack.visible = true;
    }
}

function deactivatePowerup() {
    if (activePowerup === 'rocket' && player.jetpack) {
        player.jetpack.visible = false;
    }
    activePowerup = null;
    document.getElementById('powerup-status').classList.add('hidden');
}

function jump() {
    if (!gameActive || isJumping) return;
    isJumping = true;
    jumpVelocity = activePowerup === 'superjump' ? 0.4 : 0.22;
    sounds.jump();
}

function slide() {
    if (!gameActive || isSliding) return;
    isSliding = true;
    player.scale.y = 0.5;
    sounds.button();
    setTimeout(() => { player.scale.y = 1; isSliding = false; }, 600);
}

function setupControls() {
    window.addEventListener('keydown', (e) => {
        if (!gameActive) return;
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            currentLane = Math.max(0, currentLane - 1);
            sounds.button();
        }
        if (e.key === 'ArrowRight' || e.key === 'd') {
            currentLane = Math.min(2, currentLane + 1);
            sounds.button();
        }
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') {
            jump();
        }
        if (e.key === 'ArrowDown' || e.key === 's') {
            slide();
        }
    });

    // Eventos de Skin
    document.querySelectorAll('.skin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSkin = btn.dataset.skin;
            sounds.button();

            // Preview da skin no menu
            if (!gameActive) {
                scene.remove(player);
                createPlayer();
                player.rotation.y = Math.PI / 4; // Um pouco de lado pra ver melhor
            }
        });
    });

    document.getElementById('start-button').addEventListener('click', () => {
        startGame();
        sounds.button();
    });

    document.getElementById('skins-menu-button').addEventListener('click', () => {
        const selector = document.getElementById('skin-selector');
        selector.classList.toggle('hidden-menu');
        sounds.button();
    });

    document.getElementById('back-to-menu-button').addEventListener('click', () => {
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('start-menu').classList.remove('hidden');
        sounds.button();
    });

    document.getElementById('restart-button').onclick = () => { sounds.button(); startGame(); };

    // Carregar Recorde
    const high = localStorage.getItem('minion-high-score') || '0';
    document.getElementById('high-score-value').innerText = high.padStart(5, '0');
}

function startGame() {
    score = 0;
    speed = 0.2;
    currentLane = 1;
    gameActive = true;
    deactivatePowerup();
    gru.position.set(0, 0, 7);
    obstacles.forEach(o => scene.remove(o)); obstacles.length = 0;
    coins.forEach(c => scene.remove(c)); coins.length = 0;
    powerups.forEach(p => scene.remove(p)); powerups.length = 0;
    document.getElementById('start-menu').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
}

function gameOver() {
    sounds.hit();
    gameActive = false;

    // Salvar Recorde
    const currentHigh = parseInt(localStorage.getItem('minion-high-score') || '0');
    if (score > currentHigh) {
        localStorage.setItem('minion-high-score', score.toString());
        document.getElementById('high-score-value').innerText = score.toString().padStart(5, '0');
    }

    document.getElementById('game-over').classList.remove('hidden');
    document.getElementById('final-score-value').innerText = score;
    document.getElementById('final-best-value').innerText = localStorage.getItem('minion-high-score');
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
