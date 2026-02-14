import {
  Scene,
  ArcRotateCamera,
  WebGPUEngine,
  Vector3,
  HemisphericLight,
  ImportMeshAsync,
  KeyboardEventTypes,
  AnimationGroup,
  Color3,
  Color4,
  PointLight,
  DefaultRenderingPipeline,
  Sound,
  GlowLayer,
  ParticleSystem,
  ShadowGenerator,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
} from "@babylonjs/core";
import "@babylonjs/loaders";

const ANIMATIONS = {
  walk: "walk",
};

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const engine = new WebGPUEngine(canvas, {
  audioEngine: true,
});
await engine.initAsync();

const scene = new Scene(engine);
scene.skipPointerMovePicking = true;
scene.autoClear = false;
scene.collisionsEnabled = true;

const camera = new ArcRotateCamera(
  "camera",
  Math.PI / 2,
  1.1,
  2,
  Vector3.Zero(),
  scene,
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 2.5;
camera.upperRadiusLimit = 2.5;
camera.lowerBetaLimit = 0.9;
camera.upperBetaLimit = 1.5;

// BG music
const bgMusic = new Sound("bgMusic", "/bg_music.mp3", scene, null, {
  loop: true,
  autoplay: false,
});

// ========== LIGHTS ==========
// Dim ambient — just enough so you can sense walls in the dark
const light = new HemisphericLight("light", Vector3.Up(), scene);
light.intensity = 0.06;
light.diffuse = new Color3(0.12, 0.06, 0.05);
light.groundColor = new Color3(0.01, 0.005, 0.01);

// Torch — warm, your main light source
const torchLight = new PointLight("torch", new Vector3(0, 2, 0), scene);
torchLight.diffuse = new Color3(1.0, 0.55, 0.2);
torchLight.intensity = 1.4;
torchLight.range = 9;

// Cold rim light behind player — gives creepy edge lighting
const coldFill = new PointLight("coldFill", new Vector3(0, 3, -2), scene);
coldFill.diffuse = new Color3(0.12, 0.08, 0.2);
coldFill.intensity = 0.25;
coldFill.range = 5;

// Shadows
const shadowGen = new ShadowGenerator(512, torchLight);
shadowGen.useBlurExponentialShadowMap = true;
shadowGen.blurKernel = 16;
shadowGen.darkness = 0.75;

// ========== HORROR ATMOSPHERE ==========
scene.clearColor = new Color4(0, 0, 0, 1);
scene.ambientColor = new Color3(0.008, 0.004, 0.008);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.003, 0.001, 0.0);
scene.fogDensity = 0.025;

// Glow — only for portal, excluded from character
const glow = new GlowLayer("glow", scene, {
  mainTextureSamples: 1,
  mainTextureFixedSize: 256,
});
glow.intensity = 0.6;

// ========== EXIT PORTAL ==========
const EXIT_POS = new Vector3(60, 0.5, 60);

// Outer ring
const portalMesh = MeshBuilder.CreateTorus(
  "exitPortal",
  { diameter: 3, thickness: 0.25, tessellation: 24 },
  scene,
);
portalMesh.position = EXIT_POS.clone();
portalMesh.rotation.x = Math.PI / 2;

const portalMat = new StandardMaterial("portalMat", scene);
portalMat.emissiveColor = new Color3(0.15, 0.9, 0.35);
portalMat.diffuseColor = new Color3(0, 0, 0);
portalMat.alpha = 0.9;
portalMesh.material = portalMat;

// Inner ring — counter-rotating
const portalInner = MeshBuilder.CreateTorus(
  "exitPortalInner",
  { diameter: 2, thickness: 0.15, tessellation: 24 },
  scene,
);
portalInner.position = EXIT_POS.clone();
portalInner.rotation.x = Math.PI / 2;
const portalInnerMat = new StandardMaterial("portalInnerMat", scene);
portalInnerMat.emissiveColor = new Color3(0.4, 1.0, 0.6);
portalInnerMat.diffuseColor = new Color3(0, 0, 0);
portalInnerMat.alpha = 0.7;
portalInner.material = portalInnerMat;

// Portal light
const portalLight = new PointLight("portalLight", EXIT_POS.clone(), scene);
portalLight.position.y = 1.5;
portalLight.diffuse = new Color3(0.2, 1.0, 0.4);
portalLight.intensity = 3;
portalLight.range = 15;

// Freeze portal materials — they never change
portalMat.freeze();
portalInnerMat.freeze();

// Only glow the portal meshes, not the character
glow.addIncludedOnlyMesh(portalMesh);
glow.addIncludedOnlyMesh(portalInner);

// Portal particles
const portalParticles = new ParticleSystem("portalParts", 80, scene);
portalParticles.createPointEmitter(
  new Vector3(-0.8, 0, -0.8),
  new Vector3(0.8, 0, 0.8),
);
portalParticles.emitter = EXIT_POS.clone();
portalParticles.minSize = 0.05;
portalParticles.maxSize = 0.2;
portalParticles.minLifeTime = 0.8;
portalParticles.maxLifeTime = 2.5;
portalParticles.emitRate = 25;
portalParticles.minEmitPower = 0.2;
portalParticles.maxEmitPower = 0.6;
portalParticles.direction1 = new Vector3(-0.3, 1, -0.3);
portalParticles.direction2 = new Vector3(0.3, 2.5, 0.3);
portalParticles.gravity = new Vector3(0, 0.5, 0);
portalParticles.color1 = new Color4(0.1, 1.0, 0.4, 0.6);
portalParticles.color2 = new Color4(0.3, 0.8, 0.5, 0.3);
portalParticles.colorDead = new Color4(0, 0.2, 0.05, 0);
portalParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
portalParticles.updateSpeed = 0.01;
portalParticles.start();

// ========== POST PROCESSING ==========
const pipeline = new DefaultRenderingPipeline("horrorPipeline", true, scene, [
  camera,
]);
// Bloom — soft glow, not overpowering
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.55;
pipeline.bloomWeight = 0.35;
pipeline.bloomKernel = 32;
// Film grain — subtle at start, escalates with sanity loss
pipeline.grainEnabled = true;
pipeline.grain.intensity = 3;
pipeline.grain.animated = true;
// Color grading — cinematic, clean at full sanity
pipeline.imageProcessingEnabled = true;
pipeline.imageProcessing.vignetteEnabled = true;
pipeline.imageProcessing.vignetteWeight = 3;
pipeline.imageProcessing.vignetteStretch = 0.5;
pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
pipeline.imageProcessing.contrast = 1.3;
pipeline.imageProcessing.exposure = 0.85;
pipeline.imageProcessing.toneMappingEnabled = true;
// Depth of field — subtle, cinematic
pipeline.depthOfFieldEnabled = true;
pipeline.depthOfField.focalLength = 60;
pipeline.depthOfField.fStop = 3.5;
pipeline.depthOfField.focusDistance = 2500;
pipeline.depthOfFieldBlurLevel = 1;
// Chromatic aberration — starts at ZERO, only kicks in as sanity drops
pipeline.chromaticAberrationEnabled = true;
pipeline.chromaticAberration.aberrationAmount = 0;
pipeline.chromaticAberration.radialIntensity = 0.8;

// ========== INPUT ==========
const keySet = new Set<string>();
scene.onKeyboardObservable.add((keys) => {
  if (keys.type === KeyboardEventTypes.KEYDOWN) {
    keySet.add(keys.event.code);
  } else if (keys.type === KeyboardEventTypes.KEYUP) {
    keySet.delete(keys.event.code);
  }
});

// ========== LOAD MODELS ==========
const { meshes, animationGroups } = await ImportMeshAsync("/woman.glb", scene);
const anims = new Map<string, AnimationGroup>(
  animationGroups.map((ag) => [ag.name, ag]),
);
scene.stopAllAnimations();
const { meshes: dungeonMeshes } = await ImportMeshAsync("/dungeon.glb", scene);
const rootDungeonMesh = dungeonMeshes[0];

// ========== DUNGEON GRID ==========
rootDungeonMesh.computeWorldMatrix(true);
const hierBounds = rootDungeonMesh.getHierarchyBoundingVectors(true);
const TILE_W = (hierBounds.max.x - hierBounds.min.x) * 0.88;
const TILE_D = (hierBounds.max.z - hierBounds.min.z) * 0.88;
console.log("Dungeon tile size:", TILE_W, "x", TILE_D);

// Enable collisions on original dungeon meshes
dungeonMeshes.forEach((m) => {
  m.checkCollisions = true;
});

const GRID_HALF = 4;
for (let x = -GRID_HALF; x <= GRID_HALF; x++) {
  for (let z = -GRID_HALF; z <= GRID_HALF; z++) {
    if (x === 0 && z === 0) continue;
    const inst = rootDungeonMesh.instantiateHierarchy();
    if (inst) {
      inst.position.x = x * TILE_W;
      inst.position.z = z * TILE_D;
      // Enable collisions on instanced tiles
      inst.getChildMeshes().forEach((child) => {
        child.checkCollisions = true;
      });
    }
  }
}

// ========== SANITY ORBS ==========
const SANITY_RESTORE = 15;
const ORB_PICKUP_DIST = 2.5;

interface OrbData {
  mesh: ReturnType<typeof MeshBuilder.CreateIcoSphere>;
  light: PointLight;
  particles: ParticleSystem;
  baseX: number;
  baseZ: number;
}
const orbs: OrbData[] = [];

const orbMat = new StandardMaterial("orbMat", scene);
orbMat.emissiveColor = new Color3(0.3, 0.85, 1.0);
orbMat.diffuseColor = new Color3(0, 0, 0);
orbMat.alpha = 0.6;

// Scatter orbs near player start
const orbPositions = [
  new Vector3(4, 0.8, 6),
  new Vector3(-5, 0.8, 3),
  new Vector3(7, 0.8, -4),
  new Vector3(-3, 0.8, -7),
  new Vector3(10, 0.8, 2),
  new Vector3(-8, 0.8, 8),
  new Vector3(3, 0.8, 12),
  new Vector3(-6, 0.8, -3),
  new Vector3(12, 0.8, 8),
  new Vector3(-2, 0.8, 15),
  new Vector3(8, 0.8, -10),
  new Vector3(15, 0.8, 5),
];

orbPositions.forEach((pos, i) => {
  const orb = MeshBuilder.CreateIcoSphere(
    `orb${i}`,
    { radius: 0.18, subdivisions: 1 },
    scene,
  );
  orb.position = pos;
  orb.material = orbMat;
  glow.addIncludedOnlyMesh(orb);

  // Small light so it illuminates nearby walls
  const orbLight = new PointLight(`orbLight${i}`, pos.clone(), scene);
  orbLight.diffuse = new Color3(0.2, 0.6, 1.0);
  orbLight.intensity = 0.8;
  orbLight.range = 4;

  // Floating particles
  const ps = new ParticleSystem(`orbPs${i}`, 15, scene);
  ps.createPointEmitter(new Vector3(-0.1, 0, -0.1), new Vector3(0.1, 0, 0.1));
  ps.emitter = pos.clone();
  ps.minSize = 0.02;
  ps.maxSize = 0.06;
  ps.minLifeTime = 0.5;
  ps.maxLifeTime = 1.2;
  ps.emitRate = 8;
  ps.minEmitPower = 0.05;
  ps.maxEmitPower = 0.15;
  ps.direction1 = new Vector3(-0.1, 0.5, -0.1);
  ps.direction2 = new Vector3(0.1, 1, 0.1);
  ps.gravity = new Vector3(0, 0.3, 0);
  ps.color1 = new Color4(0.2, 0.6, 1.0, 0.5);
  ps.color2 = new Color4(0.4, 0.8, 1.0, 0.3);
  ps.colorDead = new Color4(0, 0.2, 0.5, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.updateSpeed = 0.01;
  ps.start();

  orbs.push({
    mesh: orb as any,
    light: orbLight,
    particles: ps,
    baseX: pos.x,
    baseZ: pos.z,
  });
});

// Freeze static geometry — materials always, world matrices only for non-collision meshes
const characterMeshSet = new Set(meshes);
scene.meshes.forEach((m) => {
  if (characterMeshSet.has(m as any)) return;
  if (m === portalMesh || m === portalInner) return;
  if (orbs.some((o) => o.mesh === m)) return;
  if (m.material) m.material.freeze();
  if (!m.checkCollisions) m.freezeWorldMatrix();
});

// ========== CHARACTER ==========
const rootMesh = meshes[0];
rootMesh.scaling.setAll(0.5);

// Collision ellipsoid for the player
rootMesh.checkCollisions = true;
rootMesh.ellipsoid = new Vector3(0.4, 0.9, 0.4);
rootMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);

// Fix disappearing skirt / flickering meshes
meshes.forEach((m) => {
  // Prevent frustum culling from hiding sub-meshes
  m.alwaysSelectAsActiveMesh = true;

  // Force bounding info refresh so culling works correctly
  m.refreshBoundingInfo({ applySkeleton: true, applyMorph: true });

  if (m.material) {
    m.material.backFaceCulling = false;

    // Fix alpha-blended meshes (skirt, hair, etc.) flickering
    if (m.material instanceof PBRMaterial) {
      const pbr = m.material as PBRMaterial;
      if (pbr.albedoTexture?.hasAlpha) {
        pbr.useAlphaFromAlbedoTexture = true;
        pbr.transparencyMode = PBRMaterial.MATERIAL_ALPHATEST;
        pbr.alphaCutOff = 0.4;
      }
      // Prevent z-fighting on overlapping geometry
      pbr.forceDepthWrite = true;
    } else if (m.material instanceof StandardMaterial) {
      const std = m.material as StandardMaterial;
      if (std.diffuseTexture?.hasAlpha) {
        m.material.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
        std.alphaCutOff = 0.4;
      }
      std.forceDepthWrite = true;
    }
  }

  // Explicitly set rendering group to avoid depth sorting issues
  m.renderingGroupId = 1;
});

console.log(
  "Animation names:",
  animationGroups.map((ag) => ag.name),
);

const walkAnim =
  anims.get(ANIMATIONS.walk) ??
  animationGroups.find((ag) => ag.name.toLowerCase().includes("walk")) ??
  animationGroups[0];

const fps = walkAnim?.targetedAnimations[0]?.animation.framePerSecond ?? 30;

const idleAnim = walkAnim?.clone("idle") ?? null;
if (idleAnim) {
  idleAnim.from = fps * 0;
  idleAnim.to = fps * 1.2;
}
if (walkAnim) {
  walkAnim.from = fps * 1.3;
}
idleAnim?.start(true);

// Shadows
meshes.forEach((m) => shadowGen.addShadowCaster(m));
scene.meshes.forEach((m) => (m.receiveShadows = true));

// ========== GAME STATE ==========
let sanity = 100;
let gameStarted = false;
let gameOver = false;
let gameWon = false;

const DREAD_TIME_INTERVAL = 10000;
const MOVE_SPEED = 0.01;
const SANITY_DRAIN_PER_MESSAGE = 6.5;

// HUD
const sanityBar = document.getElementById("sanity-bar") as HTMLElement;
const sanityText = document.getElementById("sanity-text") as HTMLElement;
const hud = document.getElementById("hud") as HTMLElement;
const orbCounter = document.getElementById("orb-counter") as HTMLElement;
const winOverlay = document.getElementById("win-overlay") as HTMLElement;
const winLine1 = document.getElementById("win-line-1") as HTMLElement;
const winLine2 = document.getElementById("win-line-2") as HTMLElement;

// ========== INTRO ==========
const introOverlay = document.getElementById("intro-overlay") as HTMLElement;

function startIntroSequence() {
  bgMusic.play();

  // Immediately fade out the black overlay so 3D scene + narrator text is visible
  introOverlay.style.transition = "opacity 2s ease";
  introOverlay.style.opacity = "0";
  setTimeout(() => {
    introOverlay.style.display = "none";
  }, 2000);

  // Narrator intro — friendly, helpful, normal game stuff
  const introLines = [
    { text: "Welcome.", delay: 500 },
    { text: "Use W A S D to move. Mouse to look around.", delay: 3500 },
    { text: "Collect the purple orbs. They restore your sanity.", delay: 7500 },
    { text: "Find the green light. That is your exit.", delay: 11500 },
    { text: "Good luck.", delay: 15500 },
  ];

  const dreadEl = document.getElementById("dread-overlay") as HTMLElement;
  const dreadTextEl = document.getElementById("dread-text") as HTMLElement;

  introLines.forEach(({ text, delay }) => {
    setTimeout(() => {
      dreadTextEl.innerHTML = text.replace(/\n/g, "<br>");
      dreadEl.classList.add("dread-visible");
    }, delay);
    setTimeout(() => {
      dreadEl.classList.remove("dread-visible");
    }, delay + 3000);
  });

  // Enable movement immediately — walk while narrator talks
  gameStarted = true;
  hud.style.opacity = "1";
  canvas.focus();

  // Start dread messages after intro narrator finishes
  setTimeout(() => {
    startDreadLoop();
  }, 20000);
}

function startDreadLoop() {
  const loop = setInterval(() => {
    if (gameOver || dreadIndex >= DREAD_MESSAGES.length) {
      clearInterval(loop);
      return;
    }
    triggerDreadMessage();
  }, DREAD_TIME_INTERVAL);
}

introOverlay.style.cursor = "pointer";
introOverlay.addEventListener("click", startIntroSequence, { once: true });

// ========== ENDING (lose) ==========
const endingOverlay = document.getElementById("ending-overlay") as HTMLElement;
const endingLine1 = document.getElementById("ending-line-1") as HTMLElement;
const endingLine2 = document.getElementById("ending-line-2") as HTMLElement;

function playEnding() {
  gameOver = true;
  endingOverlay.style.display = "flex";
  setTimeout(() => {
    endingOverlay.style.background = "rgba(255,255,255,1)";
  }, 100);
  setTimeout(() => {
    endingLine1.style.opacity = "1";
  }, 4000);
  setTimeout(() => {
    endingLine2.style.opacity = "1";
  }, 8000);
}

// ========== WIN ENDING ==========
function playWinEnding() {
  gameWon = true;
  gameOver = true;
  winOverlay.style.display = "flex";
  setTimeout(() => {
    winOverlay.style.background = "rgba(0,0,0,1)";
  }, 100);
  setTimeout(() => {
    winLine1.style.opacity = "1";
  }, 3000);
  setTimeout(() => {
    winLine2.style.opacity = "1";
  }, 7000);
}

// ========== DREAD MESSAGES ==========
const DREAD_MESSAGES = [
  "Keep moving.",
  "Your sanity won't last.",
  "Most people quit here.",
  "Are you playing this?\nOr is it playing you?",
  "You didn't choose your name.",
  "You didn't choose your fears.",
  "Who are you\nwhen nobody is watching?",
  "Everyone you love will die.\nYou just don't think about it.",
  "You are alone inside your head.\nYou always have been.",
  "The voice reading this.\nIs that you?",
  "Try to stop it.\nYou can't.",
  "This is not real.\nBut that feeling in your chest is.",
  "You could close this tab.\nBut something won't let you.",
  "...",
];

let dreadIndex = 0;
const dreadOverlay = document.getElementById("dread-overlay") as HTMLElement;
let fadeOutTimeout: ReturnType<typeof setTimeout> | null = null;

function triggerDreadMessage() {
  if (!dreadOverlay || gameOver) return;
  if (dreadIndex >= DREAD_MESSAGES.length) return;

  if (fadeOutTimeout) clearTimeout(fadeOutTimeout);

  const msg = DREAD_MESSAGES[dreadIndex];
  dreadIndex++;

  const dreadTextEl = document.getElementById("dread-text") as HTMLElement;
  dreadTextEl.innerHTML = msg.replace(/\n/g, "<br>");
  dreadOverlay.classList.add("dread-visible");

  sanity = Math.max(0, sanity - SANITY_DRAIN_PER_MESSAGE);

  // Display time: base + per character, capped
  const displayTime = 5000 + msg.length * 60;
  fadeOutTimeout = setTimeout(() => {
    dreadOverlay.classList.remove("dread-visible");
  }, displayTime);
}

// ========== GAME LOOP ==========
let wasMoving = false;
let flickerTime = 0;

let lastSanityInt = 100;

// Pre-allocate reusable vectors — zero GC pressure per frame
const _tmpHead = new Vector3();
const _tmpTorchPos = new Vector3();
const _tmpColdPos = new Vector3();
const _tmpMoveVec = new Vector3();
const _tmpDirFwd = new Vector3();
const _tmpDirRight = new Vector3();
const _tmpLookAt = new Vector3();
const _tmpToExit = new Vector3();

const _tmpGravity = new Vector3(0, -0.08, 0);

scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() * 0.001;
  flickerTime += dt;

  // === Portal animation ===
  portalMesh.rotation.y += dt * 0.8;
  portalInner.rotation.y -= dt * 1.6;
  const portalBob = EXIT_POS.y + Math.sin(flickerTime * 1.5) * 0.15;
  portalMesh.position.y = portalBob;
  portalInner.position.y = portalBob;
  portalLight.intensity = 2.5 + Math.sin(flickerTime * 2) * 1.0;

  // === Sanity-reactive dread ===
  const dreadFactor = 1 - sanity / 100;

  // Torch flicker — erratic when sanity is low
  const baseFlicker =
    0.85 + Math.sin(flickerTime * 6) * 0.07 + Math.sin(flickerTime * 15) * 0.03;
  const panicFlicker = Math.random() * 0.12 * dreadFactor;
  torchLight.intensity = (baseFlicker + panicFlicker) * 1.4;
  torchLight.range = 9 - dreadFactor * 2.5;
  torchLight.diffuse.g = 0.55 - dreadFactor * 0.1;
  torchLight.diffuse.b = 0.2 + Math.sin(flickerTime * 3) * 0.02;

  coldFill.intensity = 0.2 + dreadFactor * 0.6;
  coldFill.diffuse.r = 0.12 + dreadFactor * 0.3;
  scene.fogDensity = 0.025 + dreadFactor * 0.035;

  // Post-processing escalates with sanity loss (clean at 100%, hellish at 0%)
  const df2 = dreadFactor * dreadFactor; // quadratic — subtle early, harsh late
  pipeline.imageProcessing.vignetteWeight = 3 + df2 * 10;
  pipeline.imageProcessing.exposure = 0.85 - df2 * 0.25;
  pipeline.imageProcessing.contrast = 1.3 + df2 * 0.5;
  pipeline.chromaticAberration.aberrationAmount = df2 * 40;
  pipeline.grain.intensity = 3 + df2 * 20;
  pipeline.bloomWeight = 0.35 + dreadFactor * 0.3;
  pipeline.bloomThreshold = 0.55 - dreadFactor * 0.2;

  // Camera shake — barely noticeable at first, violent near death
  const shakeAmt = df2 * 0.003;
  camera.alpha +=
    (Math.random() - 0.5) * shakeAmt + Math.sin(flickerTime * 0.7) * 0.0002;
  camera.beta +=
    (Math.random() - 0.5) * shakeAmt * 0.5 +
    Math.sin(flickerTime * 0.5) * 0.0001;

  // Camera + torch always track player
  const px = rootMesh.position.x;
  const py = rootMesh.position.y;
  const pz = rootMesh.position.z;

  _tmpHead.set(px, py + 0.5, pz);
  camera.setTarget(_tmpHead);

  _tmpTorchPos.set(px, py + 1.2, pz);
  torchLight.position.copyFrom(_tmpTorchPos);

  if (!gameStarted || gameOver) return;

  // === Movement ===
  camera.getDirectionToRef(Vector3.Forward(), _tmpDirFwd);
  camera.getDirectionToRef(Vector3.Right(), _tmpDirRight);
  _tmpDirFwd.y = 0;
  _tmpDirRight.y = 0;
  _tmpDirFwd.normalize();
  _tmpDirRight.normalize();
  _tmpMoveVec.set(0, 0, 0);
  let isMoving = false;

  if (keySet.has("KeyW")) {
    _tmpMoveVec.addInPlace(_tmpDirFwd);
    isMoving = true;
  }
  if (keySet.has("KeyS")) {
    _tmpMoveVec.subtractInPlace(_tmpDirFwd);
    isMoving = true;
  }
  if (keySet.has("KeyA")) {
    _tmpMoveVec.subtractInPlace(_tmpDirRight);
    isMoving = true;
  }
  if (keySet.has("KeyD")) {
    _tmpMoveVec.addInPlace(_tmpDirRight);
    isMoving = true;
  }

  if (isMoving) {
    _tmpMoveVec.normalize().scaleInPlace(MOVE_SPEED);
    _tmpMoveVec.y = -0.08; // gentle gravity

    // Move with wall collisions
    rootMesh.moveWithCollisions(_tmpMoveVec);

    // Clamp to ground — never climb on objects
    if (rootMesh.position.y > 0) rootMesh.position.y = 0;

    // Rotate character to face movement direction
    _tmpLookAt.set(
      _tmpMoveVec.x + rootMesh.position.x,
      rootMesh.position.y,
      _tmpMoveVec.z + rootMesh.position.z,
    );
    rootMesh.lookAt(_tmpLookAt);

    if (!wasMoving && walkAnim) {
      idleAnim?.stop();
      walkAnim.start(true);
    }
  } else {
    // Apply gravity even when standing still
    rootMesh.moveWithCollisions(_tmpGravity);
    if (rootMesh.position.y > 0) rootMesh.position.y = 0;

    if (wasMoving) {
      walkAnim?.stop();
      idleAnim?.start(true);
    }
  }

  wasMoving = isMoving;

  // Sanity HUD — only update DOM when value changes
  const sanityInt = Math.round(sanity);
  if (sanityInt !== lastSanityInt) {
    lastSanityInt = sanityInt;
    if (sanityBar) sanityBar.style.width = `${sanityInt}%`;
    if (sanityText) sanityText.textContent = `${sanityInt}`;
  }

  // Orb floating + pickup
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    const bobY = 0.8 + Math.sin(flickerTime * 2 + i * 1.7) * 0.2;
    o.mesh.position.y = bobY;
    o.mesh.rotation.x += dt * 1.5;
    o.mesh.rotation.y += dt * 2.5;
    o.light.position.set(o.baseX, bobY + 0.3, o.baseZ);
    o.light.intensity = 0.6 + Math.sin(flickerTime * 3 + i) * 0.3;
    (o.particles.emitter as Vector3).set(o.baseX, bobY, o.baseZ);

    const dx = rootMesh.position.x - o.baseX;
    const dz = rootMesh.position.z - o.baseZ;
    if (dx * dx + dz * dz < ORB_PICKUP_DIST * ORB_PICKUP_DIST) {
      sanity = Math.min(100, sanity + SANITY_RESTORE);
      o.mesh.dispose();
      o.light.dispose();
      o.particles.stop();
      o.particles.dispose();
      orbs.splice(i, 1);
      if (orbCounter) orbCounter.textContent = `${orbs.length}`;
    }
  }

  // Distance to exit
  EXIT_POS.subtractToRef(rootMesh.position, _tmpToExit);
  const dist = _tmpToExit.length();

  // Win
  if (dist < 2 && !gameOver && !gameWon) playWinEnding();

  // Lose
  if (sanity <= 0 && !gameOver) playEnding();

  // Cold fill follows player
  _tmpColdPos.set(px, py + 3, pz - 2);
  coldFill.position.copyFrom(_tmpColdPos);
});

engine.runRenderLoop(() => {
  scene.render();
});
