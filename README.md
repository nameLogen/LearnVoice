# 小小声音实验室

面向家庭测试的离线语音验证器。先验证手机能否稳定听辨孩子的声音，再将有效能力接入游戏。

**当前不是专业发音评分系统。** 英语提供实验性的 0–100 音素接近度、逐音素提示和同题前后对照。数字根据模型输出与目标的距离计算，不是发音准确率，也不是与示范录音直接比对。拼音只记录声韵候选和音高曲线，尚未实现自动声调评分。

## 已实现

- Capacitor 8 + React + TypeScript，安卓应用和浏览器共用界面。
- 安卓原生 AudioRecord 录制 16 kHz、单声道音频；浏览器使用 AudioWorklet。
- 最长 5 秒录音、回放、短音频导入，检查静音、时长和严重削波。
- 安卓 ONNX Runtime 原生 CPU 推理；浏览器 ONNX Runtime Web/WASM worker 推理。
- XLSR 多语言音素模型的真实 CTC 输出、时间位置及序列比较。
- 英语单词、孤立音素、`mā / má / mǎ / mà` 拼音观察。
- 家长标注、备注、本地历史记录（最多 200 条）、JSON 导出。
- 分别统计已标注样本中的“读错却匹配”和“读对却不同”；无法判断及拼音观察不混入统计。
- GitHub Actions 自动构建、测试并上传可安装的 Android debug APK。
- 14 个目标内置真人发音参考，点击“听发音示范”即可离线播放；`mā` 使用“妈妈”的第一个音作为词例。
- 英语音素接近度、漏音/多音提示、下一遍练习建议、同题历史变化。详见 [评分说明](docs/SCORING.md)。

## 通过 GitHub 打包安卓 APK

不需要购买 Capacitor 云服务，也不需要在自己的电脑安装 Android Studio 来触发云构建。

1. 将此目录提交到 GitHub 仓库，包含 `android/`、`package-lock.json` 和 `.github/workflows/android.yml`。
2. 打开仓库的 **Actions → Android APK**。推送到 `main/master` 或创建 PR 会自动触发，也可以点击 **Run workflow** 手动触发。
3. 等待构建成功，在该次运行页面底部的 **Artifacts** 下载 `voice-lab-android-运行编号`。
4. 解压下载文件，将 `voice-lab-debug.apk` 传到安卓设备并安装。
5. 打开应用，允许麦克风权限，点击“检查并载入模型”，录音后运行“开始本地分析”。

构建时会从 Hugging Face 下载固定版本模型，逐个校验 SHA-256，然后嵌入 APK。**模型不进入 Git 历史。** GitHub 模型缓存用于减少后续下载，缓存内容仍会校验。

构建顺序：`npm ci` → 单元测试 → 下载与校验模型 → 网页构建 → `cap sync android` → 浏览器测试及真实模型推理 → `:app:assembleDebug / :app:lintDebug / :app:testDebugUnitTest` → 上传 APK。

GitHub Actions 使用 Linux、Node 22、JDK 21、Android SDK 36。当前测试 APK 包含 arm64-v8a 和 x86_64；不包含旧的 32 位 ARM。平台最低版本为 Android 7/API 24，但本项目建议先在较新的 64 位安卓设备测试；最低 API 不代表旧设备有足够内存运行模型。

产物保留 14 天。GitHub Actions 自身的额度按仓库及账号方案计算，并非承诺无限免费。

### 签名与更新

当前生成的是 **debug 测试包**，不是商店发布包，不需要设置签名 Secrets。不同云构建生成的默认 debug 签名可能不同，因此不保证覆盖安装；若系统提示签名不一致，请先导出观察记录，再卸载旧版安装新包。需要长期稳定升级时，另行配置固定的签名密钥。不要将私钥或 keystore 提交到仓库。

## 本地开发

需要 Node.js 22.12 或更新版本。

```sh
npm ci
npm run models:download
npm run assets:prepare
npm run dev
```

在本机浏览器打开终端显示的 localhost 地址。录音要求 HTTPS 或 localhost；手机直接访问电脑的普通 HTTP 局域网地址通常不能获得麦克风，首次手机验证优先安装 APK。

安卓本地构建还需要 JDK 21 和 Android SDK 36：

```sh
npm run android:sync
cd android
./gradlew :app:assembleDebug
```

Windows 使用 `gradlew.bat`。设置 `ANDROID_HOME` 和 `JAVA_HOME`，或在不提交的 `android/local.properties` 中配置 SDK 路径。

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

端到端测试包含：手机/桌面布局、导入静音录音、无有效声音时拒绝比较、标注持久化、导出、缺失模型错误，以及真实模型在浏览器中的推理。真实模型测试使用合成音调，仅检查部署和无外部请求，不检验发音准确率。`npm run test:model` 可单独执行此项（需先准备模型并构建）。

## 数据、离线与模型

- 安卓 APK 包含运行库和模型，初次启动会将模型解包到应用私有目录，并验证哈希。安装后可在飞行模式下录音和分析。
- 安装包中的模型约 230 MiB，解包及推理还需要额外磁盘和运行内存。请以真机测量为准。
- 浏览器模式也只请求同一站点的模型/运行库，不将音频发送给任何识别 API；目前网页未实现完整 PWA 缓存，因此不能承诺关闭网页后断网重开。安卓 APK 才是本版完整离线入口。
- 原始录音仅驻留当前页面内存，切换目标、重新录音或关闭页面后丢弃；不会自动写入长期存储或导出文件。
- 观察结果存储在应用/浏览器本地。导出由用户主动操作，包含目标、音素、模型版本、耗时、音高观察、家长标注和备注，不包含录音。
- 禁用安卓系统备份；应用没有登录、广告、分析上报或在线识别服务。

模型来源与固定版本见 `models/manifest.json`：

- 原模型：[facebook/wav2vec2-xlsr-53-espeak-cv-ft](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft)
- ONNX Q4 导出：[qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX](https://huggingface.co/qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX)
- 许可标注：Apache-2.0，详见 `THIRD_PARTY_NOTICES.md`。

## 如何做一次有用的家庭测试

1. 先选 `cat`，自然读对几次，再故意改读 `cap` 或漏掉末尾声音。
2. 每次先回放，再标记**孩子实际是否读对**，不要照着模型结果标注。
3. 分别尝试整词、孤立音素和安静/普通家庭环境，避免把不同条件混在一起。
4. 测试拼音四声时，只将音高曲线作为观察线索，由家长判断。模型当前没有声调评分，不能据此推断四声已过关。
5. 看导出的错误样本及模型耗时，决定哪些题型适合进入游戏。

本轮需真机确认的内容：目标机型的首次加载、实际儿童声音、麦克风权限/中断恢复、连续使用的内存与发热，以及完全断网安装后运行。没有这些证据前，不应宣称儿童发音判断达到可靠水平。

## 主要文件

- `src/App.tsx`：验证界面与实验记录。
- `src/speech.ts`：音频检查、CTC 解码、序列比较、音高观察。
- `src/inference.worker.ts`：浏览器本地推理。
- `android/app/src/main/java/cn/learn48/voicelab/VoiceLabPlugin.java`：安卓录音、推理、文件分享。
- `scripts/download-model.mjs`：固定版本下载及校验。
- `.github/workflows/android.yml`：GitHub 自动打包。

GitHub 仓库：[nameLogen/LearnVoice](https://github.com/nameLogen/LearnVoice)。
