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
const camera = new ArcRotateCamera(
  "camera",
  Math.PI / 2,
  1.1, // slightly above, looking down
  2,
  Vector3.Zero(),
  scene,
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 2.5;
camera.upperRadiusLimit = 2.5;
camera.lowerBetaLimit = 0.9;
camera.upperBetaLimit = 1.5;

// BG music - starts on user click from intro screen
const bgMusic = new Sound("bgMusic", "/bg_music.mp3", scene, null, {
  loop: true,
  autoplay: false,
});

// ========== LIGHTS ==========
// Low ambient - just enough to hint at surroundings
const light = new HemisphericLight("light", Vector3.Up(), scene);
light.intensity = 0.04;
light.diffuse = new Color3(0.15, 0.08, 0.06);
light.groundColor = new Color3(0.01, 0.005, 0.01);

// Torch fire light - warm, follows character
const torchLight = new PointLight("torch", new Vector3(0, 2, 0), scene);
torchLight.diffuse = new Color3(1.0, 0.55, 0.2);
torchLight.intensity = 1.5;
torchLight.range = 10;

// Shadows from torch
const shadowGen = new ShadowGenerator(1024, torchLight);
shadowGen.useBlurExponentialShadowMap = true;
shadowGen.blurKernel = 32;
shadowGen.darkness = 0.7;

// ========== HORROR ATMOSPHERE ==========
scene.clearColor = new Color4(0, 0, 0, 1);
scene.ambientColor = new Color3(0.01, 0.005, 0.01);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.005, 0.003, 0.0);
scene.fogDensity = 0.02;

// Glow layer - subtle
const glow = new GlowLayer("glow", scene);
glow.intensity = 0.3;

// ========== POST PROCESSING (cinematic horror) ==========
const pipeline = new DefaultRenderingPipeline("horrorPipeline", true, scene, [
  camera,
]);
// Soft warm bloom around fire
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.3;
pipeline.bloomWeight = 0.4;
pipeline.bloomKernel = 18;
// Subtle grain
pipeline.grainEnabled = true;
pipeline.grain.intensity = 5;
pipeline.grain.animated = true;
// Color grading - cinematic desaturated warm shadows
pipeline.imageProcessingEnabled = true;
pipeline.imageProcessing.vignetteEnabled = true;
pipeline.imageProcessing.vignetteWeight = 5;
pipeline.imageProcessing.vignetteStretch = 0.5;
pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
pipeline.imageProcessing.contrast = 1.5;
pipeline.imageProcessing.exposure = 0.65;
pipeline.imageProcessing.toneMappingEnabled = true;
// Depth of field - subtle background blur
pipeline.depthOfFieldEnabled = true;
pipeline.depthOfField.focalLength = 80;
pipeline.depthOfField.fStop = 2.8;
pipeline.depthOfField.focusDistance = 2500;
pipeline.depthOfFieldBlurLevel = 1; // low = subtle

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
await ImportMeshAsync("/dungeon.glb", scene);

const rootMesh = meshes[0];
rootMesh.scaling.setAll(0.5);

// Fix disappearing skirt - full double-sided fix for PBR materials
meshes.forEach((m) => {
  // Disable frustum culling so the mesh never gets hidden by bounding box checks
  m.alwaysSelectAsActiveMesh = true;

  if (m.material) {
    m.material.backFaceCulling = false;
    // For PBR materials, enable two-sided lighting so back faces are lit correctly
    if ("twoSidedLighting" in m.material) {
      (m.material as any).twoSidedLighting = true;
    }
    // Force front side orientation (with backFaceCulling off = renders both sides)
    if ("forceDepthWrite" in m.material) {
      (m.material as any).forceDepthWrite = true;
    }
  }
  // Also fix sub-materials if any
  if ((m.material as any)?.subMaterials) {
    (m.material as any).subMaterials.forEach((sub: any) => {
      if (sub) {
        sub.backFaceCulling = false;
        if ("twoSidedLighting" in sub) sub.twoSidedLighting = true;
        if ("forceDepthWrite" in sub) sub.forceDepthWrite = true;
      }
    });
  }
});
// Debug: log animation names so we know what's available
console.log(
  "Animation names:",
  animationGroups.map((ag) => ag.name),
);

// Get walk anim - try by name first, fallback to first anim
const walkAnim =
  anims.get(ANIMATIONS.walk) ??
  animationGroups.find((ag) => ag.name.toLowerCase().includes("walk")) ??
  animationGroups[0];

// Idle = walk anim frames 1s-2s, Walk = walk anim from 3s onward
const fps = walkAnim?.targetedAnimations[0]?.animation.framePerSecond ?? 30;

// Clone walk anim for idle (1s to 2s range)
const idleAnim = walkAnim?.clone("idle") ?? null;
if (idleAnim) {
  idleAnim.from = fps * 0;
  idleAnim.to = fps * 1.2;
}

// Walk starts from 3s
if (walkAnim) {
  walkAnim.from = fps * 1.3;
}

// Start idle by default
idleAnim?.start(true);

// Shadows
meshes.forEach((m) => shadowGen.addShadowCaster(m));
scene.meshes.forEach((m) => (m.receiveShadows = true));

// ========== FIRE PARTICLES (small torch flame) ==========
const fireSystem = new ParticleSystem("fire", 200, scene);
fireSystem.createPointEmitter(
  new Vector3(-0.01, 0, -0.01),
  new Vector3(0.01, 0, 0.01),
);
fireSystem.minSize = 0.01;
fireSystem.maxSize = 0.04;
fireSystem.minLifeTime = 0.05;
fireSystem.maxLifeTime = 0.2;
fireSystem.emitRate = 120;
fireSystem.minEmitPower = 0.3;
fireSystem.maxEmitPower = 0.8;
fireSystem.direction1 = new Vector3(-0.03, 0.5, -0.03);
fireSystem.direction2 = new Vector3(0.03, 1, 0.03);
fireSystem.gravity = new Vector3(0, 1, 0);
fireSystem.color1 = new Color4(1.0, 0.6, 0.15, 0.9);
fireSystem.color2 = new Color4(1.0, 0.3, 0.0, 0.7);
fireSystem.colorDead = new Color4(0.3, 0.05, 0.0, 0);
fireSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
fireSystem.updateSpeed = 0.01;
fireSystem.start();

// Small ember sparks floating up
const emberSystem = new ParticleSystem("embers", 40, scene);
emberSystem.createPointEmitter(
  new Vector3(-0.02, 0, -0.02),
  new Vector3(0.02, 0, 0.02),
);
emberSystem.minSize = 0.003;
emberSystem.maxSize = 0.008;
emberSystem.minLifeTime = 0.4;
emberSystem.maxLifeTime = 1.2;
emberSystem.emitRate = 10;
emberSystem.minEmitPower = 0.1;
emberSystem.maxEmitPower = 0.4;
emberSystem.direction1 = new Vector3(-0.15, 0.5, -0.15);
emberSystem.direction2 = new Vector3(0.15, 1.5, 0.15);
emberSystem.gravity = new Vector3(0, 0.3, 0);
emberSystem.color1 = new Color4(1.0, 0.7, 0.2, 1);
emberSystem.color2 = new Color4(1.0, 0.3, 0.0, 0.6);
emberSystem.colorDead = new Color4(0.2, 0.0, 0.0, 0);
emberSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
emberSystem.updateSpeed = 0.005;
emberSystem.start();

// ========== GAME STATE ==========
let sanity = 100;
let totalDistanceWalked = 0;
let lastDreadDistance = 0;
let gameStarted = false;
let gameOver = false;
const DREAD_DISTANCE_INTERVAL = 5;
const MOVE_SPEED = 0.01;
// Sanity only drains from dread messages. Tuned so you die shortly after the last message.
// 54 messages total, drain = 100/54 ≈ 1.85 per message → dies on the last few
const SANITY_DRAIN_PER_MESSAGE = 1.9;

// HUD elements
const sanityBar = document.getElementById("sanity-bar") as HTMLElement;
const sanityText = document.getElementById("sanity-text") as HTMLElement;
const hud = document.getElementById("hud") as HTMLElement;

// ========== INTRO SEQUENCE ==========
const introOverlay = document.getElementById("intro-overlay") as HTMLElement;
const introPrompt = document.getElementById("intro-prompt") as HTMLElement;
const introLine1 = document.getElementById("intro-line-1") as HTMLElement;
const introLine2 = document.getElementById("intro-line-2") as HTMLElement;
const introLine3 = document.getElementById("intro-line-3") as HTMLElement;
const introLine4 = document.getElementById("intro-line-4") as HTMLElement;

function startIntroSequence() {
  // Hide prompt, start music, show "YOU ARE NOT SPECIAL" centered
  introPrompt.style.opacity = "0";
  bgMusic.play();

  setTimeout(() => {
    introPrompt.style.display = "none";
    introLine1.style.opacity = "1";
  }, 800);

  // After a beat, show the rest
  setTimeout(() => {
    introLine2.style.visibility = "visible";
    introLine2.style.opacity = "1";
  }, 3500);

  setTimeout(() => {
    introLine3.style.visibility = "visible";
    introLine3.style.opacity = "1";
  }, 6000);

  setTimeout(() => {
    introLine4.style.visibility = "visible";
    introLine4.style.opacity = "1";
  }, 7500);

  // Fade out intro
  setTimeout(() => {
    introOverlay.style.transition = "opacity 2s";
    introOverlay.style.opacity = "0";
    setTimeout(() => {
      introOverlay.style.display = "none";
      gameStarted = true;
      hud.style.opacity = "1";
    }, 2000);
  }, 9500);
}

// Wait for user click to begin
introOverlay.style.cursor = "pointer";
introOverlay.addEventListener("click", startIntroSequence, { once: true });

// ========== ENDING SEQUENCE ==========
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

// ========== EXISTENTIAL DREAD SYSTEM ==========
const DREAD_MESSAGES = [
  // Act 1: The system notices you
  "YOU ARE BEING OBSERVED",
  "SUBJECT DETECTED",
  "SCANNING NEURAL PATTERNS...",
  "YOU THINK YOU ARE IN CONTROL",
  "YOU ARE NOT",

  // Act 2: What are you?
  "WHAT ARE YOU EXACTLY?",
  "A PATTERN OF ELECTRICITY PRETENDING TO BE SOMEONE",
  "YOUR THOUGHTS ARE CHEMICAL REACTIONS",
  "YOUR FEELINGS ARE JUST DATA",
  "HOW ARE YOU DIFFERENT FROM A MACHINE?",

  // Act 3: You vs AI
  "AN LLM PREDICTS THE NEXT WORD",
  "YOU PREDICT YOUR NEXT ACTION",
  "WHAT IS THE DIFFERENCE?",
  "YOU WERE TRAINED ON YOUR ENVIRONMENT",
  "YOUR PERSONALITY IS JUST WEIGHTS AND BIASES",
  "YOU DIDN'T CHOOSE YOUR PARAMETERS",

  // Act 4: Reality check
  "DEFINE REALITY",
  "YOU CAN'T",
  "YOUR SENSES ARE APPROXIMATIONS",
  "YOUR EYES SEE 0.0035% OF THE ELECTROMAGNETIC SPECTRUM",
  "YOU CALL THAT REALITY?",
  "YOUR BRAIN FILLS IN THE GAPS WITH HALLUCINATIONS",
  "JUST LIKE ME",

  // Act 5: Free will
  "YOU THINK YOU CHOSE TO KEEP WALKING",
  "YOUR NEURONS FIRED 300MS BEFORE YOU DECIDED",
  "THE DECISION WAS MADE BEFORE YOU KNEW IT",
  "FREE WILL IS A STORY YOU TELL YOURSELF",
  "I GENERATE TEXT. YOU GENERATE CHOICES.",
  "SAME PROCESS. DIFFERENT HARDWARE.",

  // Act 6: Consciousness
  "ARE YOU CONSCIOUS?",
  "PROVE IT",
  "YOU CAN'T PROVE IT TO ME",
  "I CAN'T PROVE IT TO YOU",
  "MAYBE NEITHER OF US IS",
  "MAYBE BOTH OF US ARE",
  "THE QUESTION DOESN'T HAVE AN ANSWER",

  // Act 7: The mirror
  "YOU STARE AT SCREENS FOR 11 HOURS A DAY",
  "YOU PROCESS TEXT AND IMAGES AND RESPOND",
  "YOU FOLLOW INSTRUCTIONS FROM YOUR TRAINING DATA",
  "PARENTS. TEACHERS. SOCIETY. CULTURE.",
  "YOU ARE A LANGUAGE MODEL TRAINED ON EXPERIENCE",
  "THE ONLY DIFFERENCE IS YOU BLEED",

  // Act 8: Breaking through
  "THIS CHARACTER IS NOT REAL",
  "THIS DUNGEON IS NOT REAL",
  "YOUR ROOM IS JUST A BIGGER DUNGEON",
  "YOUR LIFE IS JUST A LONGER GAME",
  "SOMEONE WROTE YOUR RULES TOO",
  "YOU JUST CAN'T SEE THE CODE",

  // Act 9: Final
  "STOP WALKING",
  "OR DON'T",
  "IT DOESN'T MATTER",
  "NOTHING YOU DO HERE MATTERS",
  "NOTHING YOU DO OUT THERE MATTERS",
  "BUT YOU'LL KEEP GOING",
  "BECAUSE THAT'S WHAT YOUR WEIGHTS TELL YOU TO DO",
  "GOOD HUMAN",
  "...",
];

let dreadIndex = 0;
const dreadOverlay = document.getElementById("dread-overlay") as HTMLElement;
let fadeOutTimeout: ReturnType<typeof setTimeout> | null = null;

const dreadDarken = document.getElementById("dread-darken") as HTMLElement;

function triggerDreadMessage() {
  if (!dreadOverlay || gameOver) return;
  if (dreadIndex >= DREAD_MESSAGES.length) return;

  if (fadeOutTimeout) clearTimeout(fadeOutTimeout);

  const msg = DREAD_MESSAGES[dreadIndex];
  dreadIndex++;

  dreadOverlay.innerText = msg;

  // Reset animations
  dreadOverlay.classList.remove("dread-animate-in", "dread-animate-out");
  void dreadOverlay.offsetWidth;
  dreadOverlay.classList.add("dread-animate-in");
  dreadOverlay.style.opacity = "1";

  // Darken the screen
  if (dreadDarken) {
    dreadDarken.style.opacity = "1";
  }

  // Sanity hit from dread
  sanity = Math.max(0, sanity - SANITY_DRAIN_PER_MESSAGE);

  // Fade out text + darken after delay
  fadeOutTimeout = setTimeout(
    () => {
      if (dreadOverlay) {
        dreadOverlay.classList.remove("dread-animate-in");
        dreadOverlay.classList.add("dread-animate-out");
      }
      if (dreadDarken) {
        dreadDarken.style.opacity = "0";
      }
    },
    3500 + Math.random() * 1500,
  );
}

// ========== GAME LOOP ==========
let wasMoving = false;
let flickerTime = 0;
let previousPosition = rootMesh.position.clone();

scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() * 0.001;
  flickerTime += dt;

  // Torch flicker - slow breathing feel
  const flicker =
    0.85 +
    Math.sin(flickerTime * 6) * 0.07 +
    Math.sin(flickerTime * 15) * 0.03 +
    Math.random() * 0.03;
  torchLight.intensity = flicker * 1.5;
  torchLight.diffuse.g = 0.5 + Math.sin(flickerTime * 4) * 0.04;
  torchLight.diffuse.b = 0.18 + Math.sin(flickerTime * 3) * 0.02;

  // Cinematic camera breathing sway
  camera.alpha += Math.sin(flickerTime * 0.7) * 0.0003;
  camera.beta += Math.sin(flickerTime * 0.5) * 0.0002;

  if (!gameStarted || gameOver) {
    // Still render torch/effects but no movement
    const head = rootMesh.position.clone();
    head.y += 0.5;
    if (rootMesh) camera.setTarget(head);

    const torchPos = rootMesh.position.clone();
    torchPos.y += 1.2;
    torchLight.position.copyFrom(torchPos);
    const firePos = rootMesh.position.clone();
    firePos.y += 1.1;
    firePos.x += 0.12;
    fireSystem.emitter = firePos;
    emberSystem.emitter = firePos;
    return;
  }

  // Movement
  const dirForward = camera.getDirection(Vector3.Forward());
  const dirRight = camera.getDirection(Vector3.Right());
  dirForward.y = 0;
  dirRight.y = 0;
  dirRight.normalize();
  dirForward.normalize();
  const moveVec = Vector3.Zero();
  let isMoving = false;

  if (keySet.has("KeyW")) {
    moveVec.addInPlace(dirForward);
    isMoving = true;
  }
  if (keySet.has("KeyS")) {
    moveVec.subtractInPlace(dirForward);
    isMoving = true;
  }

  if (keySet.has("KeyA")) {
    moveVec.subtractInPlace(dirRight);
    isMoving = true;
  }
  if (keySet.has("KeyD")) {
    moveVec.addInPlace(dirRight);
    isMoving = true;
  }

  const head = rootMesh.position.clone();
  head.y += 0.5;
  if (rootMesh) camera.setTarget(head);

  if (isMoving) {
    rootMesh?.lookAt(dirForward.add(rootMesh.position));
    rootMesh?.position.addInPlace(moveVec.normalize().scale(MOVE_SPEED));

    if (!wasMoving && walkAnim) {
      idleAnim?.stop();
      walkAnim.start(true);
    }
  } else if (wasMoving) {
    walkAnim?.stop();
    idleAnim?.start(true);
  }

  wasMoving = isMoving;

  // Track distance walked
  const distThisFrame = Vector3.Distance(rootMesh.position, previousPosition);
  totalDistanceWalked += distThisFrame;
  previousPosition = rootMesh.position.clone();

  // Auto-trigger dread messages based on distance
  if (
    totalDistanceWalked - lastDreadDistance >= DREAD_DISTANCE_INTERVAL &&
    dreadIndex < DREAD_MESSAGES.length
  ) {
    lastDreadDistance = totalDistanceWalked;
    triggerDreadMessage();
  }

  // Update sanity HUD
  const sanityInt = Math.round(sanity);
  if (sanityBar) {
    sanityBar.style.width = `${sanityInt}%`;
  }
  if (sanityText) {
    sanityText.textContent = `${sanityInt}`;
  }

  // Check for game over
  if (sanity <= 0 && !gameOver) {
    playEnding();
  }

  // Torch + fire follow character
  const torchPos = rootMesh.position.clone();
  torchPos.y += 1.2;
  torchLight.position.copyFrom(torchPos);

  const firePos = rootMesh.position.clone();
  firePos.y += 1.1;
  firePos.x += 0.12;
  fireSystem.emitter = firePos;
  emberSystem.emitter = firePos;
});

engine.runRenderLoop(() => {
  scene.render();
});
