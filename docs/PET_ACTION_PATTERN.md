# PetDesk 标准动作模式 v1

这份规范让内置绘制宠物、单张图片宠物和未来的 Sprite Sheet 角色包使用同一套动作指令。运行时代码位于 `src/pet-actions.js`，此文档说明角色素材如何与它对接。

## 九类动作

| 动作组 | 必备动作 | 可选动作 | 典型触发 |
| --- | --- | --- | --- |
| `idle` 待机 | `idle`、`blink` | `pet`、`stretch` | 启动、空闲、单击 |
| `locomotion` 移动 | `walk` | `run`、`jump` | 自主活动、追随 |
| `emotion` 情绪 | `happy` | `shy`、`sad`、`angry`、`surprised` | 状态与对话 |
| `interact` 互动 | `play` | `pet`、`wave` | 用户点击、菜单 |
| `feed` 进食 | `feed` | `drink` | 喂食、喝水 |
| `work` 学习与工作 | `study` | `write`、`type` | 专注开始 |
| `rest` 休息 | `sleep` | `nap`、`yawn` | 休息、夜间 |
| `celebrate` 庆祝 | `celebrate` | `dance`、`confetti` | 完成专注或任务 |
| `alert` 提醒 | `alert` | `alarm`、`nudge` | 闹钟、待办提醒 |

角色缺少可选动作时，运行时会回退到同组的必备动作；缺少整个动作组时回退到 `idle`。

## 16 方向

方向按从右侧开始顺时针排列：

`E, ENE, NE, NNE, N, NNW, NW, WNW, W, WSW, SW, SSW, S, SSE, SE, ESE`

角色包可以只提供 `E/W` 或八方向，未提供的方向由最近方向或水平镜像补齐。完整 16 方向适合有屏幕行走和追随鼠标需求的角色。

## 推荐角色包结构

```text
my-pet/
├─ manifest.json
├─ portrait.png
└─ sprites/
   ├─ idle/
   │  ├─ S.png
   │  └─ E.png
   ├─ locomotion/
   │  ├─ walk-S.png
   │  └─ walk-E.png
   └─ celebrate/
      └─ celebrate-S.png
```

`manifest.json` 示例：

```json
{
  "schemaVersion": 1,
  "id": "my-pet",
  "name": "我的桌宠",
  "actionPattern": "petdesk-standard-v1",
  "sprite": {
    "frameWidth": 256,
    "frameHeight": 256,
    "framesPerSecond": 12
  },
  "fallbacks": {
    "run": "walk",
    "dance": "celebrate",
    "write": "study"
  }
}
```

当前版本已经让单张自定义图片读取动作模式的分类、默认时长和动画类；Sprite Sheet 导入器可在后续版本按照此规范扩展，而无需更改专注、提醒、互动等业务指令。
