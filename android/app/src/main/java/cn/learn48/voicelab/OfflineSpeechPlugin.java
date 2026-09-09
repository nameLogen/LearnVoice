package cn.learn48.voicelab;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@CapacitorPlugin(name = "OfflineSpeech")
public class OfflineSpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean ready = false;
    private final List<PluginCall> waiting = new ArrayList<>();
    private PluginCall speaking;
    private String currentId;
    private Runnable speechTimeout;
    private Runnable initTimeout;
    private int initGeneration = 0;

    private boolean offlineEnglish(Voice voice) {
        return voice != null && "en".equals(voice.getLocale().getLanguage()) && !voice.isNetworkConnectionRequired()
            && (voice.getFeatures() == null || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
    }

    @PluginMethod
    public void voices(PluginCall call) {
        main.post(() -> {
            if (ready) { listVoices(call); return; }
            waiting.add(call);
            if (tts != null) return;
            final int generation = ++initGeneration;
            initTimeout = () -> initFailed("离线语音引擎未响应，请检查系统文字转语音设置后重新检测。");
            main.postDelayed(initTimeout, 10_000);
            try {
                tts = new TextToSpeech(getContext(), status -> main.post(() -> {
                    if (tts == null || generation != initGeneration) return;
                    main.removeCallbacks(initTimeout);
                    if (status != TextToSpeech.SUCCESS) { initFailed("未找到可用的语音引擎，请安装支持离线英语的文字转语音引擎。"); return; }
                    ready = true;
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) { }
                        @Override public void onDone(String id) { main.post(() -> finish(id, false, null)); }
                        @Override public void onError(String id) { main.post(() -> finish(id, false, "离线朗读失败，请检查本地英语语音包。")); }
                        @Override public void onStop(String id, boolean interrupted) { main.post(() -> finish(id, true, null)); }
                    });
                    for (PluginCall pending : waiting) listVoices(pending);
                    waiting.clear();
                }));
            } catch (Exception error) { initFailed("无法启动系统语音引擎，请检查文字转语音设置。"); }
        });
    }

    private void initFailed(String error) {
        initGeneration++;
        if (initTimeout != null) main.removeCallbacks(initTimeout);
        if (tts != null) tts.shutdown(); tts = null; ready = false;
        for (PluginCall call : waiting) call.reject(error);
        waiting.clear();
    }

    private void listVoices(PluginCall call) {
        try {
            List<Voice> available = new ArrayList<>();
            if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) if (offlineEnglish(voice)) available.add(voice);
            available.sort(Comparator.comparing((Voice v) -> !"US".equals(v.getLocale().getCountry())).thenComparing(Voice::getName));
            JSArray items = new JSArray();
            for (Voice voice : available) {
                JSObject item = new JSObject(); item.put("id", voice.getName()); item.put("name", voice.getName());
                item.put("lang", voice.getLocale().toLanguageTag()); items.put(item);
            }
            JSObject result = new JSObject(); result.put("voices", items); call.resolve(result);
        } catch (Exception error) { call.reject("读取本地声音失败，请检查文字转语音设置。"); }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        main.post(() -> {
            stopCurrent();
            if (!ready || tts == null) { call.reject("请先检测离线声音。"); return; }
            String text = call.getString("text", ""), requested = call.getString("voiceId", "");
            if (text.trim().isEmpty() || text.length() > 1000) { call.reject("请分成较短的句子朗读。"); return; }
            try {
                Voice selected = null;
                if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) if (requested.equals(voice.getName()) && offlineEnglish(voice)) selected = voice;
                if (selected == null || tts.setVoice(selected) != TextToSpeech.SUCCESS) { call.reject("所选离线声音不可用，请安装英语语音包后重新检测。不会使用在线声音。"); return; }
                double rate = call.getDouble("rate", 0.85);
                if (!Double.isFinite(rate) || rate < 0.5 || rate > 1.2) { call.reject("朗读速度无效。"); return; }
                tts.setSpeechRate((float) rate);
                speaking = call; currentId = UUID.randomUUID().toString();
                final String id = currentId;
                speechTimeout = () -> { finish(id, false, "离线朗读超时，请检查语音包。"); tts.stop(); };
                main.postDelayed(speechTimeout, 60_000);
                if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) finish(id, false, "无法开始离线朗读。");
            } catch (Exception error) {
                if (speaking == call) finish(currentId, false, "离线朗读失败，请重新检测。");
                else call.reject("离线朗读失败，请重新检测。");
            }
        });
    }

    private void finish(String id, boolean cancelled, String error) {
        if (id == null || !id.equals(currentId) || speaking == null) return;
        if (speechTimeout != null) main.removeCallbacks(speechTimeout);
        PluginCall call = speaking; speaking = null; currentId = null;
        if (error != null) call.reject(error);
        else { JSObject result = new JSObject(); result.put("cancelled", cancelled); call.resolve(result); }
    }
    private void stopCurrent() { finish(currentId, true, null); if (tts != null) tts.stop(); }
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { stopCurrent(); call.resolve(); }); }
    @Override protected void handleOnPause() { main.post(this::stopCurrent); }
    @Override protected void handleOnDestroy() {
        main.post(() -> { stopCurrent(); initFailed("页面已关闭。"); });
    }
}
