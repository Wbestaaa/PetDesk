const { PNG } = require("pngjs");

const DEFAULT_AI_CONFIG = Object.freeze({
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
});

const ACTION_PACK_ACTIONS = Object.freeze([
  "idle",
  "walk",
  "pet",
  "stretch",
  "play",
  "study",
  "sleep",
  "celebrate",
  "alert",
]);

const ACTION_LABELS = Object.freeze({
  idle: "待机",
  walk: "行走",
  pet: "被抚摸",
  stretch: "伸展",
  play: "玩耍",
  study: "读书",
  sleep: "睡觉",
  celebrate: "庆祝",
  alert: "提醒",
});

const STYLE_PROMPTS = Object.freeze({
  pixel: "crisp high-quality pixel-art illustration, readable silhouette, controlled palette, deliberate hard-edged pixels",
  chibi: "polished cute chibi illustration, large expressive head, compact but anatomically readable body, clean silhouette",
  realistic: "polished semi-realistic desktop companion illustration, friendly expression, clear full-body silhouette",
  watercolor: "soft hand-painted watercolor desktop companion illustration, clean full-body silhouette and gentle colors",
});

function normalizeAiBaseUrl(value) {
  const raw = String(value || DEFAULT_AI_CONFIG.baseUrl).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API URL 格式无效，请输入完整地址，例如 https://api.openai.com/v1");
  }
  const localhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) {
    throw new Error("远程 API 必须使用 HTTPS；只有本机 localhost 可以使用 HTTP");
  }
  if (url.username || url.password) throw new Error("请不要把 API Key 写在 URL 中");
  if (url.search || url.hash) throw new Error("API URL 不能包含查询参数或锚点");
  url.pathname = url.pathname.replace(/\/images\/edits\/?$/, "");
  if (url.origin === "https://api.openai.com" && (url.pathname === "/" || !url.pathname)) {
    url.pathname = "/v1";
  }
  return url.toString().replace(/\/+$/, "");
}

function normalizeAiModel(value) {
  const model = String(value || DEFAULT_AI_CONFIG.model).trim();
  if (!model || model.length > 120 || /[\r\n]/.test(model)) throw new Error("模型名称无效");
  return model;
}

function buildApiUrl(baseUrl, resource) {
  return `${normalizeAiBaseUrl(baseUrl)}/${String(resource || "").replace(/^\/+/, "")}`;
}

function publicAiConfig(stored = {}, environmentKey = "") {
  return {
    baseUrl: normalizeAiBaseUrl(stored.baseUrl || DEFAULT_AI_CONFIG.baseUrl),
    model: normalizeAiModel(stored.model || DEFAULT_AI_CONFIG.model),
    configured: Boolean(stored.encryptedApiKey || environmentKey),
    source: stored.encryptedApiKey ? "app" : environmentKey ? "environment" : "none",
  };
}

function stylePrompt(style) {
  return STYLE_PROMPTS[style] || STYLE_PROMPTS.chibi;
}

function subjectPrompt(subjectType) {
  if (subjectType === "human") {
    return "The subject is a human and must remain unmistakably human: preserve their face, hairstyle, clothing, hands and legs; never add animal ears, muzzle, paws, fur or tail.";
  }
  if (subjectType === "animal") {
    return "The subject is an animal: preserve its species, markings, face shape and defining accessories.";
  }
  return "Preserve the source subject's exact species, identity, face, hairstyle or fur markings, clothing and defining accessories. Never change a human into an animal or an animal into a human.";
}

function buildPreviewPrompt({ style, description, subjectType } = {}) {
  return [
    `Cartoonize the source as a ${stylePrompt(style)}.`,
    subjectPrompt(subjectType),
    "Show one complete centered character with comfortable margins on a plain, easily removable background.",
    String(description || "").trim(),
  ].filter(Boolean).join(" ");
}

function buildActionPackPrompt({ name, style, description, subjectType } = {}) {
  const actionOrder = ACTION_PACK_ACTIONS
    .map((action, index) => `${index + 1}. ${action} (${ACTION_LABELS[action]})`)
    .join("; ");
  return [
    `Create a production-ready 3 by 3 desktop companion action sheet for ${String(name || "the character").trim()}.`,
    `Use a ${stylePrompt(style)}.`,
    subjectPrompt(subjectType),
    "The SAME single character must appear consistently in all nine cells, with identical face, hair or markings, outfit, palette, proportions and accessories.",
    `Cell order is strictly left-to-right, top-to-bottom: ${actionOrder}.`,
    "Every cell must clearly communicate its assigned pose. Show the complete character inside each cell with generous empty margins; do not crop the head, hands, feet or key accessories.",
    "Use a perfectly flat solid chroma-green (#00FF66) background in every cell. Do not add scenery, floor, shadows, text, captions, labels, borders, grid lines, extra characters or duplicated body parts.",
    String(description || "").trim(),
  ].filter(Boolean).join(" ");
}

function actionGridRects(width, height) {
  const safeWidth = Math.max(3, Math.floor(Number(width) || 0));
  const safeHeight = Math.max(3, Math.floor(Number(height) || 0));
  return ACTION_PACK_ACTIONS.map((action, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = Math.round((column * safeWidth) / 3);
    const y = Math.round((row * safeHeight) / 3);
    const right = Math.round(((column + 1) * safeWidth) / 3);
    const bottom = Math.round(((row + 1) * safeHeight) / 3);
    return { action, x, y, width: right - x, height: bottom - y };
  });
}

function borderBackgroundColor(png) {
  const histogram = new Map();
  const add = (x, y) => {
    const index = (y * png.width + x) * 4;
    if (png.data[index + 3] < 100) return;
    const bucket = [
      Math.round(png.data[index] / 24) * 24,
      Math.round(png.data[index + 1] / 24) * 24,
      Math.round(png.data[index + 2] / 24) * 24,
    ];
    const key = bucket.join(",");
    histogram.set(key, (histogram.get(key) || 0) + 1);
  };
  for (let x = 0; x < png.width; x += 1) {
    add(x, 0);
    add(x, png.height - 1);
  }
  for (let y = 1; y < png.height - 1; y += 1) {
    add(0, y);
    add(png.width - 1, y);
  }
  const winner = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner ? winner[0].split(",").map(Number) : null;
}

function removeConnectedBackground(buffer, tolerance = 92) {
  const png = PNG.sync.read(buffer);
  const background = borderBackgroundColor(png);
  if (!background) return buffer;
  const total = png.width * png.height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const canRemove = (pixel) => {
    const offset = pixel * 4;
    const alpha = png.data[offset + 3];
    if (alpha < 24) return true;
    const red = png.data[offset];
    const green = png.data[offset + 1];
    const blue = png.data[offset + 2];
    const distance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
    const chromaGreen = green > 115 && green > red * 1.22 && green > blue * 1.12;
    return distance <= tolerance || chromaGreen;
  };
  const enqueue = (pixel) => {
    if (pixel < 0 || pixel >= total || visited[pixel] || !canRemove(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < png.width; x += 1) {
    enqueue(x);
    enqueue((png.height - 1) * png.width + x);
  }
  for (let y = 1; y < png.height - 1; y += 1) {
    enqueue(y * png.width);
    enqueue(y * png.width + png.width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const offset = pixel * 4;
    png.data[offset] = 0;
    png.data[offset + 1] = 0;
    png.data[offset + 2] = 0;
    png.data[offset + 3] = 0;
    const x = pixel % png.width;
    if (x > 0) enqueue(pixel - 1);
    if (x < png.width - 1) enqueue(pixel + 1);
    enqueue(pixel - png.width);
    enqueue(pixel + png.width);
  }
  return PNG.sync.write(png);
}

module.exports = {
  ACTION_LABELS,
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
};
