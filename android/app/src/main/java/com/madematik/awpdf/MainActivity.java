package com.madematik.awpdf;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins are registered before the bridge starts.
        registerPlugin(AwPdfNativePlugin.class);
        super.onCreate(savedInstanceState);
        // WebView, Android'in yazı boyutu ayarını (ör. 1,5×) arayüzdeki bütün yazılara uygular ve
        // düğme yazıları taşar; PDF sayfaları zaten kendi yakınlaştırmasıyla büyür.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
