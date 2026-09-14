# Period 项目长期笔记

## 项目性质
- 源头是腾讯吐司（Tusi）AI 生成的经期记录应用 "Period"，原生产物是 APK（Capacitor 壳 + Vue/Vite H5，全量 ~320KB）。
- 用户目标：让 iOS 用户可用（朋友没装吐司 APK 会崩溃）。已选定 PWA 路线；如需上架 App Store 再走 Capacitor iOS。

## 技术事实（勿重复调查）
- 应用 100% 离线：无后端接口、无 fetch 业务调用，数据存 localStorage（无 IndexedDB）。
- APK 内吐司依赖（Aegis 遥测、应用宝 H5 Inspector、E2E gremlins）与应用逻辑无关，可安全移除。
- PWA 完整包在 `Period/tusi-web-dist/`，部署 zip 在 `Period/Period-PWA.zip`；index.html 用相对路径，任何静态托管可直接用。
- 应用内品牌视觉：紫色渐变 + 白色新月 logo（PWA 图标已按此风格生成，绘制脚本思路：两圆相减做月牙 + 4x 超采样）。
- 本地预览：在 tusi-web-dist 目录跑 `python -m http.server 8741`。

## 用户偏好
- 极简交付、无教学引导；UI 质量要求高（图标要与品牌一致，不能糊）。
