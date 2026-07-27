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
  safeStorage,
  shell,
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
const {
  ACTION_PACK_ACTIONS,
  DEFAULT_AI_CONFIG,
  actionGridRects,
  buildActionPackPrompt,
  buildApiUrl,
  buildPreviewPrompt,
  normalizeAiBaseUrl,
  normalizeAiModel,
  publicAiConfig,
  removeConnectedBackground,
} = require("./src/ai-config");

let petWindow;
let panelWindow;
let tray;
let appState;
let statePath;
let aiConfigPath;
let storedAiConfig = {};
let scheduler;
const rewardCooldowns = new Map();
const approvedImagePaths = new Set();
let actionPackGenerationBusy = false;

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

function loadAiConfig() {
  aiConfigPath = path.join(app.getPath("userData"), "petdesk-ai-config.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(aiConfigPath, "utf8"));
    storedAiConfig = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    storedAiConfig = {};
  }
}

function persistAiConfig() {
  fs.mkdirSync(path.dirname(aiConfigPath), { recursive: true });
  const temporaryPath = `${aiConfigPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(storedAiConfig, null, 2), "utf8");
  fs.renameSync(temporaryPath, aiConfigPath);
}

async function encryptApiKey(apiKey) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("系统安全存储暂不可用，无法安全保存 API Key");
  }
  return (await safeStorage.encryptStringAsync(apiKey)).toString("base64");
}

async function decryptApiKey(encryptedApiKey) {
  if (!encryptedApiKey) return "";
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("系统安全存储暂不可用，无法读取已保存的 API Key");
  }
  const result = await safeStorage.decryptStringAsync(Buffer.from(encryptedApiKey, "base64"));
  if (result.shouldReEncrypt) {
    storedAiConfig.encryptedApiKey = await encryptApiKey(result.result);
    persistAiConfig();
  }
  return result.result;
}

async function getResolvedAiConfig() {
  const baseUrl = normalizeAiBaseUrl(storedAiConfig.baseUrl || DEFAULT_AI_CONFIG.baseUrl);
  const model = normalizeAiModel(storedAiConfig.model || DEFAULT_AI_CONFIG.model);
  const apiKey = storedAiConfig.encryptedApiKey
    ? await decryptApiKey(storedAiConfig.encryptedApiKey)
    : String(process.env.OPENAI_API_KEY || "").trim();
  return { baseUrl, model, apiKey };
}

function getPublicAiConfig() {
  return {
    ...publicAiConfig(storedAiConfig, process.env.OPENAI_API_KEY),
    storageProtected: Boolean(storedAiConfig.encryptedApiKey),
  };
}

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

async function fetchApi(url, options = {}, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI 服务响应超时，请检查网络或稍后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function responsePayload(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 300) || `HTTP ${response.status}` } };
  }
}

function aiErrorMessage(response, payload) {
  const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) return `API Key 无效或没有图片权限：${detail}`;
  if (response.status === 404) return `API URL 或模型不受支持：${detail}`;
  if (response.status === 429) return `AI 服务额度或频率已达上限：${detail}`;
  return `AI 图片生成失败：${detail}`;
}

function sourceMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  }[extension] || "application/octet-stream";
}

function assertApprovedImagePath(sourcePath) {
  const resolved = path.resolve(String(sourcePath || ""));
  if (!approvedImagePaths.has(resolved) || !fs.existsSync(resolved)) {
    throw new Error("请重新通过“选择图片”按钮载入原图");
  }
  return resolved;
}

async function requestAiImage({ sourcePath, prompt }) {
  const config = await getResolvedAiConfig();
  if (!config.apiKey) throw new Error("请先在“设置 → AI 图片服务”中填写并保存 API Key");
  const body = new FormData();
  body.set("model", config.model);
  body.set("prompt", prompt);
  body.set("size", "1024x1024");
  body.set(
    "image",
    new Blob([fs.readFileSync(sourcePath)], { type: sourceMimeType(sourcePath) }),
    path.basename(sourcePath)
  );
  const response = await fetchApi(buildApiUrl(config.baseUrl, "images/edits"), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body,
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw new Error(aiErrorMessage(response, payload));
  const result = payload.data?.[0];
  if (result?.b64_json) return Buffer.from(result.b64_json, "base64");
  if (result?.url) {
    const imageUrl = new URL(result.url);
    if (imageUrl.protocol !== "https:") throw new Error("AI 服务返回了不安全的图片地址");
    const imageResponse = await fetchApi(imageUrl, {}, 60_000);
    if (!imageResponse.ok) throw new Error(`无法下载 AI 图片结果 (${imageResponse.status})`);
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("AI 图片结果为空");
}

function emitActionPackProgress(stage, progress, message) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send("image:action-pack-progress", { stage, progress, message });
  }
}

function customActionManifest({ id, name, subjectType }) {
  const actions = Object.fromEntries(ACTION_PACK_ACTIONS.map((action) => [action, `actions/${action}.png`]));
  return {
    schemaVersion: 1,
    id,
    name,
    kind: "custom-action-art",
    character: { species: subjectType === "human" ? "human" : subjectType === "animal" ? "animal" : "unknown" },
    actions,
    fallbacks: {
      blink: "idle",
      run: "walk",
      jump: "celebrate",
      feed: "play",
      drink: "play",
      write: "study",
      type: "study",
      nap: "sleep",
      yawn: "sleep",
      dance: "celebrate",
      happy: "celebrate",
      alarm: "alert",
      surprised: "alert",
    },
    speech: {
      idle: ["我已经准备好陪你啦。", "先完成最小的一步，我们慢慢来。"],
      pet: ["收到你的摸摸，今天也一起加油。", "谢谢你，我会好好陪着你的。"],
      walk: ["换个位置，也换换心情。"],
      stretch: ["一起伸个懒腰，放松一下肩膀。"],
      play: ["短暂玩一会儿，再继续前进。"],
      study: ["我会安静陪你完成这一小段。"],
      sleep: ["先休息一下，补充能量。"],
      celebrate: ["完成啦，这一步值得庆祝！"],
      alert: ["时间到啦，来看看你的提醒。"],
    },
  };
}

function customPetDataUrl(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

async function createActionPack({ sourcePath, name, style, description, subjectType }) {
  const safeSourcePath = assertApprovedImagePath(sourcePath);
  if (actionPackGenerationBusy) throw new Error("已有一套动作正在生成，请等待完成");
  actionPackGenerationBusy = true;
  const petName = String(name || "我的伙伴").trim().slice(0, 20) || "我的伙伴";
  const id = `pet-${Date.now()}`;
  const folderPath = path.join(app.getPath("userData"), "pets", id);
  try {
    emitActionPackProgress("prepare", 8, "正在整理角色特征与九个动作");
    const prompt = buildActionPackPrompt({ name: petName, style, description, subjectType });
    emitActionPackProgress("generate", 18, "AI 正在绘制统一角色动作表");
    const sheetBuffer = await requestAiImage({ sourcePath: safeSourcePath, prompt });
    const sheet = nativeImage.createFromBuffer(sheetBuffer);
    if (sheet.isEmpty()) throw new Error("AI 返回的图片无法读取");
    const size = sheet.getSize();
    if (size.width < 600 || size.height < 600) throw new Error("AI 返回的动作表分辨率过低");

    const actionsFolder = path.join(folderPath, "actions");
    fs.mkdirSync(actionsFolder, { recursive: true });
    const rects = actionGridRects(size.width, size.height);
    for (let index = 0; index < rects.length; index += 1) {
      const { action, x, y, width, height } = rects[index];
      emitActionPackProgress(
        "process",
        44 + Math.round((index / rects.length) * 40),
        `正在切分并透明化：${action}（${index + 1}/9）`
      );
      const tile = sheet.crop({ x, y, width, height }).resize({ width: 512, height: 512, quality: "best" });
      if (tile.isEmpty()) throw new Error(`动作 ${action} 切分失败`);
      const cleaned = removeConnectedBackground(tile.toPNG());
      fs.writeFileSync(path.join(actionsFolder, `${action}.png`), cleaned);
    }
    const manifest = customActionManifest({ id, name: petName, subjectType });
    fs.writeFileSync(path.join(folderPath, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    const idlePath = path.join(actionsFolder, "idle.png");
    const record = {
      id,
      name: petName,
      style,
      subjectType,
      kind: "action-art",
      folderPath,
      imagePath: idlePath,
      dataUrl: customPetDataUrl(idlePath),
      manifest,
    };
    emitActionPackProgress("save", 92, "正在保存九动作并接入桌宠系统");
    updateState((next) => {
      next.customPets.push(record);
      next.settings.activePet = id;
      next.settings.petName = petName;
      next.settings.petType = subjectType === "human" ? "human" : "custom";
      return next;
    });
    emitActionPackProgress("complete", 100, "九动作桌宠已生成并启用");
    return { id, name: petName, actions: ACTION_PACK_ACTIONS };
  } catch (error) {
    if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
    emitActionPackProgress("error", 0, error.message || "九动作生成失败");
    throw error;
  } finally {
    actionPackGenerationBusy = false;
  }
}

async function deleteCustomPet(id) {
  const record = appState.customPets.find((pet) => pet.id === id);
  if (!record) throw new Error("没有找到这个自定义桌宠");
  const response = panelWindow && !panelWindow.isDestroyed()
    ? await dialog.showMessageBox(panelWindow, {
      type: "warning",
      title: "删除自定义桌宠",
      message: `确定删除“${record.name || "我的桌宠"}”吗？`,
      detail: "图片与动作素材会移入 Windows 回收站，之后仍可恢复。",
      buttons: ["取消", "移入回收站"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    : { response: 0 };
  if (response.response !== 1) return { deleted: false };

  const petsRoot = path.resolve(app.getPath("userData"), "pets");
  const target = path.resolve(record.folderPath || record.imagePath || "");
  if (!target.startsWith(`${petsRoot}${path.sep}`) || target === petsRoot) {
    throw new Error("自定义桌宠文件位置异常，已停止删除");
  }
  if (fs.existsSync(target)) await shell.trashItem(target);
  const wasActive = appState.settings.activePet === id;
  updateState((next) => {
    next.customPets = next.customPets.filter((pet) => pet.id !== id);
    if (wasActive) {
      next.settings.activePet = "momo";
      next.settings.petType = "cat";
      next.settings.petName = "桃桃";
    }
    return next;
  });
  return { deleted: true, activePet: appState.settings.activePet };
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
    const filePath = path.resolve(result.filePaths[0]);
    if (fs.statSync(filePath).size > 20 * 1024 * 1024) {
      throw new Error("图片不能超过 20 MB，请压缩后重试");
    }
    approvedImagePaths.add(filePath);
    const ext = path.extname(filePath).slice(1).replace("jpg", "jpeg");
    return {
      name: path.basename(filePath),
      path: filePath,
      dataUrl: `data:image/${ext};base64,${fs.readFileSync(filePath).toString("base64")}`,
    };
  });
  ipcMain.handle("image:save-custom", (_, { dataUrl, name, style, subjectType }) => {
    const matches = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!matches) throw new Error("仅支持 PNG 数据");
    const folder = path.join(app.getPath("userData"), "pets");
    fs.mkdirSync(folder, { recursive: true });
    const id = `pet-${Date.now()}`;
    const filePath = path.join(folder, `${id}.png`);
    const petName = String(name || "我的桌宠").trim().slice(0, 20) || "我的桌宠";
    fs.writeFileSync(filePath, Buffer.from(matches[1], "base64"));
    updateState((state) => {
      state.customPets.push({
        id,
        name: petName,
        style,
        subjectType,
        kind: "single-image",
        imagePath: filePath,
        dataUrl,
      });
      state.settings.activePet = id;
      state.settings.petName = petName;
      state.settings.petType = subjectType === "human" ? "human" : "custom";
      return state;
    });
    return { id, filePath };
  });
  ipcMain.handle("image:ai-transform", async (_, { sourcePath, style, description, subjectType }) => {
    const safeSourcePath = assertApprovedImagePath(sourcePath);
    const buffer = await requestAiImage({
      sourcePath: safeSourcePath,
      prompt: buildPreviewPrompt({ style, description, subjectType }),
    });
    return `data:image/png;base64,${buffer.toString("base64")}`;
  });
  ipcMain.handle("image:generate-action-pack", (_, payload) => createActionPack(payload || {}));
  ipcMain.handle("image:delete-custom", (_, id) => deleteCustomPet(String(id || "")));
  ipcMain.handle("image:get-custom-actions", (_, id) => {
    const record = appState.customPets.find((pet) => pet.id === id && pet.kind === "action-art");
    if (!record?.folderPath || !record.manifest?.actions) return null;
    const folder = path.resolve(record.folderPath);
    const sources = {};
    for (const [action, relative] of Object.entries(record.manifest.actions)) {
      const filePath = path.resolve(folder, relative);
      if (!filePath.startsWith(`${folder}${path.sep}`) || !fs.existsSync(filePath)) continue;
      sources[action] = customPetDataUrl(filePath);
    }
    return { manifest: record.manifest, sources };
  });
  ipcMain.handle("ai:get-config", () => getPublicAiConfig());
  ipcMain.handle("ai:save-config", async (_, input = {}) => {
    const baseUrl = normalizeAiBaseUrl(input.baseUrl);
    const model = normalizeAiModel(input.model);
    const apiKey = String(input.apiKey || "").trim();
    const next = {
      version: 1,
      baseUrl,
      model,
      encryptedApiKey: storedAiConfig.encryptedApiKey || "",
    };
    if (apiKey) next.encryptedApiKey = await encryptApiKey(apiKey);
    storedAiConfig = next;
    persistAiConfig();
    return getPublicAiConfig();
  });
  ipcMain.handle("ai:test-config", async () => {
    const config = await getResolvedAiConfig();
    if (!config.apiKey) throw new Error("请先填写并保存 API Key");
    const response = await fetchApi(buildApiUrl(config.baseUrl, "models"), {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    }, 20_000);
    const payload = await responsePayload(response);
    if (!response.ok) throw new Error(aiErrorMessage(response, payload));
    return { ok: true, message: `连接成功 · ${config.model}` };
  });
  ipcMain.handle("ai:clear-config", async () => {
    const response = panelWindow && !panelWindow.isDestroyed()
      ? await dialog.showMessageBox(panelWindow, {
        type: "question",
        title: "清除 AI 图片服务配置",
        message: "确定清除应用内保存的 API URL、模型和 API Key 吗？",
        detail: "这不会删除已经生成的桌宠素材。",
        buttons: ["取消", "清除配置"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      : { response: 0 };
    if (response.response !== 1) return { cleared: false, config: getPublicAiConfig() };
    storedAiConfig = {};
    if (aiConfigPath && fs.existsSync(aiConfigPath)) fs.unlinkSync(aiConfigPath);
    return { cleared: true, config: getPublicAiConfig() };
  });
  ipcMain.handle("settings:startup", (_, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ["--hidden"] });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle("weather:load", (_, query) => loadWeather(query));
}

app.whenReady().then(() => {
  loadState();
  loadAiConfig();
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
