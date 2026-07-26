const canvas = document.querySelector("#pet");
const ctx = canvas.getContext("2d");
const bubble = document.querySelector("#bubble");
const menu = document.querySelector("#menu");
const customPet = document.querySelector("#customPet");
const actionPet = document.querySelector("#actionPet");
const actionIndicator = document.querySelector("#actionIndicator");
const reactionBurst = document.querySelector("#reactionBurst");
const petMenuTitle = document.querySelector("#petMenuTitle");
const stage = document.querySelector("#stage");
let state;
let action = "idle";
let actionUntil = 0;
let startedAt = performance.now();
let blinkAt = 0;
let pointer = { x: 260, y: 230 };
let bubbleTimer;
let lastTap = 0;
let customDataUrl = "";
let usesActionArt = false;
let dragState;
let suppressClickUntil = 0;
let lastLine = "";
let indicatorTimer;
let hoverCooldown = 0;

const actionPatterns = window.PetActionPatterns;
const petCatalog = window.PetCatalog;
const lines = actionPatterns.ACTION_LINES;
let activeActionPet;
let activeManifest;
let manifestRequest = 0;
const poseForAction = {
  idle: "idle",
  blink: "idle",
  pet: "idle",
  walk: "walk",
  run: "walk",
  jump: "celebrate",
  stretch: "stretch",
  play: "play",
  feed: "feed",
  drink: "feed",
  study: "study",
  write: "study",
  type: "study",
  sleep: "sleep",
  nap: "sleep",
  yawn: "sleep",
  celebrate: "celebrate",
  dance: "celebrate",
  happy: "celebrate",
  alert: "alert",
  alarm: "alert",
  surprised: "alert",
};
const actionLabels = {
  idle: "🌿 待机",
  pet: "🫳 摸摸",
  walk: "🐾 行走",
  stretch: "🐈 伸懒腰",
  play: "🪶 玩耍",
  feed: "🍪 吃饼干",
  study: "📖 认真读书",
  sleep: "🌙 睡觉",
  celebrate: "🎉 开心庆祝",
  alert: "🔔 提醒",
};

function contextualLines(next) {
  const openTodos = state?.todos?.filter((item) => !item.done) || [];
  const hour = new Date().getHours();
  const weather = state?.weather?.current;
  const context = [];
  if (next === "idle") {
    if (hour < 6) context.push("这么晚还没休息吗？我陪你收个尾。");
    else if (hour < 11) context.push("早上好！先挑一件最重要的事吧。");
    else if (hour < 14) context.push("午间也要记得吃饭和放松眼睛。");
    else if (hour >= 22) context.push("今天辛苦啦，别忘了早点休息。");
    if (openTodos.length) context.push(`待办还有 ${openTodos.length} 件，我们一件件来。`);
    else context.push("今天的待办很清爽，要不要安排一个小目标？");
    if (weather) context.push(`${state.weather.location?.name || "这里"}现在${weather.label}，${weather.temperature}°，出门前看好天气哦。`);
  }
  if (next === "study" && state?.focus?.duration) {
    context.push(`这次专注 ${Math.round(state.focus.duration / 60)} 分钟，我会安静陪你。`);
  }
  const personality = activeManifest?.speech?.[next] || [];
  return [...personality, ...(lines[next] || []), ...context];
}

function resolveActionSource(next) {
  if (!activeActionPet || !activeManifest) return null;
  const direct = activeManifest.actions?.[next];
  if (direct) return `../assets/pets/${activeActionPet.folder}/${direct}`;
  const fallbackName = activeManifest.fallbacks?.[next] || poseForAction[next] || "idle";
  const fallback = activeManifest.actions?.[fallbackName] || activeManifest.actions?.idle;
  return fallback ? `../assets/pets/${activeActionPet.folder}/${fallback}` : null;
}

function displayActionArt(next) {
  const source = resolveActionSource(next);
  if (source) actionPet.src = source;
}

async function loadActionManifest(definition) {
  const request = ++manifestRequest;
  activeManifest = null;
  try {
    const response = await fetch(`../assets/pets/${definition.folder}/manifest.json`);
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    const manifest = await response.json();
    if (request !== manifestRequest || state?.settings?.activePet !== definition.id) return;
    activeManifest = manifest;
    const sources = Object.values(manifest.actions || {})
      .map((relative) => `../assets/pets/${definition.folder}/${relative}`);
    sources.forEach((source) => {
      const image = new Image();
      image.src = source;
    });
    actionPet.alt = manifest.name || definition.name;
    displayActionArt(action);
  } catch (error) {
    console.error(`Unable to load ${definition.name} action manifest`, error);
  }
}

function showActionLabel(next) {
  if (!state?.settings?.showActionLabel) return;
  clearTimeout(indicatorTimer);
  actionIndicator.textContent = actionLabels[next] || next;
  actionIndicator.classList.add("show");
  indicatorTimer = setTimeout(() => actionIndicator.classList.remove("show"), 1700);
}

function speak(text, duration = 3200) {
  clearTimeout(bubbleTimer);
  bubble.textContent = text;
  bubble.classList.add("show");
  bubbleTimer = setTimeout(() => bubble.classList.remove("show"), duration);
}

function showReactionBurst() {
  reactionBurst.classList.remove("show");
  void reactionBurst.offsetWidth;
  reactionBurst.classList.add("show");
}

function setAction(next, duration = actionPatterns.actionDuration(next), silent = false) {
  action = next;
  actionUntil = performance.now() + duration;
  const direction = actionPatterns.directionFromVector(pointer.x - 260, pointer.y - 230).toLowerCase();
  const facesLeft = ["w", "wsw", "wnw", "sw", "nw"].includes(direction);
  actionPet.style.setProperty("--direction-scale", facesLeft ? "-1" : "1");
  customPet.style.setProperty("--direction-scale", facesLeft ? "-1" : "1");
  if (usesActionArt) {
    displayActionArt(next);
    actionPet.className = `action-pet ${next} dir-${direction}`;
  }
  if (customDataUrl) {
    customPet.className = `custom-pet ${next} group-${actionPatterns.actionGroup(next)} dir-${direction}`;
  }
  showActionLabel(next);
  const choices = contextualLines(next).filter((line) => line !== lastLine);
  if (!silent && choices.length) {
    lastLine = choices[Math.floor(Math.random() * choices.length)];
    speak(lastLine);
  }
}

function ellipse(x, y, rx, ry, fill, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function path(points, fill) {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawMomo(time) {
  const settings = state?.settings || {};
  const type = settings.petType || "cat";
  const body = settings.bodyColor || "#f2a65a";
  const cream = settings.accentColor || "#fff0d6";
  const ink = "#28362f";
  const t = time / 1000;
  const phase = Math.sin(t * 3);
  const breathe = action === "sleep" ? Math.sin(t * 2) * 4 : phase * 2;
  const jump = ["play", "celebrate"].includes(action) ? Math.max(0, Math.sin(t * 10)) * 35 : 0;
  const walk = action === "walk" ? Math.sin(t * 12) * 10 : 0;
  const stretch = action === "stretch" ? Math.sin(Math.min(1, (time - startedAt) / 1400) * Math.PI) : 0;
  const sleeping = action === "sleep";
  const study = action === "study";
  const alert = action === "alert";
  const feeding = action === "feed";
  const playing = action === "play";
  const petting = action === "pet";
  const blink = sleeping || time < blinkAt;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(260 + walk, 290 - jump);

  if (type === "slime") {
    const squash = phase * 7 + (action === "celebrate" ? jump * 0.22 : 0);
    ellipse(0, 52 + squash, 142 + squash * 0.45, 116 - squash * 0.35, body);
    ellipse(-50, 20 + squash, 17, blink ? 4 : 24, ink);
    ellipse(50, 20 + squash, 17, blink ? 4 : 24, ink);
    if (!blink) {
      ellipse(-44, 12 + squash, 5, 7, "#fff");
      ellipse(56, 12 + squash, 5, 7, "#fff");
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-24, 75 + squash);
    ctx.quadraticCurveTo(0, 96 + squash, 26, 73 + squash);
    ctx.stroke();
    ellipse(-92, 69 + squash, 20, 9, cream);
    ellipse(92, 69 + squash, 20, 9, cream);
    ctx.restore();
    return;
  }

  if (sleeping) {
    ctx.font = "bold 34px Microsoft YaHei";
    ctx.fillStyle = "#596fc2";
    ctx.fillText("Z", 112, -128 - ((t * 12) % 28));
    ctx.font = "bold 24px Microsoft YaHei";
    ctx.fillText("z", 150, -95 - ((t * 9) % 22));
  }

  if (alert) {
    ctx.strokeStyle = "#f0a24f";
    ctx.lineWidth = 8;
    [[-150, -130, -125, -110], [150, -130, 125, -110]].forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[2], p[3]);
      ctx.stroke();
    });
  }

  // tail
  if (type === "rabbit") {
    ellipse(139, 93, 42, 42, cream);
  } else {
    ctx.strokeStyle = body;
    ctx.lineCap = "round";
    ctx.lineWidth = type === "dog" ? 48 : 42;
    ctx.beginPath();
    ctx.moveTo(112, 85);
    ctx.quadraticCurveTo(195, 50 + phase * 8, 172, -22);
    ctx.stroke();
    ctx.strokeStyle = cream;
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(174, -19);
    ctx.quadraticCurveTo(193, 12, 177, 34);
    ctx.stroke();
  }

  const bodyY = 56 + breathe + stretch * 12;
  ellipse(0, bodyY, 132 + stretch * 16, 120 - stretch * 12, body);
  ellipse(0, bodyY + 25, 75, 80, cream);

  // paws
  const pawOffset = action === "walk" ? phase * 16 : 0;
  ellipse(-80 + pawOffset, 151, 52, 31, body, -0.08);
  ellipse(80 - pawOffset, 151, 52, 31, body, 0.08);
  for (const x of [-93, -77, 66, 83]) ellipse(x, 157, 5, 9, cream);

  // head and ears
  const headY = -54 - stretch * 28;
  if (type === "rabbit") {
    ellipse(-58, headY - 122, 31, 91, body, -0.13);
    ellipse(58, headY - 122, 31, 91, body, 0.13);
    ellipse(-58, headY - 122, 12, 65, "#e4aaa8", -0.13);
    ellipse(58, headY - 122, 12, 65, "#e4aaa8", 0.13);
  } else if (type === "dog") {
    ellipse(-104, headY - 49, 47, 74, body, -0.7);
    ellipse(104, headY - 49, 47, 74, body, 0.7);
  } else {
    path([[-118, headY - 52], [-108, headY - 142], [-40, headY - 94]], body);
    path([[118, headY - 52], [108, headY - 142], [40, headY - 94]], body);
    path([[-99, headY - 76], [-94, headY - 119], [-58, headY - 87]], "#d97868");
    path([[99, headY - 76], [94, headY - 119], [58, headY - 87]], "#d97868");
  }
  ellipse(0, headY, 128, 112, body);
  ellipse(0, headY + 28, 86, 66, cream);

  // face
  if (blink) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    for (const x of [-45, 45]) {
      ctx.beginPath();
      ctx.moveTo(x - 15, headY - 6);
      ctx.quadraticCurveTo(x, headY + 5, x + 15, headY - 6);
      ctx.stroke();
    }
  } else {
    const lookX = Math.max(-5, Math.min(5, (pointer.x - 260) / 40));
    const lookY = Math.max(-3, Math.min(4, (pointer.y - 220) / 50));
    ellipse(-45, headY - 5, 15, 20, ink);
    ellipse(45, headY - 5, 15, 20, ink);
    ellipse(-40 + lookX, headY - 11 + lookY, 5, 6, "#fff");
    ellipse(50 + lookX, headY - 11 + lookY, 5, 6, "#fff");
  }
  path([[-8, headY + 26], [8, headY + 26], [0, headY + 36]], "#d97868");
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, headY + 37);
  ctx.quadraticCurveTo(-15, headY + 53, -31, headY + 44);
  ctx.moveTo(0, headY + 37);
  ctx.quadraticCurveTo(15, headY + 53, 31, headY + 44);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 56, headY + 37);
    ctx.lineTo(side * 114, headY + 24);
    ctx.moveTo(side * 58, headY + 48);
    ctx.lineTo(side * 118, headY + 48);
    ctx.stroke();
  }

  if (study) {
    ctx.save();
    ctx.translate(0, 89);
    path([[-96, -28], [-4, -8], [-4, 72], [-101, 47]], "#5e7b70");
    path([[96, -28], [4, -8], [4, 72], [101, 47]], "#6f9184");
    ctx.strokeStyle = "#fff6e7";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 70);
    ctx.stroke();
    ctx.restore();
  }

  if (feeding) {
    ellipse(0, 92 + phase * 3, 42, 42, "#d98b45");
    for (const [x, y] of [[-15, 77], [14, 83], [-4, 105], [19, 111]]) ellipse(x, y + phase * 3, 5, 5, "#75452f");
    ellipse(-48, 103, 30, 20, body, -.25);
    ellipse(48, 103, 30, 20, body, .25);
  }

  if (playing) {
    ctx.strokeStyle = "#72533f";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-126, 85);
    ctx.lineTo(-170, -104);
    ctx.stroke();
    path([[-175, -105], [-211, -152], [-172, -139]], "#ef805d");
    path([[-175, -105], [-142, -156], [-151, -117]], "#6a95bb");
  }

  if (petting) {
    ctx.font = "bold 28px Segoe UI Emoji";
    ctx.fillStyle = "#ee7c7c";
    ctx.fillText("♥", -118, -132 - Math.max(0, phase) * 10);
    ctx.fillText("♥", 95, -102 + Math.min(0, phase) * 10);
  }

  if (action === "celebrate") {
    const confetti = [
      [-142, -112, "#ef805d"], [-95, -165, "#f1c85b"], [112, -142, "#6f9dc2"],
      [151, -75, "#82b98d"], [82, -178, "#e58abc"],
    ];
    for (const [x, y, color] of confetti) {
      ctx.save();
      ctx.translate(x, y + phase * 7);
      ctx.rotate(t + x);
      ctx.fillStyle = color;
      ctx.fillRect(-5, -10, 10, 20);
      ctx.restore();
    }
  }
  ctx.restore();
}

function frame(time) {
  if (!customDataUrl) drawMomo(time);
  if (time > actionUntil && action !== "idle") {
    action = "idle";
    if (usesActionArt) {
      displayActionArt("idle");
      actionPet.className = "action-pet idle";
    }
    customPet.className = "custom-pet idle";
  }
  if (!blinkAt || time > blinkAt + 180) blinkAt = time + 2200 + Math.random() * 3500;
  requestAnimationFrame(frame);
}

function useState(next) {
  state = next;
  const selected = state.customPets?.find((item) => item.id === state.settings.activePet);
  customDataUrl = selected?.dataUrl || "";
  const nextActionPet = petCatalog.findBuiltInPet(state.settings.activePet);
  const actionPetChanged = nextActionPet?.id !== activeActionPet?.id;
  activeActionPet = nextActionPet?.kind === "action-art" ? nextActionPet : null;
  usesActionArt = Boolean(activeActionPet);
  petMenuTitle.textContent = `和${state.settings.petName || activeActionPet?.name || "桌宠"}互动`;
  customPet.src = customDataUrl;
  customPet.style.display = customDataUrl ? "block" : "none";
  actionPet.style.display = usesActionArt ? "block" : "none";
  canvas.style.display = customDataUrl || usesActionArt ? "none" : "block";
  if (usesActionArt) {
    if (actionPetChanged || !activeManifest) loadActionManifest(activeActionPet);
    else displayActionArt(action);
  } else {
    activeManifest = null;
    manifestRequest += 1;
  }
}

stage.addEventListener("pointermove", (event) => {
  const rect = stage.getBoundingClientRect();
  pointer = {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
  if (!dragState) return;
  const deltaX = event.screenX - dragState.startX;
  const deltaY = event.screenY - dragState.startY;
  const now = performance.now();
  const elapsed = Math.max(1, now - dragState.lastAt);
  dragState.speed = Math.hypot(event.screenX - dragState.lastX, event.screenY - dragState.lastY) / elapsed;
  dragState.lastX = event.screenX;
  dragState.lastY = event.screenY;
  dragState.lastAt = now;
  if (!dragState.moved && Math.hypot(deltaX, deltaY) > 4) {
    dragState.moved = true;
    stage.classList.add("dragging");
    setAction("walk", 60_000, true);
  }
  if (dragState.moved) {
    if (Math.abs(deltaX) > 2) {
      actionPet.style.setProperty("--direction-scale", deltaX < 0 ? "-1" : "1");
      customPet.style.setProperty("--direction-scale", deltaX < 0 ? "-1" : "1");
    }
    window.petdesk.petDrag({ phase: "move", screenX: event.screenX, screenY: event.screenY });
  }
});

stage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".pet-menu")) return;
  dragState = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    lastX: event.screenX,
    lastY: event.screenY,
    lastAt: performance.now(),
    speed: 0,
    moved: false,
  };
  stage.setPointerCapture(event.pointerId);
  window.petdesk.petDrag({ phase: "start", screenX: event.screenX, screenY: event.screenY });
});

stage.addEventListener("pointerup", (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  window.petdesk.petDrag({ phase: "end", screenX: event.screenX, screenY: event.screenY });
  if (dragState.moved) {
    suppressClickUntil = Date.now() + 450;
    if (dragState.speed > 1.15) {
      showReactionBurst();
      setAction("celebrate", 1500);
    } else {
      setAction("idle", actionPatterns.actionDuration("idle"), true);
    }
  }
  stage.classList.remove("dragging");
  dragState = null;
});

stage.addEventListener("pointercancel", () => {
  window.petdesk.petDrag({ phase: "end" });
  stage.classList.remove("dragging");
  dragState = null;
});

stage.addEventListener("pointerenter", () => {
  if (!state?.settings?.hoverReaction || Date.now() < hoverCooldown || action !== "idle") return;
  hoverCooldown = Date.now() + 7000;
  setAction("play", 1400, true);
});

stage.addEventListener("dblclick", (event) => {
  if (!event.target.closest(".pet-menu")) window.petdesk.openPanel();
});
stage.addEventListener("click", (event) => {
  if (event.target.closest(".pet-menu")) return;
  if (Date.now() < suppressClickUntil) return;
  const now = Date.now();
  if (now - lastTap < 360) return;
  lastTap = now;
  showReactionBurst();
  setAction("pet", 1800);
});
stage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (dragState?.moved) return;
  menu.classList.toggle("show");
});
menu.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  menu.classList.remove("show");
  if (button.dataset.open !== undefined) window.petdesk.openPanel();
  else if (button.dataset.hide !== undefined) window.petdesk.setPetVisibility(false);
  else if (button.dataset.random !== undefined) {
    const choices = ["pet", "play", "stretch", "walk", "celebrate"];
    const next = choices[Math.floor(Math.random() * choices.length)];
    showReactionBurst();
    setAction(next);
  }
  else if (button.dataset.chat !== undefined) {
    const choices = contextualLines("idle");
    const next = choices.filter((line) => line !== lastLine);
    lastLine = next[Math.floor(Math.random() * next.length)] || choices[0];
    speak(lastLine, 5200);
    setAction("idle", 2400, true);
  }
  else setAction(button.dataset.action, button.dataset.action === "study" ? 12_000 : actionPatterns.actionDuration(button.dataset.action));
});
window.addEventListener("click", (event) => {
  if (!event.target.closest(".pet-menu")) menu.classList.remove("show");
});

window.petdesk.getState().then(useState);
window.petdesk.onState(useState);
window.petdesk.onPetAction((command) => {
  if (typeof command === "string") setAction(command);
  else if (command?.action) setAction(command.action, command.durationMs, command.silent);
});
window.petdesk.onPetSpeak(({ text, action: next }) => {
  if (next) setAction(next);
  speak(text, 5600);
});
setInterval(async () => {
  if (action !== "idle" || state?.focus?.running || document.hidden || dragState || menu.classList.contains("show")) return;
  const frequency = state?.settings?.interactionFrequency || "normal";
  const actionChance = { quiet: 0.12, normal: 0.28, chatty: 0.48 }[frequency];
  if (Math.random() > actionChance) return;
  const choices = ["walk", "stretch", "play", "idle", "idle"];
  const next = choices[Math.floor(Math.random() * choices.length)];
  if (next === "walk") {
    const distance = Math.random() > 0.5 ? 100 + Math.random() * 80 : -(100 + Math.random() * 80);
    setAction("walk", 2600, true);
    await window.petdesk.roamPet(distance);
  } else if (next !== "idle") {
    setAction(next, 2600, frequency === "quiet");
  } else if (frequency === "chatty" || Math.random() > 0.6) {
    const choicesForIdle = contextualLines("idle").filter((line) => line !== lastLine);
    lastLine = choicesForIdle[Math.floor(Math.random() * choicesForIdle.length)] || lines.idle[0];
    speak(lastLine);
  }
}, 30_000);
requestAnimationFrame(frame);
