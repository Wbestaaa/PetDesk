(function exposePetCatalog(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PetCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPetCatalog() {
  const BUILT_IN_PETS = Object.freeze([
    {
      id: "momo",
      folder: "taotao",
      type: "cat",
      name: "桃桃",
      kind: "action-art",
      icon: "../assets/pets/taotao/actions/idle.webp",
      body: "#f2a65a",
      accent: "#fff0d6",
      note: "橘猫 · 温暖活泼",
      description: "喜欢饼干、羽毛和晒太阳的元气橘猫。",
      tags: ["9 个动作", "猫系", "内置角色"],
    },
    {
      id: "huahua",
      folder: "huahua",
      type: "cat",
      name: "毕业花花",
      kind: "action-art",
      icon: "../assets/pets/huahua/actions/idle.webp",
      note: "毕业猫猫 · 温柔坚定",
      description: "戴花饰学士帽、抱着毕业花束，陪你完成每一个小目标。",
      tags: ["9 个动作", "毕业主题", "专属回复"],
    },
    {
      id: "doubao",
      type: "dog",
      name: "豆包",
      kind: "procedural",
      emoji: "🐶",
      body: "#bd7a49",
      accent: "#f4ddbe",
      note: "柴犬 · 热情可靠",
      description: "行动派伙伴，适合喜欢热闹陪伴的你。",
      tags: ["动态绘制", "犬系"],
    },
    {
      id: "yuki",
      type: "rabbit",
      name: "雪团",
      kind: "procedural",
      emoji: "🐰",
      body: "#eee9de",
      accent: "#f2b8b5",
      note: "兔子 · 安静敏捷",
      description: "安静地待在桌边，在你需要时给出回应。",
      tags: ["动态绘制", "兔系"],
    },
    {
      id: "foxy",
      type: "fox",
      name: "小焰",
      kind: "procedural",
      emoji: "🦊",
      body: "#e77d3d",
      accent: "#fff1da",
      note: "狐狸 · 聪明活泼",
      description: "好奇心旺盛，会在桌面上主动巡视。",
      tags: ["动态绘制", "狐系"],
    },
    {
      id: "mochi",
      type: "slime",
      name: "麻薯",
      kind: "procedural",
      emoji: "🟢",
      body: "#83b895",
      accent: "#dff0df",
      note: "史莱姆 · 软弹治愈",
      description: "圆滚滚的低打扰伙伴，适合安静陪伴。",
      tags: ["动态绘制", "低打扰"],
    },
  ]);

  function findBuiltInPet(id) {
    return BUILT_IN_PETS.find((pet) => pet.id === id) || null;
  }

  function supportsActionArt(id) {
    return findBuiltInPet(id)?.kind === "action-art";
  }

  return { BUILT_IN_PETS, findBuiltInPet, supportsActionArt };
});
