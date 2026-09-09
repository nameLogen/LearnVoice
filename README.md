# 听读乐园

面向家庭的英语与拼音听读应用。使用 React、TypeScript 和 Capacitor，网页和 Android 共用界面；Android 安装包自带朗读、识别模型和词典，录音不上传。

## 0.4.1 功能

- 英语、拼音两大入口；英语包含词典、音标、自然拼读、故事四页。
- 48 项传统英式教学音标：20 项元音、24 项辅音、4 项辅音组合。支持按长短元音、双元音、爆破音、摩擦音等分类，每项提供三个例词。
- 音标示范已停用旧版 48 项混合素材。当前内置合格单音录音为 **0 项**，缺少时明确显示“录音待补充”，不会播放整词或调用 TTS 替代。设置支持逐项导入、试听、保存与移除自备真人录音，保存在本机并可离线播放。素材验收要求见 [音标录音维护](docs/PHONEME_AUDIO.md)。
- 123 组常用自然拼读，涵盖基础音、辅音组合、连缀、不发音 e、元音组合、r 相关组合和常见词尾，共使用 363 个不同例词。
- 770,002 条离线词典词条，支持前缀搜索、中文释义、词性、词形变化和最近查询。大词库不保证覆盖所有英文词；学习例词的释义和词性有自动完整性检查。
- 所有入口共用单词弹窗：听示范、看释义、看词性、录音、回放；有发音词典参考的单词在结束录音后自动分析。
- 内置 Kokoro Q8 朗读，提供美式/英式各一男一女四种声音，可调整速度。新增文章或普通词汇不需要逐条录制音频。
- 故事支持粘贴、UTF-8 TXT、整篇/段落播放、逐句高亮、点词弹窗、段落跟读、暂停续播。内置声音使用真实音频位置续播；可选系统声音可能重听本句。
- 设置统一管理声音、字号、行距、跟随滚动、文章备份、家长记录与设备检查；沿用旧版文章与练习记录的存储键。

**评分是实验性的音素接近度，不是发音准确率。** 参考音素来自美式 CMU 词典，尚未针对儿童校准，也不评测重音、节奏和所有细微发音差别。英式示范与美式参考可能存在差异。拼音目前保留 mā/má/mǎ/mà 四声观察，不判断声调对错；段落跟读记录完成进度，不输出整句准确率。详见 [评分原理](docs/SCORING.md)。

## 用 GitHub 打包

1. 推送到 `main` 后，仓库 [Actions](https://github.com/nameLogen/LearnVoice/actions) 自动运行 **Android APK**，也可手动 Run workflow。
2. 构建会运行单元测试，下载并校验两套固定版本模型，打包网页，执行浏览器测试，再构建、Lint Android。
3. 成功后下载 `voice-lab-android-运行编号`，解压并安装 `voice-lab-debug.apk`；网页包为 `voice-lab-web-运行编号`。
4. Android 中打开设置试听声音，进入词典查 `cat` 并录音；之后用飞行模式验证目标设备。

GitHub 产物保留 14 天。这是 debug 测试包，不同构建签名可能不同；遇到不能覆盖安装时，先在设置中导出文章和练习记录，再处理旧安装。应用名称改为“听读乐园”，包名仍是 `cn.learn48.voicelab`，已有数据不会因名称变化而迁移。

## 本地运行

需要 Node 22.12+。

```sh
npm ci
npm run models:download
npm run assets:prepare
npm run dev
```

两套模型和四个声音的固定版本、文件尺寸和 SHA-256 分别在 `models/manifest.json`、`models/tts-manifest.json`。下载脚本仅用于开发/打包；模型不提交到 Git，GitHub Actions 缓存下载结果。`npm run models:download` 会准备识别和朗读两部分。

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

浏览器测试覆盖手机/桌面、真实录音后自动分析、全部音频解码、四种真实离线声音、暂停续播、子目录部署、数据保存及异常恢复。测试证明功能链路，不证明儿童发音评分准确。

本地 Android 需要 JDK 21、Android SDK 36：

```sh
npm run android:sync
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

Windows 使用 `gradlew.bat`。SDK 和 JDK 路径通过 `ANDROID_HOME`、`JAVA_HOME` 配置，不提交个人目录或签名密钥。

## 网页部署

将 **整个 dist 的内容**原样上传，可以部署到网站根目录，也可以放在 `/temp/LearnVoice/` 等子目录。不要只上传 `index.html` 或 `assets`。

```text
index.html, favicon.svg, recorder-worklet.js
assets/       界面及 Worker
models/       phoneme/ 与 kokoro/ 两套本地模型
ort/          识别 WASM
tts-ort/      朗读 WASM
dictionary/   发音词典
lexicon/      中文释义词库
references/   原有真人词汇与拼音示范
sounds/       音标素材清单（当前内置录音待补充）
licenses/     来源与许可
```

资源路径使用相对构建路径，避免旧版部署到子目录后仍请求 `/assets/...`。服务器需正确提供 WASM/JSON/音频静态文件，不能把找不到的资源重写成 HTML。远程网页录音需要 **HTTPS**；HTTP 网站可以显示页面，但浏览器通常不会开放麦克风。localhost 开发地址例外。

网页版从自己的部署站点读取资源，无在线识别/朗读 API；尚未实现完整 PWA 离线冷启动缓存。**安装 APK 是目前完整离线的入口**。两套模型约 334 MB，词典约 85 MB，另有运行库；安装、解包和运行需预留存储空间，低内存设备须实测。朗读与评分切换时释放另一套模型，降低同时驻留的内存。

## 内容与维护

- 添加文章：应用中操作即可，无需改代码。最多 20 篇，每篇 30,000 字符。
- 添加/修改拼读课：`src/learning.ts`，每组指定拼写、声音、分类、提示和例词。
- 修订少量词义：`content/word-overrides.json`，运行词库构建脚本后重新打包；人工修订优先于上游词库。
- 更换音标录音：家庭使用可在「设置 → 声音 → 音标教学录音」逐项导入。随安装包发布的录音放入 `public/sounds/approved/`，在 `catalog.v2.json` 中登记授权与实际审核记录；详见 [维护说明](docs/PHONEME_AUDIO.md)。
- 重建完整词库：按 `public/lexicon/SOURCE.json` 下载固定版 ECDICT CSV 到 `artifacts/sources/ecdict.csv`，其 LICENSE 保存为 `artifacts/sources/ECDICT-LICENSE`，然后运行 `node scripts/build-lexicon.mjs`。
- 孩子的练习录音只保留在当前界面内存中。本机导入的教学录音保存于 IndexedDB，不包含在文章或练习记录备份里，务必保留原文件。长期记录保存分析结果、家长备注和完成进度；卸载或清除数据前，在设置中备份。

更多实现说明见 [阅读和词典原理](docs/READING.md)、[第三方来源](THIRD_PARTY_NOTICES.md)。
