# 第三方组件与模型

新增真人发音素材的逐文件作者、来源、许可与剪辑说明见 [音频署名](public/references/ATTRIBUTION.md)。应用也在“示范来源与许可”中显示这些信息。

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

模型固定版本：`d2987af7ae07d53eafee15dc7190479062faa1e8`。

底层论文：Qiantong Xu, Alexei Baevski, Michael Auli, **Simple and Effective Zero-shot Cross-lingual Phoneme Recognition**。此模型输出语音音素标签；它不是专门针对儿童或普通话四声训练和校准的发音评分器。

本项目自行实现录音质量检查、CTC 标签折叠、预设目标比较和音高观察。没有复制 Tone.me 应用代码，也没有携带其模型或服务密钥。

依赖的完整许可证位于各依赖包的 LICENSE 文件。打包资源中包含 `licenses/` 内的许可与模型说明；不移除上游版权声明。
