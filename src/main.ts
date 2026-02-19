import {
  Scene,
  ArcRotateCamera,
  WebGPUEngine,
  Engine,
  AbstractEngine,
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
  StandardMaterial,
  PBRMaterial,
} from "@babylonjs/core";
import "@babylonjs/loaders";

async function main() {
  const ANIMATIONS = {
    walk: "walk",
  };

  const canvas = document.querySelector("canvas") as HTMLCanvasElement;

  let engine: AbstractEngine;
  const webGPUSupported = navigator.gpu !== undefined;
  if (webGPUSupported) {
    const webgpu = new WebGPUEngine(canvas, { audioEngine: true });
    await webgpu.initAsync();
    engine = webgpu;
  } else {
    engine = new Engine(canvas, true, { audioEngine: true });
  }

  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;
  scene.autoClear = false;
  scene.collisionsEnabled = true;
  // Group 1 (player + enemy) inherits depth from group 0 (dungeon) — walls occlude characters
  scene.setRenderingAutoClearDepthStencil(1, false, false, false);

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
  const bgMusic = new Sound("bgMusic", "bg_music.mp3", scene, null, {
    loop: true,
    autoplay: false,
  });

  // ========== LIGHTS ==========
  const light = new HemisphericLight("light", Vector3.Up(), scene);
  light.intensity = 0.05;
  light.diffuse = new Color3(0.06, 0.03, 0.06);
  light.groundColor = new Color3(0.005, 0.002, 0.005);

  // Cold fill — sickly purple, like something wrong is nearby
  const coldFill = new PointLight("coldFill", new Vector3(0, 3, -2), scene);
  coldFill.diffuse = new Color3(0.05, 0.0, 0.18);
  coldFill.intensity = 0.6;
  coldFill.range = 4;

  // Torch — barely enough light to see
  const torchLight = new PointLight("torch", new Vector3(0, 2, 0), scene);
  torchLight.diffuse = new Color3(1.0, 0.38, 0.08);
  torchLight.intensity = 2.0;
  torchLight.range = 8;

  // Shadows

  // ========== HORROR ATMOSPHERE ==========
  scene.clearColor = new Color4(0, 0, 0, 1);
  scene.ambientColor = new Color3(0.002, 0.001, 0.002);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.0, 0.0, 0.0);
  scene.fogDensity = 0.055;

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
  pipeline.grain.intensity = 5;
  pipeline.grain.animated = true;
  // Color grading — cinematic, clean at full sanity
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 5;
  pipeline.imageProcessing.vignetteStretch = 3;
  pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 1);
  pipeline.imageProcessing.contrast = 1.5;
  pipeline.imageProcessing.exposure = 0.9;
  pipeline.imageProcessing.toneMappingEnabled = true;
  // Depth of field — subtle, cinematic
  pipeline.depthOfFieldEnabled = true;
  pipeline.depthOfField.focalLength = 35; // Wider feel but focused
  pipeline.depthOfField.fStop = 2.0;
  pipeline.depthOfField.focusDistance = 4000;
  pipeline.depthOfFieldBlurLevel = 1;
  // Chromatic aberration — starts at ZERO, only kicks in as sanity drops
  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 3;
  pipeline.chromaticAberration.radialIntensity = 2.0;

  // ========== INPUT ==========
  const keySet = new Set<string>();
  scene.onKeyboardObservable.add((keys) => {
    if (keys.type === KeyboardEventTypes.KEYDOWN) {
      keySet.add(keys.event.code);
    } else if (keys.type === KeyboardEventTypes.KEYUP) {
      keySet.delete(keys.event.code);
    }
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    engine.resize();
  });

  // ========== LOAD MODELS ==========
  const { meshes, animationGroups } = await ImportMeshAsync("woman.glb", scene);
  const anims = new Map<string, AnimationGroup>(
    animationGroups.map((ag) => [ag.name, ag]),
  );
  scene.stopAllAnimations();
  const { meshes: dungeonMeshes } = await ImportMeshAsync("dungeon.glb", scene);
  const rootDungeonMesh = dungeonMeshes[0];

  // ========== DUNGEON GRID ==========
  rootDungeonMesh.computeWorldMatrix(true);
  const hierBounds = rootDungeonMesh.getHierarchyBoundingVectors(true);
  const TILE_W = (hierBounds.max.x - hierBounds.min.x) * 0.88;
  const TILE_D = (hierBounds.max.z - hierBounds.min.z) * 0.88;
  console.log("Dungeon tile size:", TILE_W, "x", TILE_D);

  // Enable collisions and force opaque materials on original dungeon meshes
  dungeonMeshes.forEach((m) => {
    m.checkCollisions = true;
    m.renderingGroupId = 0; // Ensure background
    if (m.material) {
      // Force opaque to ensure proper depth writing (hides orbs behind walls)
      m.material.transparencyMode = 0; // OPAQUE
      m.material.backFaceCulling = true;
      m.material.forceDepthWrite = true;
    }
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
          child.renderingGroupId = 0;
          // Material changes propogate from original mesh, but just to be safe/clear
        });
      }
    }
  }

  // ========== ENEMIES (3x) ==========
  const ENEMY_SPEEDS = [0.95, 1.15, 1.35];
  const ENEMY_STARTS = [
    new Vector3(3, 0, 3),
    new Vector3(-10, 0, 6),
    new Vector3(6, 0, -10),
  ];

  const allEnemyLoads = await Promise.all([
    ImportMeshAsync("bad_guy.glb", scene),
    ImportMeshAsync("bad_guy.glb", scene),
    ImportMeshAsync("bad_guy.glb", scene),
  ]);

  interface EnemyState { root: import("@babylonjs/core").AbstractMesh; meshes: import("@babylonjs/core").AbstractMesh[] }
  const enemies: EnemyState[] = [];

  for (let i = 0; i < 3; i++) {
    const { meshes: em, animationGroups: ea } = allEnemyLoads[i];
    const root = em[0];
    root.scaling.setAll(1.5);
    root.position.copyFrom(ENEMY_STARTS[i]);
    root.checkCollisions = true;
    root.ellipsoid = new Vector3(0.4, 0.9, 0.4);
    root.ellipsoidOffset = new Vector3(0, 0.9, 0);
    em.forEach((m) => {
      m.renderingGroupId = 1;
      m.alwaysSelectAsActiveMesh = true;
      m.refreshBoundingInfo({ applySkeleton: true, applyMorph: true });
      if (m.material) {
        m.material.backFaceCulling = false;
        if (m.material instanceof PBRMaterial)
          (m.material as PBRMaterial).forceDepthWrite = true;
        else if (m.material instanceof StandardMaterial)
          (m.material as StandardMaterial).forceDepthWrite = true;
      }
    });
    const walkAnim = ea.find((ag) => ag.name.toLowerCase().includes("walk")) ?? ea[0];
    walkAnim?.start(true);
    enemies.push({ root, meshes: em });
  }

  const stompSound = new Sound("stomp", "stomp.flac", scene, null, {
    loop: true,
    autoplay: false,
    volume: 0.9,
  });
  const demonSound = new Sound("demon", "demon.wav", scene, null, {
    loop: false,
    autoplay: false,
  });
  let demonPlayed = false;

  // Freeze static geometry — materials always, world matrices only for non-collision meshes
  const characterMeshSet = new Set(meshes);
  enemies.forEach((e) => e.meshes.forEach((m) => characterMeshSet.add(m as any)));
  scene.meshes.forEach((m) => {
    if (characterMeshSet.has(m as any)) return;

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

  // ========== GAME STATE ==========
  let sanity = 100;
  let gameStarted = false;
  let gameOver = false;
  let survivalTime = 0;
  let lastTimerSec = -1;

  const DREAD_TIME_INTERVAL = 6500;
  const MOVE_SPEED = 1.2;
  const SANITY_DRAIN_PER_MESSAGE = 9; // ~11 messages = dead

  // HUD
  const sanitySegmentsContainer = document.getElementById(
    "sanity-segments",
  ) as HTMLElement;
  const sanityText = document.getElementById("sanity-text") as HTMLElement;
  const sanityGroup = document.querySelector(".sanity-group") as HTMLElement;
  const hud = document.getElementById("hud") as HTMLElement;
  const survivalTimerEl = document.getElementById("survival-timer") as HTMLElement;
  const survivalDisplayEl = document.getElementById("survival-display") as HTMLElement;

  // Initialize Segments (20 segments = 5% each)
  const TOTAL_SEGMENTS = 20;
  const segments: HTMLElement[] = [];

  if (sanitySegmentsContainer) {
    for (let i = 0; i < TOTAL_SEGMENTS; i++) {
      const seg = document.createElement("div");
      seg.classList.add("segment", "active");
      sanitySegmentsContainer.appendChild(seg);
      segments.push(seg);
    }
  }

  // ========== INTRO ==========
  const introOverlay = document.getElementById("intro-overlay") as HTMLElement;
  const bootTextEl = document.getElementById("boot-text") as HTMLElement;
  const introPrompt = document.getElementById("intro-prompt") as HTMLElement;

  const BOOT_LOG = [
    { text: "BIOS DATE 01/01/99 14:22:51 VER 1.02", delay: 100 },
    { text: "CPU: NEC V60 @ 16MHz", delay: 200 },
    { text: "640K RAM SYSTEM... OK", delay: 300 },
    { text: "LOADING KERNEL...", delay: 600 },
    { text: "MOUNTING VOLUME 'SUBJECT_492'...", delay: 1000 },
    { text: "READING SECTOR 0...", delay: 1400 },
    {
      text: "ERROR: CORRUPTED SECTOR DETECTED",
      style: "boot-error",
      delay: 1800,
    },
    { text: "ATTEMPTING RECOVERY...", delay: 2400 },
    {
      text: "RECOVERY FAILED. BYPASSING SAFETY PROTOCOLS.",
      style: "boot-warning",
      delay: 3000,
    },
    { text: "INITIALIZING SENSORY INTERFACE...", delay: 3500 },
    { text: "SYSTEM READY.", style: "boot-success", delay: 4200 },
  ];

  function runBootSequence() {
    introPrompt.classList.add("hidden");

    // Ensure AudioContext is resumed
    const audioContext = engine.getAudioContext();
    if (audioContext?.state === "suspended") {
      audioContext.resume();
    }

    let totalDelay = 0;

    BOOT_LOG.forEach((line) => {
      setTimeout(() => {
        const div = document.createElement("div");
        div.className = "boot-line";
        if (line.style) div.classList.add(line.style);
        div.textContent = line.text;
        bootTextEl.appendChild(div);

        // Auto-scroll
        bootTextEl.scrollTop = bootTextEl.scrollHeight;
      }, line.delay);
      totalDelay = Math.max(totalDelay, line.delay);
    });

    setTimeout(() => {
      startIntroSequence();
    }, totalDelay + 800);
  }

  function startIntroSequence() {
    bgMusic.play();

    // Fade out intro overlay
    introOverlay.classList.add("hidden");

    // Intro — pure game feel, short and punchy
    const introLines = [
      { text: "Use W A S D to move.", delay: 500 },
      { text: "Find a way out.", delay: 4000 },
      { text: "Stay in the light.", delay: 7500 },
    ];

    const dreadEl = document.getElementById("dread-overlay") as HTMLElement;
    const dreadTextEl = document.getElementById("dread-text") as HTMLElement;

    introLines.forEach(({ text, delay }, i) => {
      setTimeout(() => {
        // Intro starts bottom-center (tutorial), last one drifts
        if (i < introLines.length - 1) {
          dreadEl.style.top = "auto";
          dreadEl.style.bottom = "14vh";
          dreadEl.style.left = "50%";
          dreadEl.style.transform = "translateX(-50%)";
        } else {
          dreadEl.style.top = "30%";
          dreadEl.style.bottom = "auto";
          dreadEl.style.left = "25%";
          dreadEl.style.transform = "none";
        }
        dreadTextEl.innerHTML = text.replace(/\n/g, "<br>");
        dreadEl.classList.add("dread-visible");
      }, delay);
      setTimeout(() => {
        dreadEl.classList.remove("dread-visible");
      }, delay + 2800);
    });

    // Enable movement immediately — walk while narrator talks
    gameStarted = true;
    hud.style.opacity = "1";
    canvas.focus();

    // Start dread messages after intro
    setTimeout(() => {
      startDreadLoop();
    }, 12000);
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
  introPrompt.classList.remove("hidden"); // Show prompt initially
  introOverlay.addEventListener("click", runBootSequence, { once: true });

  // ========== ENDING (lose) ==========
  const endingOverlay = document.getElementById(
    "ending-overlay",
  ) as HTMLElement;

  function fmtTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function playEnding() {
    gameOver = true;
    stompSound.stop();
    const survived = fmtTime(Math.floor(survivalTime));
    if (survivalDisplayEl) survivalDisplayEl.textContent = `YOU SURVIVED: ${survived}`;
    endingOverlay.classList.add("active");
  }
  endingOverlay.style.cursor = "pointer";
  endingOverlay.addEventListener("click", () => window.location.reload());

  // ========== DREAD MESSAGES ==========
  const DREAD_MESSAGES = [
    // Act 1 — Feels like a tutorial. Then doesn't.
    "Use W A S D to move.\nThere is no way out.",
    "There are three of them.\nYou noticed.",
    "You're faster than they are.\nFor now.",

    // Act 2 — The game becomes aware
    "This is level 1.\nThere are no other levels.",
    "You're doing well.\nSubject 491 also did well.",
    "The health bar is called NEURAL SYNC.\nAsk yourself why.",

    // Act 3 — It knows you
    "Stop running for one second.\nWhat are you actually afraid of?",
    "They don't know they're chasing you.\nThey just follow the code.\nSo do you.",
    "You chose to click.\nOr did the thought arrive\nand you just obeyed it?",

    // Act 4 — The existential drop
    "You are 37 trillion cells\ntrying to survive a dungeon\nbuilt in a text editor.",
    "Right now your heart is beating.\nYou didn't ask it to.\nIt doesn't ask you.",
    "You've never seen your own face.\nOnly reflections.\nCopies of copies of copies.",

    // Act 5 — Full dissolution
    "When you die here, you'll close the tab.\nWhen you die out there,\nnobody closes the tab.",
    "The dungeon is infinite.\nSo is the space\nbetween your thoughts.",
    "She's not trapped in here.\nYou put her here.\nAnd you keep coming back.",
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

    // Random position on screen (keep within safe area)
    const top = 15 + Math.random() * 55; // 15% to 70% from top
    const left = 10 + Math.random() * 50; // 10% to 60% from left
    dreadOverlay.style.top = `${top}%`;
    dreadOverlay.style.bottom = "auto";
    dreadOverlay.style.left = `${left}%`;
    dreadOverlay.style.transform = "none";

    const dreadTextEl = document.getElementById("dread-text") as HTMLElement;
    dreadTextEl.innerHTML = msg.replace(/\n/g, "<br>");
    dreadOverlay.classList.add("dread-visible");

    sanity = Math.max(0, sanity - SANITY_DRAIN_PER_MESSAGE);

    // Show long enough to read, fade before next message
    const displayTime = Math.min(6000, 2500 + msg.length * 45);
    fadeOutTimeout = setTimeout(() => {
      dreadOverlay.classList.remove("dread-visible");
    }, displayTime);
  }

  // ========== GAME LOOP ==========
  let wasMoving = false;
  let flickerTime = 0;
  let enemyDist = 999;

  let lastSanityInt = 100;

  // Pre-allocate reusable vectors — zero GC pressure per frame
  const _tmpHead = new Vector3();
  const _tmpTorchPos = new Vector3();
  const _tmpColdPos = new Vector3();
  const _tmpMoveVec = new Vector3();
  const _tmpDirFwd = new Vector3();
  const _tmpDirRight = new Vector3();
  const _tmpLookAt = new Vector3();

  const _tmpGravity = new Vector3(0, -0.08, 0);
  const _tmpEnemyDir = new Vector3();
  const _tmpEnemyLookAt = new Vector3();

  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() * 0.001;
    flickerTime += dt;

    // === Sanity-reactive dread ===
    const dreadFactor = 1 - sanity / 100;

    // Torch flicker — erratic, barely stable
    const baseFlicker =
      0.75 +
      Math.sin(flickerTime * 7) * 0.1 +
      Math.sin(flickerTime * 19) * 0.05 +
      Math.sin(flickerTime * 3.3) * 0.04;
    const panicFlicker = Math.random() * 0.2 * dreadFactor;
    torchLight.intensity = (baseFlicker + panicFlicker) * 2.6;
    torchLight.range = 8 - dreadFactor * 3.5;
    torchLight.diffuse.g = 0.38 - dreadFactor * 0.15;
    torchLight.diffuse.b = 0.08 + Math.sin(flickerTime * 2) * 0.01;

    // Cold fill pulses like a heartbeat
    coldFill.intensity = 0.6 + Math.sin(flickerTime * 1.1) * 0.15 + dreadFactor * 0.8;
    coldFill.range = 4 + dreadFactor * 4;
    scene.fogDensity = 0.055 + dreadFactor * 0.07;

    const df2 = dreadFactor * dreadFactor;

    const torchPulse = Math.sin(flickerTime * 2) * 0.5;
    const proximityFactor = Math.max(0, 1 - enemyDist / 7);

    // Vignette — black normally, bleeds red when they're close
    pipeline.imageProcessing.vignetteColor.r = proximityFactor * 0.7;
    pipeline.imageProcessing.vignetteColor.g = 0;
    pipeline.imageProcessing.vignetteColor.b = 0;
    pipeline.imageProcessing.vignetteWeight = 5 + torchPulse * 0.4 + df2 * 14 + proximityFactor * 22;
    pipeline.imageProcessing.vignetteStretch = 3 + df2 * 4 + proximityFactor * 2;
    pipeline.imageProcessing.exposure = 0.9 - df2 * 0.3 - proximityFactor * 0.1;
    pipeline.imageProcessing.contrast = 1.5 + df2 * 0.5;
    pipeline.chromaticAberration.aberrationAmount = 3 + df2 * 18 + proximityFactor * 12;
    pipeline.grain.intensity = 8 + df2 * 25 + proximityFactor * 10;

    // Camera shake — proximity makes it violent
    const proximityShake = Math.max(0, 1 - enemyDist / 5) * 0.009;
    const shakeAmt = df2 * 0.002 + proximityShake;
    camera.alpha += (Math.random() - 0.5) * shakeAmt;
    camera.beta += (Math.random() - 0.5) * shakeAmt * 0.4;

    // Camera + torch always track player
    const px = rootMesh.position.x;
    const py = rootMesh.position.y;
    const pz = rootMesh.position.z;

    _tmpHead.set(px, py + 0.5, pz);
    camera.setTarget(_tmpHead);

    _tmpTorchPos.set(px, py + 1.2, pz);
    torchLight.position.copyFrom(_tmpTorchPos);

    if (!gameStarted || gameOver) return;

    // === Survival timer ===
    survivalTime += dt;
    const timeSec = Math.floor(survivalTime);
    if (timeSec !== lastTimerSec) {
      lastTimerSec = timeSec;
      if (survivalTimerEl) survivalTimerEl.textContent = fmtTime(timeSec);
    }

    // === Enemy chase ===
    const STOMP_NEAR = 9;
    const TELEPORT_FAR = 17;
    let minEnemyDist = 999;

    for (let ei = 0; ei < enemies.length; ei++) {
      const enemy = enemies[ei];
      _tmpEnemyDir.copyFrom(rootMesh.position).subtractInPlace(enemy.root.position);
      const edist = _tmpEnemyDir.length();
      if (edist < minEnemyDist) minEnemyDist = edist;

      // Teleport if too far — reappear near player from random angle
      if (edist > TELEPORT_FAR) {
        const angle = Math.random() * Math.PI * 2;
        const r = 9 + Math.random() * 5;
        enemy.root.position.set(
          rootMesh.position.x + Math.cos(angle) * r,
          0,
          rootMesh.position.z + Math.sin(angle) * r,
        );
        continue;
      }

      if (edist > 0.5) {
        _tmpEnemyDir.normalize().scaleInPlace(ENEMY_SPEEDS[ei] * (1 + dreadFactor * 0.6) * dt);
        _tmpEnemyDir.y = 0;
        enemy.root.position.addInPlace(_tmpEnemyDir);
        enemy.root.position.y = 0;
        _tmpEnemyLookAt.set(rootMesh.position.x, 0, rootMesh.position.z);
        enemy.root.lookAt(_tmpEnemyLookAt);
      } else if (!demonPlayed) {
        demonPlayed = true;
        demonSound.play();
        setTimeout(() => playEnding(), 900);
      }
    }

    enemyDist = minEnemyDist;

    // Stomp — loop when any enemy is close
    if (minEnemyDist < STOMP_NEAR) {
      if (!stompSound.isPlaying) stompSound.play();
    } else {
      if (stompSound.isPlaying) stompSound.stop();
    }

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
      _tmpMoveVec.normalize().scaleInPlace(MOVE_SPEED * dt);
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
      if (sanityText) sanityText.textContent = `${sanityInt}%`;

      // Update Segments
      const activeCount = Math.ceil((sanityInt / 100) * TOTAL_SEGMENTS);
      segments.forEach((seg, i) => {
        if (i < activeCount) {
          seg.classList.add("active");
        } else {
          seg.classList.remove("active");
        }
      });

      // Update Color/State
      if (sanityGroup) {
        sanityGroup.classList.remove("stable", "caution", "critical");
        if (sanityInt > 60) {
          sanityGroup.classList.add("stable");
        } else if (sanityInt > 30) {
          sanityGroup.classList.add("caution");
        } else {
          sanityGroup.classList.add("critical");
        }
      }
    }

    // Lose
    if (sanity <= 0 && !gameOver) playEnding();

    // Cold fill follows player
    _tmpColdPos.set(px, py + 3, pz - 2);
    coldFill.position.copyFrom(_tmpColdPos);
  });

  engine.runRenderLoop(() => {
    scene.render();
  });
} // end main

main().catch((err) => {
  console.error("Failed to start game:", err);
});
