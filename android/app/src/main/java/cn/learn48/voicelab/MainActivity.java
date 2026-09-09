package cn.learn48.voicelab;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceLabPlugin.class);
        registerPlugin(OfflineSpeechPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
