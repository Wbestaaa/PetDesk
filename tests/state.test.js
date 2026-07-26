const assert = require("node:assert/strict");
const { normalizeState, nextDueAlarm } = require("../src/state");

const normalized = normalizeState({ settings: { petName: "Test" }, todos: [] });
assert.equal(normalized.settings.petName, "Test");
assert.equal(normalized.settings.alwaysOnTop, true);
assert.deepEqual(normalized.todos, []);

const now = new Date(2026, 6, 26, 10, 0, 0);
const due = nextDueAlarm(
  [
    { id: "late", enabled: true, datetime: new Date(2026, 6, 26, 15, 0).toISOString() },
    { id: "early", enabled: true, datetime: new Date(2026, 6, 26, 11, 0).toISOString() },
    { id: "off", enabled: false, datetime: new Date(2026, 6, 26, 10, 30).toISOString() },
  ],
  now
);
assert.equal(due.alarm.id, "early");

const repeating = nextDueAlarm([{ id: "daily", enabled: true, time: "09:30", repeat: true }], now);
assert.equal(repeating.at.getDate(), 27);

console.log("state tests passed");
