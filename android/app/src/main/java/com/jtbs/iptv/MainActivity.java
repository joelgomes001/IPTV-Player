package com.jtbs.iptv;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView mWebView;
    private FrameLayout mCustomViewContainer;
    private WebChromeClient.CustomViewCallback mCustomViewCallback;
    private View mCustomView;
    private MyWebChromeClient mWebChromeClient;

    private static final String SERVER_URL = "https://classic-iptv.web.app/";
    private static final String FALLBACK_URL = "https://iptv.jtbsclassic.dpdns.org/";

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mWebView = findViewById(R.id.webView);

        // Enable Hardware Acceleration for 60fps smooth rendering
        mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // Configure WebSettings
        WebSettings webSettings = mWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setRenderPriority(WebSettings.RenderPriority.HIGH);

        // User Agent customization for Android App identification
        String defaultUA = webSettings.getUserAgentString();
        webSettings.setUserAgentString(defaultUA + " JTBS_Android_App/1.0");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            webSettings.setMediaPlaybackRequiresUserGesture(false);
        }

        // Enable D-Pad & Touch Focus
        mWebView.setFocusable(true);
        mWebView.setFocusableInTouchMode(true);
        mWebView.requestFocus();

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Inject CSS styling for TV Remote D-Pad focus outline
                view.loadUrl("javascript:(function() {" +
                        "window.isAndroidApp = true;" +
                        "document.body.classList.add('android-app');" +
                        "var style = document.createElement('style');" +
                        "style.innerHTML = ':focus { outline: 3px solid #facc15 !important; box-shadow: 0 0 10px #facc15 !important; }';" +
                        "document.head.appendChild(style);" +
                        "})()");
            }
        });

        mWebChromeClient = new MyWebChromeClient();
        mWebView.setWebChromeClient(mWebChromeClient);

        loadIPTVApp();
    }

    private void loadIPTVApp() {
        if (isNetworkAvailable()) {
            mWebView.loadUrl(SERVER_URL);
        } else {
            Toast.makeText(this, "Connecting to live backup server...", Toast.LENGTH_SHORT).show();
            mWebView.loadUrl(FALLBACK_URL);
        }
    }

    public class MyWebChromeClient extends WebChromeClient {

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (mCustomView != null) {
                onHideCustomView();
                return;
            }

            mCustomView = view;
            mCustomViewCallback = callback;

            // Switch to Landscape ONLY when video goes fullscreen
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);

            // Hide system UI status bar for immersive fullscreen
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );

            if (mCustomViewContainer == null) {
                mCustomViewContainer = new FrameLayout(MainActivity.this);
                mCustomViewContainer.setBackgroundColor(0xFF000000);
                ((ViewGroup) getWindow().getDecorView()).addView(mCustomViewContainer, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }

            mCustomViewContainer.addView(mCustomView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            mCustomViewContainer.setVisibility(View.VISIBLE);
            mWebView.setVisibility(View.GONE);
        }

        @Override
        public void onHideCustomView() {
            if (mCustomView == null) return;

            // Revert back to Portrait mode when exiting fullscreen video
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

            // Restore System UI status bar
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);

            mCustomView.setVisibility(View.GONE);
            if (mCustomViewContainer != null) {
                mCustomViewContainer.removeView(mCustomView);
                mCustomViewContainer.setVisibility(View.GONE);
            }
            mCustomView = null;
            if (mCustomViewCallback != null) {
                mCustomViewCallback.onCustomViewHidden();
            }
            mWebView.setVisibility(View.VISIBLE);
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager != null) {
            NetworkInfo activeNetworkInfo = connectivityManager.getActiveNetworkInfo();
            return activeNetworkInfo != null && activeNetworkInfo.isConnected();
        }
        return false;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mCustomView != null) {
                mWebChromeClient.onHideCustomView();
                return true;
            }
            if (mWebView.canGoBack()) {
                mWebView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
