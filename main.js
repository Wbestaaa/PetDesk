const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  Notification,
  screen,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_STATE,
  applyCompanionReward,
  clampFocusMinutes,
  normalizeState,
  nextDueAlarm,
} = require("./src/state");
const { normalizeLocation, parseForecast } = require("./src/weather");

let petWindow;
let panelWindow;
let tray;
let appState;
let statePath;
let scheduler;
const rewardCooldowns = new Map();

const REWARD_COOLDOWN_MS = Object.freeze({
  pet: 1800,
  play: 6000,
  stretch: 8000,
  drag: 10000,
  random: 6000,
  todo: 0,
  habit: 0,
  focus: 0,
});
let petDragging = false;
let dragOffset = { x: 0, y: 0 };
let positionPersistTimer;
let roamTimer;

const isDev = process.argv.includes("--dev");
const launchHidden = process.argv.includes("--hidden");

function loadState() {
  statePath = path.join(app.getPath("userData"), "petdesk-state.json");
  try {
    appState = normalizeState(JSON.parse(fs.readFileSync(statePath, "utf8")));
  } catch {
    appState = structuredClone(DEFAULT_STATE);
  }
}

function persistState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(appState, null, 2), "utf8");
}

function broadcastState() {
  for (const win of [petWindow, panelWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", appState);
  }
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开控制中心", click: createPanelWindow },
      {
        label: appState.runtime.petVisible ? "隐藏桌宠" : "显示桌宠",
        click: () => setPetVisibility(!appState.runtime.petVisible),
      },
      { type: "separator" },
      { label: "开始 25 分钟专注", click: () => startFocus(25 * 60) },
      { label: "让桌宠休息", click: () => petWindow?.webContents.send("pet:action", "sleep") },
      { type: "separator" },
      {
        label: "退出 PetDesk",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function setPetVisibility(visible) {
  const nextVisible = Boolean(visible);
  appState.runtime.petVisible = nextVisible;
  persistState();
  if (petWindow && !petWindow.isDestroyed()) {
    if (nextVisible) petWindow.showInactive();
    else petWindow.hide();
  }
  refreshTrayMenu();
  broadcastState();
  return nextVisible;
}

function updateState(updater) {
  const updated = typeof updater === "function" ? updater(structuredClone(appState)) : updater;
  appState = normalizeState(updated);
  persistState();
  applyWindowSettings();
  scheduleNextAlarm();
  broadcastState();
  return appState;
}

function rewardCompanion(reason) {
  if (!Object.hasOwn(REWARD_COOLDOWN_MS, reason)) {
    return { awarded: false, points: 0, reason };
  }
  const now = Date.now();
  const previousAt = rewardCooldowns.get(reason) || 0;
  const cooldown = REWARD_COOLDOWN_MS[reason];
  if (cooldown && now - previousAt < cooldown) {
    return { awarded: false, points: 0, reason, cooldownRemaining: cooldown - (now - previousAt) };
  }
  rewardCooldowns.set(reason, now);
  let reward;
  updateState((state) => {
    const result = applyCompanionReward(state.companion, reason, new Date(now));
    state.companion = result.companion;
    if (["pet", "play", "stretch", "drag", "random"].includes(reason)) {
      state.stats.interactions += 1;
    }
    reward = result.reward;
    return state;
  });
  petWindow?.webContents.send("pet:rewarded", reward);
  if (reward?.leveledUp) {
    petWindow?.webContents.send("pet:speak", {
      text: `我们的默契升到 ${reward.level} 级啦，谢谢你一直陪着我。`,
      action: "celebrate",
    });
  }
  return reward;
}

function petBounds() {
  const display = screen.getPrimaryDisplay().workArea;
  const size = Math.round(260 * appState.settings.petScale);
  const saved = appState.runtime.petPosition;
  return {
    width: size,
    height: size,
    x: Number.isFinite(saved?.x) ? saved.x : display.x + display.width - size - 28,
    y: Number.isFinite(saved?.y) ? saved.y : display.y + display.height - size - 18,
  };
}

function clampPetPosition(x, y) {
  const point = { x: Math.round(x), y: Math.round(y) };
  const area = screen.getDisplayNearestPoint(point).workArea;
  const [width, height] = petWindow?.getSize() || [260, 260];
  return {
    x: Math.min(area.x + area.width - width, Math.max(area.x, point.x)),
    y: Math.min(area.y + area.height - height, Math.max(area.y, point.y)),
  };
}

function rememberPetPosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  clearTimeout(positionPersistTimer);
  positionPersistTimer = setTimeout(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    appState.runtime.petPosition = { x, y };
    persistState();
  }, 180);
}

function animatePetRoam(distance = 120) {
  if (!appState.settings.autonomousRoaming || petDragging || !petWindow?.isVisible()) return false;
  clearInterval(roamTimer);
  const [startX, startY] = petWindow.getPosition();
  const target = clampPetPosition(startX + Math.max(-220, Math.min(220, Number(distance) || 120)), startY);
  const frames = 28;
  let frame = 0;
  roamTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || petDragging) {
      clearInterval(roamTimer);
      return;
    }
    frame += 1;
    const progress = frame / frames;
    const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
    petWindow.setPosition(Math.round(startX + (target.x - startX) * eased), target.y, false);
    if (frame >= frames) {
      clearInterval(roamTimer);
      rememberPetPosition();
    }
  }, 24);
  return true;
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    ...petBounds(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: appState.settings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWindow.setAlwaysOnTop(appState.settings.alwaysOnTop, "floating");
  petWindow.loadFile(path.join(__dirname, "src", "pet.html"));
  petWindow.once("ready-to-show", () => {
    if (appState.runtime.petVisible !== false) petWindow.showInactive();
  });
  petWindow.on("moved", rememberPetPosition);
  petWindow.on("closed", () => {
    petWindow = null;
  });
  if (isDev) petWindow.webContents.openDevTools({ mode: "detach" });
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show();
    panelWindow.focus();
    return;
  }
  panelWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 640,
    title: "PetDesk",
    backgroundColor: "#f4f2ec",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWindow.loadFile(path.join(__dirname, "src", "panel.html"));
  panelWindow.once("ready-to-show", () => panelWindow.show());
  panelWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      panelWindow.hide();
    }
  });
  if (isDev) panelWindow.webContents.openDevTools({ mode: "detach" });
}

function trayIcon() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" rx="18" fill="#24332d"/>
    <path d="M18 25L15 11l14 9h6l14-9-3 14c5 4 8 10 8 16 0 12-9 18-22 18S10 53 10 41c0-6 3-12 8-16z" fill="#F2A65A"/>
    <circle cx="25" cy="37" r="3" fill="#24332d"/><circle cx="41" cy="37" r="3" fill="#24332d"/>
    <path d="M29 45q4 4 8 0" stroke="#24332d" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function createTray() {
  tray = new Tray(trayIcon().resize({ width: 20, height: 20 }));
  tray.setToolTip("PetDesk · 左键恢复桌宠 / 打开控制中心");
  refreshTrayMenu();
  tray.on("click", () => {
    if (!appState.runtime.petVisible) setPetVisibility(true);
    else createPanelWindow();
  });
  tray.on("right-click", refreshTrayMenu);
}

function applyWindowSettings() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petBounds();
  petWindow.setAlwaysOnTop(appState.settings.alwaysOnTop, "floating");
  petWindow.setSize(bounds.width, bounds.height);
  petWindow.setIgnoreMouseEvents(Boolean(appState.settings.clickThrough), { forward: true });
}

function notify(title, body, action = "celebrate") {
  if (Notification.isSupported()) new Notification({ title, body, silent: !appState.settings.sound }).show();
  petWindow?.webContents.send("pet:speak", { text: body, action });
}

function scheduleNextAlarm() {
  clearTimeout(scheduler);
  const due = nextDueAlarm(appState.alarms, new Date());
  if (!due) return;
  const delay = Math.max(250, due.at.getTime() - Date.now());
  scheduler = setTimeout(() => {
    notify(due.alarm.label || "PetDesk 提醒", due.alarm.note || "时间到了，休息一下吧。", "alert");
    if (!due.alarm.repeat) {
      updateState((state) => {
        const alarm = state.alarms.find((item) => item.id === due.alarm.id);
        if (alarm) alarm.enabled = false;
        return state;
      });
    } else {
      scheduleNextAlarm();
    }
  }, Math.min(delay, 2_147_000_000));
}

function startFocus(seconds) {
  const safeSeconds = clampFocusMinutes(Number(seconds) / 60) * 60;
  const now = Date.now();
  updateState((state) => {
    state.focus.running = true;
    state.focus.startedAt = now;
    state.focus.endsAt = now + safeSeconds * 1000;
    state.focus.duration = safeSeconds;
    state.focus.remaining = safeSeconds;
    return state;
  });
  petWindow?.webContents.send("pet:action", { action: "study", durationMs: safeSeconds * 1000 });
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": `PetDesk/${app.getVersion()}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.reason || `天气服务请求失败 (${response.status})`);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("天气服务响应超时，请稍后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadWeather(query) {
  let location = appState.weather.location;
  if (String(query || "").trim()) {
    const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodingUrl.search = new URLSearchParams({
      name: String(query).trim(),
      count: "1",
      language: "zh",
      format: "json",
    }).toString();
    const geocoding = await fetchJson(geocodingUrl);
    if (!geocoding.results?.length) throw new Error("没有找到这个城市，请尝试输入城市全名");
    location = normalizeLocation(geocoding.results[0]);
  }
  if (!location) throw new Error("请先输入城市");

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "4",
  }).toString();
  const forecast = parseForecast(await fetchJson(forecastUrl), location);
  updateState((state) => {
    state.weather = forecast;
    return state;
  });
  const weatherReaction = forecast.current;
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherReaction.weatherCode)) {
    petWindow?.webContents.send("pet:speak", {
      text: `${location.name}正在下雨，出门记得带伞，路上慢一点。`,
      action: "alert",
    });
  } else if ([0, 1].includes(weatherReaction.weatherCode) && weatherReaction.isDay) {
    petWindow?.webContents.send("pet:speak", {
      text: `${location.name}天气不错，完成一小段后可以看看远处。`,
      action: "celebrate",
    });
  }
  return forecast;
}

function registerIpc() {
  ipcMain.handle("state:get", () => appState);
  ipcMain.handle("state:replace", (_, state) => updateState(state));
  ipcMain.handle("panel:open", () => createPanelWindow());
  ipcMain.handle("pet:menu", () => createPanelWindow());
  ipcMain.handle("pet:action", (_, action) => petWindow?.webContents.send("pet:action", action));
  ipcMain.handle("pet:reward", (_, reason) => rewardCompanion(String(reason || "")));
  ipcMain.on("pet:drag", (_, payload = {}) => {
    if (!petWindow || petWindow.isDestroyed() || appState.settings.clickThrough) return;
    if (payload.phase === "start") {
      clearInterval(roamTimer);
      petDragging = true;
      const [windowX, windowY] = petWindow.getPosition();
      dragOffset = { x: Number(payload.screenX) - windowX, y: Number(payload.screenY) - windowY };
      return;
    }
    if (payload.phase === "move" && petDragging) {
      const target = clampPetPosition(Number(payload.screenX) - dragOffset.x, Number(payload.screenY) - dragOffset.y);
      petWindow.setPosition(target.x, target.y, false);
      return;
    }
    if (payload.phase === "end") {
      petDragging = false;
      rememberPetPosition();
    }
  });
  ipcMain.handle("pet:roam", (_, distance) => animatePetRoam(distance));
  ipcMain.handle("pet:visibility", (_, visible) => setPetVisibility(visible));
  ipcMain.handle("pet:toggle", () => setPetVisibility(!appState.runtime.petVisible));
  ipcMain.handle("app:quit", () => {
    app.isQuitting = true;
    app.quit();
  });
  ipcMain.handle("focus:start", (_, seconds) => startFocus(seconds));
  ipcMain.handle("focus:pause", () => {
    const result = updateState((state) => {
      if (state.focus.running) {
        state.focus.remaining = Math.max(0, Math.round((state.focus.endsAt - Date.now()) / 1000));
      }
      state.focus.running = false;
      state.focus.endsAt = null;
      return state;
    });
    petWindow?.webContents.send("pet:action", { action: "idle", silent: true });
    return result;
  });
  ipcMain.handle("focus:complete", () => {
    updateState((state) => {
      state.focus.running = false;
      state.focus.endsAt = null;
      state.focus.remaining = state.focus.duration;
      state.focus.sessions += 1;
      state.focus.totalMinutes += Math.round(state.focus.duration / 60);
      return state;
    });
    rewardCompanion("focus");
    notify("专注完成", "做得很好！起来活动一下吧。", "celebrate");
  });
  ipcMain.handle("image:pick", async () => {
    const result = await dialog.showOpenDialog(panelWindow, {
      title: "选择宠物图片",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).slice(1).replace("jpg", "jpeg");
    return {
      name: path.basename(filePath),
      path: filePath,
      dataUrl: `data:image/${ext};base64,${fs.readFileSync(filePath).toString("base64")}`,
    };
  });
  ipcMain.handle("image:save-custom", (_, { dataUrl, name, style }) => {
    const matches = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!matches) throw new Error("仅支持 PNG 数据");
    const folder = path.join(app.getPath("userData"), "pets");
    fs.mkdirSync(folder, { recursive: true });
    const id = `pet-${Date.now()}`;
    const filePath = path.join(folder, `${id}.png`);
    fs.writeFileSync(filePath, Buffer.from(matches[1], "base64"));
    updateState((state) => {
      state.customPets.push({ id, name: name || "我的桌宠", style, imagePath: filePath, dataUrl });
      state.settings.activePet = id;
      return state;
    });
    return { id, filePath };
  });
  ipcMain.handle("image:ai-transform", async (_, { sourcePath, style, description }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("未检测到 OPENAI_API_KEY。请先在 Windows 环境变量中配置后重启 PetDesk。");
    const prompts = {
      chibi: "Cartoonize the subject as a polished cute chibi desktop-pet illustration with a large expressive head, compact body, clean silhouette and plain neutral background. Preserve the subject's identity, species, facial features, hair, clothing and key accessories. A human subject must remain unmistakably human with human anatomy and no animal ears, paws, tail, muzzle or fur.",
      realistic: "Transform the subject into a charming realistic desktop-pet portrait, preserving identity and key markings, centered with a clean plain background.",
      watercolor: "Transform the subject into a soft hand-painted watercolor desktop-pet illustration, clean silhouette, centered, plain background.",
    };
    const body = new FormData();
    body.set("model", "gpt-image-1.5");
    body.set("prompt", `${prompts[style] || prompts.chibi} ${description || ""}`.trim());
    body.set("size", "1024x1024");
    body.set("image", new Blob([fs.readFileSync(sourcePath)]), path.basename(sourcePath));
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "AI 图片转换失败");
    const base64 = payload.data?.[0]?.b64_json;
    if (!base64) throw new Error("AI 图片结果为空");
    return `data:image/png;base64,${base64}`;
  });
  ipcMain.handle("settings:startup", (_, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ["--hidden"] });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle("weather:load", (_, query) => loadWeather(query));
}

app.whenReady().then(() => {
  loadState();
  registerIpc();
  createPetWindow();
  if (!launchHidden) createPanelWindow();
  createTray();
  scheduleNextAlarm();
  app.on("activate", createPanelWindow);
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {});
