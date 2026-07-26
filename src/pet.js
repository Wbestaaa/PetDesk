const canvas = document.querySelector("#pet");
const ctx = canvas.getContext("2d");
const bubble = document.querySelector("#bubble");
const menu = document.querySelector("#menu");
const customPet = document.querySelector("#customPet");
let state;
let action = "idle";
let actionUntil = 0;
let startedAt = performance.now();
let blinkAt = 0;
let pointer = { x: 260, y: 230 };
let bubbleTimer;
let lastTap = 0;
let customDataUrl = "";

const lines = {
  idle: ["今天也一起加油吧。", "需要我陪你专注吗？", "记得喝水～", "摸摸我会有惊喜。"],
  feed: ["好吃！能量满格。", "再来一块也不是不可以。"],
  play: ["抓到你啦！", "再玩一会儿嘛。"],
  study: ["我会安静陪着你。", "这一小段专注完成再休息。"],
  sleep: ["晚安……Zzz", "先充一会儿电。"],
  celebrate: ["完成啦，太棒了！", "今天又向前一步。"],
  alert: ["时间到啦！", "这是你设置的提醒哦。"],
  pet: ["呼噜呼噜～", "这里再摸一下。"],
};

function speak(text, duration = 3200) {
  clearTimeout(bubbleTimer);
  bubble.textContent = text;
  bubble.classList.add("show");
  bubbleTimer = setTimeout(() => bubble.classList.remove("show"), duration);
}

function setAction(next, duration = 4200) {
  action = next;
  actionUntil = performance.now() + duration;
  if (customDataUrl) customPet.className = `custom-pet ${next}`;
  if (lines[next]) speak(lines[next][Math.floor(Math.random() * lines[next].length)]);
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
  ctx.restore();
}

function frame(time) {
  if (!customDataUrl) drawMomo(time);
  if (time > actionUntil && action !== "idle") {
    action = "idle";
    customPet.className = "custom-pet idle";
  }
  if (!blinkAt || time > blinkAt + 180) blinkAt = time + 2200 + Math.random() * 3500;
  requestAnimationFrame(frame);
}

function useState(next) {
  state = next;
  const selected = state.customPets?.find((item) => item.id === state.settings.activePet);
  customDataUrl = selected?.dataUrl || "";
  customPet.src = customDataUrl;
  customPet.style.display = customDataUrl ? "block" : "none";
  canvas.style.display = customDataUrl ? "none" : "block";
}

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer = {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
});

document.querySelector("#stage").addEventListener("dblclick", () => window.petdesk.openPanel());
document.querySelector("#stage").addEventListener("click", () => {
  const now = Date.now();
  if (now - lastTap < 360) return;
  lastTap = now;
  setAction("pet", 1800);
});
document.querySelector("#stage").addEventListener("contextmenu", (event) => {
  event.preventDefault();
  menu.classList.toggle("show");
});
menu.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  menu.classList.remove("show");
  if (button.dataset.open !== undefined) window.petdesk.openPanel();
  else setAction(button.dataset.action);
});

window.petdesk.getState().then(useState);
window.petdesk.onState(useState);
window.petdesk.onPetAction((next) => setAction(next));
window.petdesk.onPetSpeak(({ text, action: next }) => {
  if (next) setAction(next);
  speak(text, 5600);
});
setInterval(() => {
  if (action !== "idle" || document.hidden) return;
  const choices = ["idle", "walk", "stretch", "idle", "idle"];
  const next = choices[Math.floor(Math.random() * choices.length)];
  if (next !== "idle") setAction(next, 3200);
  else if (Math.random() > 0.58) speak(lines.idle[Math.floor(Math.random() * lines.idle.length)]);
}, 9500);
requestAnimationFrame(frame);
