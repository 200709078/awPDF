package com.madematik.awpdf;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.Window;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;

/**
 * What the WebView cannot do itself: the print service, sharing with other apps, hiding and
 * colouring the system bars and reading a file another app hands over. The web side is
 * src/platform/android.ts.
 */
@CapacitorPlugin(name = "AwPdfNative")
public class AwPdfNativePlugin extends Plugin {

    private static final int COPY_BUFFER_BYTES = 64 * 1024;

    /** The file from "open with"; `readFile` serves it until the next one arrives. */
    private FileInputStream openedFile;
    private int openedId = 0;
    /** The interface's colour for the system bars; null until the page has said it. */
    private Integer barColor;
    private boolean darkBars = false;

    /** Without this the back button would close the app, whatever is open on the page. */
    @Override
    public void load() {
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (hasListeners("backButton")) notifyListeners("backButton", new JSObject());
                else getActivity().moveTaskToBack(true);
            }
        });
    }

    @PluginMethod
    public void leaveApp(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().moveTaskToBack(true);
            call.resolve();
        });
    }

    /** Capacitor sends the intent that starts the app through here too. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        Uri uri = intent.getData();
        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || uri == null) return;
        getBridge().execute(() -> sendFile(uri));
    }

    /** Android's own picker: unlike the WebView's, it allows coming back to the file later. */
    @PluginMethod
    public void pickFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        startActivityForResult(call, intent, "filePicked");
    }

    @ActivityCallback
    private void filePicked(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            getBridge().execute(() -> sendFile(uri));
        }
        call.resolve();
    }

    @PluginMethod
    public void reopenFile(PluginCall call) {
        call.resolve(openFile(Uri.parse(call.getString("source", ""))));
    }

    /** Retained until the page listens, since a tap can start the app before the page loads. */
    private void sendFile(Uri uri) {
        notifyListeners("fileOpened", openFile(uri), true);
    }

    private JSObject openFile(Uri uri) {
        closeOpenedFile();
        JSObject file = new JSObject();
        file.put("id", ++openedId);
        file.put("name", displayName(uri));
        try {
            ParcelFileDescriptor descriptor = seekableDescriptor(uri);
            file.put("size", descriptor.getStatSize());
            openedFile = new ParcelFileDescriptor.AutoCloseInputStream(descriptor);
            if (keepAccess(uri)) file.put("source", uri.toString());
        } catch (IOException | SecurityException | IllegalArgumentException error) {
            // An empty file: the page reports it the way it reports any PDF it cannot open.
            file.put("size", 0);
        }
        return file;
    }

    /** Files from the picker can be kept; many apps' "open with" grants last only this visit. */
    private boolean keepAccess(Uri uri) {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return true;
        } catch (SecurityException refused) {
            return false;
        }
    }

    private void closeOpenedFile() {
        if (openedFile == null) return;
        try {
            openedFile.close();
        } catch (IOException ignored) {
            // Nothing more can be read from it either way.
        }
        openedFile = null;
    }

    private String displayName(Uri uri) {
        String[] columns = { OpenableColumns.DISPLAY_NAME };
        try (Cursor cursor = getContext().getContentResolver().query(uri, columns, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (SecurityException | IllegalArgumentException ignored) {
            // The address below still gives a usable name.
        }
        String segment = uri.getLastPathSegment();
        return segment == null ? "belge.pdf" : new File(segment).getName();
    }

    /** Some apps hand out a pipe, with no size and no seeking; those go through the cache. */
    private ParcelFileDescriptor seekableDescriptor(Uri uri) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ParcelFileDescriptor descriptor = resolver.openFileDescriptor(uri, "r");
        if (descriptor != null && descriptor.getStatSize() >= 0) return descriptor;
        if (descriptor != null) descriptor.close();
        File folder = new File(getContext().getCacheDir(), "acilan");
        folder.mkdirs();
        File copy = new File(folder, "belge.pdf");
        try (InputStream input = resolver.openInputStream(uri); FileOutputStream output = new FileOutputStream(copy)) {
            if (input == null) throw new FileNotFoundException(uri.toString());
            byte[] buffer = new byte[COPY_BUFFER_BYTES];
            for (int count = input.read(buffer); count >= 0; count = input.read(buffer)) {
                output.write(buffer, 0, count);
            }
        }
        return ParcelFileDescriptor.open(copy, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    /** Runs on the same thread as `openFile`, so the file cannot change under it. */
    @PluginMethod
    public void readFile(PluginCall call) {
        if (openedFile == null || call.getInt("id", 0) != openedId) {
            call.reject("Dosya artık açık değil.");
            return;
        }
        long begin = call.getData().optLong("begin");
        ByteBuffer bytes = ByteBuffer.allocate((int) (call.getData().optLong("end") - begin));
        try {
            FileChannel channel = openedFile.getChannel();
            while (bytes.hasRemaining() && channel.read(bytes, begin + bytes.position()) > 0) {
                // Each read continues where the last one stopped.
            }
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(bytes.array(), 0, bytes.position(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (IOException error) {
            call.reject("Dosya okunamadı.", error);
        }
    }

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

    /**
     * The strips behind the status and navigation bars take the interface's colour, and their
     * icons turn light on a dark one. Capacitor's SystemBars puts its own background back after a
     * configuration change (a turn of the phone), so the colour is laid on again right after it.
     */
    @PluginMethod
    public void setSystemBars(PluginCall call) {
        try {
            barColor = Color.parseColor(call.getString("color", "#ffffff"));
        } catch (IllegalArgumentException error) {
            call.reject("Renk okunamadı.", error);
            return;
        }
        darkBars = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            applySystemBars();
            call.resolve();
        });
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        if (barColor != null) new Handler(Looper.getMainLooper()).post(this::applySystemBars);
    }

    private void applySystemBars() {
        Window window = getActivity().getWindow();
        window.getDecorView().setBackgroundColor(barColor);
        window.setStatusBarColor(barColor);
        window.setNavigationBarColor(barColor);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(!darkBars);
        bars.setAppearanceLightNavigationBars(!darkBars);
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
