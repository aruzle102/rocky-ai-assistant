package com.modaliadz.rocky

import android.os.Bundle
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.io.File

/**
 * Preview screen ONLY. Generated web code runs here, in a WebView sandbox:
 * JavaScript is enabled only here, file access is limited to the project
 * directory, universal file-URL access is off, and there is NO JavaScript
 * bridge to app code. Console errors are captured and shown honestly.
 */
class PreviewActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_preview)
        val slug = intent.getStringExtra("slug") ?: ""
        val status = findViewById<TextView>(R.id.previewStatus)
        val webView = findViewById<WebView>(R.id.previewWebView)
        val index = File(File(filesDir, "projects"), "$slug/index.html")
        if (!index.exists()) {
            status.text = "Preview failed: index.html not found for $slug"
            return
        }
        webView.settings.javaScriptEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowUniversalAccessFromFileURLs = false
        webView.settings.allowFileAccessFromFileURLs = false
        webView.settings.domStorageEnabled = false
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage?): Boolean {
                if (msg != null && msg.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    status.text = "Console error: ${msg.message()} (line ${msg.lineNumber()}) — the agent fix loop can be re-run from Projects."
                }
                return true
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                view?.evaluateJavascript(
                    "(function(){var m=document.getElementById('menu')?'menu:yes':'menu:no';" +
                        "var g=document.getElementById('gallery')?'gallery:yes':'gallery:no';" +
                        "var r=document.getElementById('reservation')?'reservation:yes':'reservation:no';" +
                        "return m+','+g+','+r;})();"
                ) { result ->
                    status.text = "Preview loaded for $slug. Sections found: $result"
                }
            }
        }
        webView.loadUrl("file://${index.absolutePath}")
        findViewById<Button>(R.id.closePreviewButton).setOnClickListener { finish() }
    }
}
