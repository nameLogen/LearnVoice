# 第三方组件与模型

真人词汇与拼音素材的作者、来源、许可与剪辑说明见 [原有音频署名](public/references/ATTRIBUTION.md)。48 项音标的真人/合成来源见 [音标署名](public/sounds/ATTRIBUTION.md)。应用设置提供来源入口。

本项目使用以下开源组件，其许可属于各自作者：

| 组件 | 许可 | 来源 |
| --- | --- | --- |
| Capacitor | MIT | https://github.com/ionic-team/capacitor |
| React | MIT | https://github.com/facebook/react |
| Vite | MIT | https://github.com/vitejs/vite |
| ONNX Runtime | MIT | https://github.com/microsoft/onnxruntime |
| Lucide | ISC | https://github.com/lucide-icons/lucide |
| XLSR 音素识别模型 | Apache-2.0（模型卡标注） | https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft |
| ONNX Q4 导出 | Apache-2.0（模型卡标注） | https://huggingface.co/qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX |
| CMU US English Dictionary | CMU 允许再分发的许可，见随附 LICENSE | https://github.com/cmusphinx/cmudict |
| ECDICT | MIT（上游声明；聚合来源历史见上游 README） | https://github.com/skywind3000/ECDICT |
| Kokoro-82M v1.0 模型与声音 | Apache-2.0（模型卡标注） | https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX |
| Kokoro.js / Transformers.js | Apache-2.0 | https://github.com/hexgrad/kokoro / https://github.com/huggingface/transformers.js |
| Phonemizer.js 包装代码 | Apache-2.0（包声明） | https://github.com/xenova/phonemizer.js |
| 底层 eSpeak NG | GPL-3.0-or-later | https://github.com/espeak-ng/espeak-ng |

词典固定版本 `74790861f652b15e4ac49015a90074ad62a27690`，原始文件、校验值及完整许可随应用位于 `dictionary/`。应用自行将 ARPAbet 转为宽式美式 IPA，暂不评测重音，也不根据句意消歧。系统 TTS 声音由设备现有引擎提供，不将其语音包再分发或冒充真人录音。

模型固定版本：`d2987af7ae07d53eafee15dc7190479062faa1e8`。

底层论文：Qiantong Xu, Alexei Baevski, Michael Auli, **Simple and Effective Zero-shot Cross-lingual Phoneme Recognition**。此模型输出语音音素标签；它不是专门针对儿童或普通话四声训练和校准的发音评分器。

本项目自行实现录音质量检查、CTC 标签折叠、预设目标比较和音高观察。没有复制 Tone.me 应用代码，也没有携带其模型或服务密钥。

依赖的完整许可证位于各依赖包的 LICENSE 文件。打包资源中包含 `licenses/` 内的许可与模型说明；不移除上游版权声明。

ECDICT 固定版本为 `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`，CSV 哈希及处理说明在 `public/lexicon/SOURCE.json`，少量学习释义由 `content/word-overrides.json` 修订。上游 MIT 声明不等于所有聚合条目已逐一完成权利核查；本项目保留其来源信息，不把商业词典网页音频批量打包。

Kokoro 固定版本 `1939ad2a8e416c0acfeecc08a694d14ef25f2231`，Q8 模型及四个声音的哈希记录于 `models/tts-manifest.json`。合成输出明确标注，不称为人类录音或教学机构认证发音。

Phonemizer.js 1.2.1 内嵌 eSpeak NG 编译产物，因此不能只依据其 npm 包的 Apache 声明忽略底层 GPL。eSpeak 的许可证随包保留为 `licenses/eSpeak-NG-GPL-3.0.txt`；包装源代码见 https://github.com/xenova/phonemizer.js/tree/6835144b7ee9043129222549c1ed2f6a27216278 ，底层源代码及构建说明见 https://github.com/espeak-ng/espeak-ng 。再分发该组件时须履行其源码提供义务；这些声明不改变其他素材各自的许可证。
