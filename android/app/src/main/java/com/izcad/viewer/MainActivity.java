package com.izcad.viewer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingDrawingPlugin.class);
        registerPlugin(NativeDwgPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
