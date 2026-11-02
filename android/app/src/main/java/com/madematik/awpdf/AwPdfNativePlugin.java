package com.madematik.awpdf;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.view.Window;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * What the WebView cannot do itself: the print service, sharing with other apps and hiding the
 * system bars. The web side is src/platform/android.ts.
 */
@CapacitorPlugin(name = "AwPdfNative")
public class AwPdfNativePlugin extends Plugin {

    /** Prints the page as it is, so the `@media print` styles decide what goes on paper. */
    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "awPDF");
        getActivity().runOnUiThread(() -> {
            PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            manager.print(name, getBridge().getWebView().createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
            call.resolve();
        });
    }

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (enabled) bars.hide(WindowInsetsCompat.Type.systemBars());
            else bars.show(WindowInsetsCompat.Type.systemBars());
            call.resolve();
        });
    }

    @PluginMethod
    public void appendShareFile(PluginCall call) {
        boolean first = Boolean.TRUE.equals(call.getBoolean("first", false));
        try (FileOutputStream output = new FileOutputStream(sharedCopy(call), !first)) {
            output.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Dosya paylaşıma hazırlanamadı.", error);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", sharedCopy(call));
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("application/pdf");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(Intent.createChooser(send, null));
        call.resolve();
    }

    /** One folder in the cache; the name is reduced to a file name so it cannot leave it. */
    private File sharedCopy(PluginCall call) {
        File folder = new File(getContext().getCacheDir(), "paylas");
        folder.mkdirs();
        return new File(folder, new File(call.getString("name", "belge.pdf")).getName());
    }
}
