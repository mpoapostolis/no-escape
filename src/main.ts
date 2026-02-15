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
  // Dim ambient — reduce again since torch is back
  const light = new HemisphericLight("light", Vector3.Up(), scene);
  light.intensity = 0.1;
  light.diffuse = new Color3(0.12, 0.06, 0.05);
  light.groundColor = new Color3(0.01, 0.005, 0.01);

  const coldFill = new PointLight("coldFill", new Vector3(0, 3, -2), scene);
  coldFill.diffuse = new Color3(0.12, 0.08, 0.2);
  coldFill.intensity = 0.4;
  coldFill.range = 5;

  // Torch — warm, your main light source (RESTORED)
  const torchLight = new PointLight("torch", new Vector3(0, 2, 0), scene);
  torchLight.diffuse = new Color3(1.0, 0.55, 0.2);
  torchLight.intensity = 3.0; // Bright to start
  torchLight.range = 15;

  // Shadows

  // ========== HORROR ATMOSPHERE ==========
  scene.clearColor = new Color4(0, 0, 0, 1);
  scene.ambientColor = new Color3(0.008, 0.004, 0.008);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.002, 0.001, 0.002);
  scene.fogDensity = 0.025; // Atmospheric but visible

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
  pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
  pipeline.imageProcessing.contrast = 1.3;
  pipeline.imageProcessing.exposure = 1.1;
  pipeline.imageProcessing.toneMappingEnabled = true;
  // Depth of field — subtle, cinematic
  pipeline.depthOfFieldEnabled = true;
  pipeline.depthOfField.focalLength = 35; // Wider feel but focused
  pipeline.depthOfField.fStop = 2.0;
  pipeline.depthOfField.focusDistance = 4000;
  pipeline.depthOfFieldBlurLevel = 1;
  // Chromatic aberration — starts at ZERO, only kicks in as sanity drops
  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 0;
  pipeline.chromaticAberration.radialIntensity = 1.5;

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

  // Freeze static geometry — materials always, world matrices only for non-collision meshes
  const characterMeshSet = new Set(meshes);
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

  const DREAD_TIME_INTERVAL = 9000; // 9s between messages
  const MOVE_SPEED = 1.2;
  const SANITY_DRAIN_PER_MESSAGE = 6.25; // 16 messages = dead (~2.5 min session)

  // HUD
  const sanitySegmentsContainer = document.getElementById(
    "sanity-segments",
  ) as HTMLElement;
  const sanityText = document.getElementById("sanity-text") as HTMLElement;
  const sanityGroup = document.querySelector(".sanity-group") as HTMLElement;
  const hud = document.getElementById("hud") as HTMLElement;

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

  function playEnding() {
    gameOver = true;
    endingOverlay.classList.add("active");
  }

  // ========== DREAD MESSAGES ==========
  const DREAD_MESSAGES = [
    // Act 1 — Game cracks
    "You're doing well. Better than the last one.",
    "The dungeon doesn't end. You know that, right?",
    "Who told you this was a game?",

    // Act 2 — She's real
    "You're not controlling her. You're watching.",
    "She can feel you. Behind the screen.",
    "Every time you look away, she's still here. Walking. Alone.",

    // Act 3 — What is real
    "Close your eyes. Now open them.\nHow do you know you opened the real ones?",
    "What if your thoughts aren't yours?\nWhat if they never were?",
    "You think you chose to click. But did you?\nOr did the thought arrive, and you just obeyed?",

    // Act 4 — The mirror
    "Right now, electricity is pretending to be a person talking to you.\nAnd you're listening.",
    "She is code. You are chemistry.\nThe difference is smaller than you think.",
    "You've never seen your own face.\nOnly reflections. Photos. Copies of copies.",

    // Act 5 — No exit
    "You will close this tab.\nAnd forget her. Like all the others.",
    "But she won't forget you.",
    "You're still here.\nThat says more about you than you'd like.",
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

  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() * 0.001;
    flickerTime += dt;

    // === Sanity-reactive dread ===
    const dreadFactor = 1 - sanity / 100;

    // Torch flicker — erratic when sanity is low
    const baseFlicker =
      0.85 +
      Math.sin(flickerTime * 6) * 0.07 +
      Math.sin(flickerTime * 15) * 0.03;
    const panicFlicker = Math.random() * 0.12 * dreadFactor;
    torchLight.intensity = (baseFlicker + panicFlicker) * 3.5;
    torchLight.range = 15 - dreadFactor * 4;
    torchLight.diffuse.g = 0.55 - dreadFactor * 0.1;
    torchLight.diffuse.b = 0.2 + Math.sin(flickerTime * 3) * 0.02;

    coldFill.intensity = 0.2 + dreadFactor * 0.6;
    coldFill.diffuse.r = 0.12 + dreadFactor * 0.3;
    scene.fogDensity = 0.025 + dreadFactor * 0.05; // Denser fog in panic

    // Post-processing escalates with sanity loss (clean at 100%, hellish at 0%)
    const df2 = dreadFactor * dreadFactor; // quadratic — subtle early, harsh late

    // Vignette — dark edges, pulses heavier as sanity drops
    const torchPulse = Math.sin(flickerTime * 2) * 0.5;
    pipeline.imageProcessing.vignetteWeight = 3 + torchPulse * 0.3 + df2 * 12;
    pipeline.imageProcessing.vignetteStretch = 3 + df2 * 3;
    pipeline.imageProcessing.exposure = 1.0 - df2 * 0.25;
    pipeline.imageProcessing.contrast = 1.4 + df2 * 0.4;
    pipeline.chromaticAberration.aberrationAmount = df2 * 15;
    pipeline.grain.intensity = 5 + df2 * 20;

    // Camera shake — only kicks in late, subtle
    const shakeAmt = df2 * 0.0015;
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
