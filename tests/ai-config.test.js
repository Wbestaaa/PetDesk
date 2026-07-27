const assert = require("node:assert");
const { PNG } = require("pngjs");
const {
  ACTION_PACK_ACTIONS,
  actionGridRects,
  buildActionPackPrompt,
  buildApiUrl,
  normalizeAiBaseUrl,
  publicAiConfig,
  removeConnectedBackground,
} = require("../src/ai-config");

assert.equal(normalizeAiBaseUrl("https://api.openai.com"), "https://api.openai.com/v1");
assert.equal(normalizeAiBaseUrl("https://example.com/openai/v1/"), "https://example.com/openai/v1");
assert.equal(
  normalizeAiBaseUrl("https://example.com/openai/v1/images/edits"),
  "https://example.com/openai/v1"
);
assert.equal(normalizeAiBaseUrl("http://localhost:11434/v1"), "http://localhost:11434/v1");
assert.throws(() => normalizeAiBaseUrl("http://example.com/v1"), /HTTPS/);
assert.throws(() => normalizeAiBaseUrl("not a url"), /格式无效/);
assert.equal(
  buildApiUrl("https://api.openai.com/v1", "/images/edits"),
  "https://api.openai.com/v1/images/edits"
);

const publicConfig = publicAiConfig({
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
  encryptedApiKey: "ciphertext-that-must-not-leak",
});
assert.deepEqual(publicConfig, {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
  configured: true,
  source: "app",
});
assert.equal(JSON.stringify(publicConfig).includes("ciphertext"), false);

const rects = actionGridRects(1024, 1024);
assert.equal(rects.length, 9);
assert.deepEqual(rects.map((item) => item.action), ACTION_PACK_ACTIONS);
assert.equal(rects[0].x, 0);
assert.equal(rects[8].x + rects[8].width, 1024);
assert.equal(rects[8].y + rects[8].height, 1024);
assert.equal(rects.reduce((sum, item) => sum + item.width * item.height, 0), 1024 * 1024);

const prompt = buildActionPackPrompt({
  name: "毕业花花",
  style: "chibi",
  subjectType: "human",
  description: "保留长黑发、花饰学士帽和花束",
});
assert.match(prompt, /3 by 3/);
assert.match(prompt, /human/);
assert.match(prompt, /never add animal ears/);
assert.match(prompt, /idle/);
assert.match(prompt, /alert/);
assert.match(prompt, /#00FF66/);
assert.match(prompt, /长黑发/);

const source = new PNG({ width: 12, height: 12 });
for (let y = 0; y < source.height; y += 1) {
  for (let x = 0; x < source.width; x += 1) {
    const offset = (y * source.width + x) * 4;
    const character = x >= 4 && x <= 7 && y >= 3 && y <= 9;
    source.data[offset] = character ? 220 : 0;
    source.data[offset + 1] = character ? 45 : 255;
    source.data[offset + 2] = character ? 80 : 102;
    source.data[offset + 3] = 255;
  }
}
const cleaned = PNG.sync.read(removeConnectedBackground(PNG.sync.write(source)));
assert.equal(cleaned.data[3], 0);
assert.equal(cleaned.data[(6 * cleaned.width + 6) * 4 + 3], 255);

console.log("AI config and action-pack tests passed");
