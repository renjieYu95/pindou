# 第三方数据声明

## MARD 色卡

- 数据项目：<https://github.com/maxcleme/beadcolors>
- 固定版本：`29229889`
- 原始数据：<https://raw.githubusercontent.com/maxcleme/beadcolors/29229889/raw/mard.csv>
- 原始许可证：<https://raw.githubusercontent.com/maxcleme/beadcolors/29229889/LICENSE>
- 许可：MIT，Copyright (c) 2020 maxcleme。
- CSV 中记录的 MARD 数据贡献者：Asher。
- 原始 291 色 CSV 保存在 `third-party/mard.csv`，完整许可证保存在 `third-party/beadcolors-LICENSE`，同时嵌入小程序的 `data/palette.js`。

本项目选取 A、B、C、D、E、F、G、H、M 系列的 221 个色号，并将 RGB 转为 HEX，不修改其数值。生成脚本使用自然色号顺序排列。为保守处理材料属性，H1 不参与自动匹配，只能手动选择。其余扩展系列未包含在首版色卡中。

数据用于屏幕近似配色，不能表示珠光、透明、荧光等实际材料效果；屏幕、环境光、批次和配方变化都会影响实物效果，尚未进行实体色卡校准。采购与铺豆应以用户持有的实物色卡为准。

MARD 标识用于说明色号兼容关系，不表示官方授权、合作或背书。

## 示例图与程序

林间小兔示例通过本项目 `miniprogram/core/demo.js` 中的几何图形绘制，没有下载或使用第三方图片。除上述色卡数据外，项目未引入第三方运行时库。
