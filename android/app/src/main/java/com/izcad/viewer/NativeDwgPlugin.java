package com.izcad.viewer;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeDwg")
public class NativeDwgPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    static { System.loadLibrary("izcad_native"); }

    private static native int convertFile(String inputPath, String outputPath);

    @PluginMethod
    public void convert(PluginCall call) {
        String encoded = call.getString("data");
        if (encoded == null || encoded.length() > 64 * 1024 * 1024) {
            call.reject("Missing or oversized DWG input");
            return;
        }
        executor.execute(() -> {
            File input = null;
            File output = null;
            try {
                input = File.createTempFile("izcad-", ".dwg", getContext().getCacheDir());
                output = File.createTempFile("izcad-", ".dxf", getContext().getCacheDir());
                Files.write(input.toPath(), Base64.decode(encoded, Base64.DEFAULT));
                int error = convertFile(input.getAbsolutePath(), output.getAbsolutePath());
                if (error != 0 || output.length() == 0) {
                    call.reject("LibreDWG native conversion error: " + error);
                    return;
                }
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(Files.readAllBytes(output.toPath()), Base64.NO_WRAP));
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Native DWG conversion failed", e);
            } finally {
                if (input != null) input.delete();
                if (output != null) output.delete();
            }
        });
    }
}
