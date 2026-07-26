const assert = require("node:assert/strict");
const {
  ACTION_PATTERN_V1,
  DIRECTIONS_16,
  actionDuration,
  actionGroup,
  directionFromVector,
} = require("../src/pet-actions");

assert.equal(Object.keys(ACTION_PATTERN_V1.groups).length, 9);
assert.equal(DIRECTIONS_16.length, 16);
assert.equal(new Set(DIRECTIONS_16).size, 16);
assert.equal(actionGroup("study"), "work");
assert.equal(actionGroup("celebrate"), "celebrate");
assert.equal(actionGroup("unknown-action"), "idle");
assert.equal(actionDuration("alert"), 5600);
assert.equal(directionFromVector(1, 0), "E");
assert.equal(directionFromVector(-1, 0), "W");
assert.equal(directionFromVector(0, -1), "N");
assert.equal(directionFromVector(0, 1), "S");

console.log("action pattern tests passed");
