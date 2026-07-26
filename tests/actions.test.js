const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ACTION_LINES,
  ACTION_PATTERN_V1,
  DIRECTIONS_16,
  actionDuration,
  actionGroup,
  directionFromVector,
} = require("../src/pet-actions");
const { BUILT_IN_PETS, findBuiltInPet, supportsActionArt } = require("../src/pet-catalog");

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
assert.equal(new Set(BUILT_IN_PETS.map((pet) => pet.id)).size, BUILT_IN_PETS.length);
assert.equal(findBuiltInPet("huahua").type, "human");
assert.equal(findBuiltInPet("huahua").folder, "huahua");
assert.equal(supportsActionArt("huahua"), true);
assert.equal(supportsActionArt("doubao"), false);

for (const petId of ["taotao", "huahua"]) {
  const manifestPath = path.join(__dirname, "..", "assets", "pets", petId, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(Object.keys(manifest.actions).length, 9);
  for (const [action, relativePath] of Object.entries(manifest.actions)) {
    assert.ok(fs.existsSync(path.join(path.dirname(manifestPath), relativePath)), `missing ${manifest.name} action art: ${action}`);
    assert.ok(ACTION_LINES[action]?.length >= 5, `not enough dialogue lines for ${action}`);
  }
  for (const fallback of Object.values(manifest.fallbacks || {})) {
    assert.ok(manifest.actions[fallback], `${manifest.name} fallback points to missing action: ${fallback}`);
  }
}

const huahuaManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "pets", "huahua", "manifest.json"), "utf8"));
assert.equal(huahuaManifest.character.species, "human");
assert.equal(huahuaManifest.character.identity, "graduation-photo-cartoonization");
assert.equal(Object.keys(huahuaManifest.speech).length, 9);
assert.ok(Object.values(huahuaManifest.speech).every((group) => group.length >= 3));
assert.doesNotMatch(JSON.stringify(huahuaManifest.speech), /猫|喵|爪|胡须|尾巴/);

console.log("action pattern tests passed");
