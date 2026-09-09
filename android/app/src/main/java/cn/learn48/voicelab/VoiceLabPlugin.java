package cn.learn48.voicelab;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

@CapacitorPlugin(name = "VoiceLab", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class VoiceLabPlugin extends Plugin {
    private static final int RATE = 16000;
    private static final int MAX_SAMPLES = RATE * 5;
    private static final String ENGINE = "ONNX Runtime Android · CPU";
    private final ExecutorService inference = Executors.newSingleThreadExecutor();
    private final ExecutorService capture = Executors.newSingleThreadExecutor();
    private volatile boolean recording = false;
    private Future<float[]> recorded;
    private OrtSession session;
    private String[] vocabulary;

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermission");
        } else beginRecording(call);
    }

    @PermissionCallback
    private void microphonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) beginRecording(call);
        else call.reject("麦克风权限未开启，请在系统应用设置中允许后重试。");
    }

    private synchronized void beginRecording(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("麦克风权限未开启。"); return;
        }
        if (!recording && recorded != null && recorded.isDone()) recorded = null;
        if (recording || recorded != null) { call.reject("已有录音，请先结束。"); return; }
        AudioRecord microphone = null;
        try {
            int minimum = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minimum <= 0) throw new IllegalStateException("设备不支持 16 kHz 录音。");
            microphone = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, 6400));
            if (microphone.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("麦克风初始化失败。");
            microphone.startRecording();
            if (microphone.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IllegalStateException("麦克风被其他应用占用。");
            final AudioRecord source = microphone;
            recording = true;
            recorded = capture.submit(() -> {
                float[] samples = new float[MAX_SAMPLES]; short[] buffer = new short[1600]; int used = 0;
                try {
                    while (recording && used < MAX_SAMPLES) {
                        int count = source.read(buffer, 0, Math.min(buffer.length, MAX_SAMPLES - used));
                        if (count < 0) throw new IllegalStateException("录音中断（" + count + "），请重试。");
                        for (int i = 0; i < count; i++) samples[used++] = buffer[i] / 32768f;
                    }
                    return Arrays.copyOf(samples, used);
                } finally {
                    recording = false;
                    try { source.stop(); } catch (Exception ignored) { }
                    source.release();
                }
            });
            call.resolve();
        } catch (Exception error) {
            recording = false;
            if (microphone != null) microphone.release();
            call.reject("无法开始录音：" + error.getMessage());
        }
    }

    @PluginMethod
    public synchronized void stopRecording(PluginCall call) {
        recording = false;
        Future<float[]> task = recorded;
        if (task == null) { call.reject("没有正在进行的录音。"); return; }
        // Run off the UI thread, after the capture task has released the microphone.
        capture.execute(() -> {
            try {
                float[] samples = task.get(3, TimeUnit.SECONDS);
                synchronized (VoiceLabPlugin.this) { if (recorded == task) recorded = null; }
                JSArray array = new JSArray(); for (float sample : samples) array.put((double) sample);
                JSObject result = new JSObject(); result.put("samples", array); call.resolve(result);
            } catch (Exception error) { call.reject("读取录音失败，请重试。"); }
        });
    }

    @PluginMethod
    public synchronized void cancelRecording(PluginCall call) {
        recording = false;
        Future<float[]> task = recorded;
        capture.execute(() -> {
            synchronized (VoiceLabPlugin.this) { if (recorded == task) recorded = null; }
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() { recording = false; }

    private JSONObject readAssetJson(String name) throws Exception {
        try (InputStream input = getContext().getAssets().open("public/models/phoneme/" + name)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
        }
    }

    private void prepareSession() throws Exception {
        if (session != null) return;
        JSONObject manifest = readAssetJson("manifest.json");
        String revision = manifest.getString("revision");
        JSONObject modelInfo = manifest.getJSONArray("files").getJSONObject(0);
        String expected = modelInfo.getString("sha256");
        File model = new File(getContext().getFilesDir(), "phoneme-" + revision + ".onnx");
        if (!model.exists() || model.length() != modelInfo.getLong("size")) {
            File temporary = new File(getContext().getFilesDir(), "phoneme-download.tmp");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = getContext().getAssets().open("public/models/phoneme/model.onnx");
                 FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); digest.update(buffer, 0, count); }
            }
            StringBuilder hash = new StringBuilder(); for (byte b : digest.digest()) hash.append(String.format("%02x", b & 0xff));
            if (!hash.toString().equals(expected)) { temporary.delete(); throw new IllegalStateException("模型完整性校验失败，请重新安装。"); }
            if (!temporary.renameTo(model)) throw new IllegalStateException("模型保存失败，请检查可用空间。");
        }
        JSONObject vocab = readAssetJson("vocab.json"); vocabulary = new String[vocab.length()];
        for (java.util.Iterator<String> keys = vocab.keys(); keys.hasNext();) { String token = keys.next(); vocabulary[vocab.getInt(token)] = token; }
        try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
            options.setIntraOpNumThreads(2); options.setInterOpNumThreads(1);
            options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
            session = OrtEnvironment.getEnvironment().createSession(model.getAbsolutePath(), options);
        }
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        inference.execute(() -> {
            try { prepareSession(); JSObject result = new JSObject(); result.put("engine", ENGINE); call.resolve(result); }
            catch (Exception error) { call.reject("本地模型加载失败：" + error.getMessage()); }
            catch (OutOfMemoryError error) { call.reject("设备内存不足，无法载入此模型。"); }
        });
    }

    @PluginMethod
    public void analyse(PluginCall call) {
        JSArray array = call.getArray("samples");
        if (array == null || array.length() < 4000 || array.length() > MAX_SAMPLES) { call.reject("录音长度必须在 0.25–5 秒之间。"); return; }
        inference.execute(() -> {
            try {
                prepareSession();
                float[] samples = new float[array.length()]; double mean = 0, variance = 0;
                for (int i = 0; i < samples.length; i++) {
                    samples[i] = (float) array.getDouble(i);
                    if (!Float.isFinite(samples[i])) throw new IllegalArgumentException("录音包含无效数值。");
                    mean += samples[i];
                }
                mean /= samples.length;
                for (float sample : samples) variance += (sample - mean) * (sample - mean);
                double denominator = Math.sqrt(variance / samples.length + 1e-7);
                for (int i = 0; i < samples.length; i++) samples[i] = (float) ((samples[i] - mean) / denominator);
                OrtEnvironment environment = OrtEnvironment.getEnvironment();
                Map<String, OnnxTensor> feeds = new HashMap<>();
                try {
                    feeds.put("input_values", OnnxTensor.createTensor(environment, FloatBuffer.wrap(samples), new long[] { 1, samples.length }));
                    if (session.getInputNames().contains("attention_mask")) {
                        long[] mask = new long[samples.length]; Arrays.fill(mask, 1);
                        feeds.put("attention_mask", OnnxTensor.createTensor(environment, LongBuffer.wrap(mask), new long[] { 1, samples.length }));
                    }
                    long start = System.nanoTime();
                    try (OrtSession.Result output = session.run(feeds)) {
                        float[][] logits = ((float[][][]) output.get(0).getValue())[0];
                        JSArray phones = new JSArray(); JSObject lastPhone = null; int previous = -1;
                        double duration = samples.length / (double) RATE;
                        for (int frame = 0; frame < logits.length; frame++) {
                            float[] values = logits[frame]; int best = 0;
                            for (int i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
                            String token = vocabulary[best]; boolean skip = (token.startsWith("<") && !token.equals("<unk>")) || token.equals("|");
                            if (best == previous) {
                                if (!skip && lastPhone != null) lastPhone.put("end", (frame + 1) * duration / logits.length);
                                continue;
                            }
                            previous = best;
                            if (skip) continue;
                            double sum = 0; for (float value : values) sum += Math.exp(value - values[best]);
                            lastPhone = new JSObject(); lastPhone.put("token", token); lastPhone.put("confidence", 1 / sum);
                            lastPhone.put("start", frame * duration / logits.length); lastPhone.put("end", (frame + 1) * duration / logits.length); phones.put(lastPhone);
                        }
                        JSObject result = new JSObject(); result.put("phones", phones); result.put("elapsedMs", (System.nanoTime() - start) / 1_000_000.0); result.put("engine", ENGINE); call.resolve(result);
                    }
                } finally { for (OnnxTensor tensor : feeds.values()) tensor.close(); }
            } catch (Exception error) { call.reject("本地分析失败：" + error.getMessage()); }
            catch (OutOfMemoryError error) { call.reject("设备内存不足，请关闭其他应用或使用更短录音。"); }
        });
    }

    @PluginMethod
    public void exportFile(PluginCall call) {
        try {
            String name = call.getString("name", "voice-lab.json");
            if (!name.matches("[a-zA-Z0-9._-]+\\.json")) { call.reject("文件名无效。"); return; }
            File folder = new File(getContext().getCacheDir(), "exports"); folder.mkdirs();
            File file = new File(folder, name);
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(call.getString("content", "{}").getBytes(StandardCharsets.UTF_8)); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_SEND); intent.setType("application/json"); intent.putExtra(Intent.EXTRA_STREAM, uri); intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try { getActivity().startActivity(Intent.createChooser(intent, "导出观察记录")); call.resolve(); }
                catch (Exception error) { call.reject("没有可接收 JSON 的应用。"); }
            });
        } catch (Exception error) { call.reject("导出失败：" + error.getMessage()); }
    }

    @Override
    protected void handleOnDestroy() {
        recording = false; capture.shutdown();
        inference.execute(() -> { if (session != null) { try { session.close(); } catch (Exception ignored) { } session = null; } });
        inference.shutdown();
    }
}
