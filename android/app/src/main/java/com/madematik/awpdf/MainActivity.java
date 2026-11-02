package com.madematik.awpdf;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // WebView, Android'in yazı boyutu ayarını (ör. 1,5×) arayüzdeki bütün yazılara uygular ve
        // düğme yazıları taşar; PDF sayfaları zaten kendi yakınlaştırmasıyla büyür.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
