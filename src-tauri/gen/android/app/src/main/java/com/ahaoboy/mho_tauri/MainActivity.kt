package com.ahaoboy.mho_tauri

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
  private val requestLocalNetworkPermission =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (!granted) {
        Toast.makeText(
          this,
          "Local network access is required to reach LAN SSH hosts",
          Toast.LENGTH_LONG
        ).show()
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    requestLocalNetworkAccessIfNeeded()

    // Apply system-bar insets as padding on the root content view
    // so the WebView content sits below the status bar instead of behind it.
    ViewCompat.setOnApplyWindowInsetsListener(
      findViewById(android.R.id.content)
    ) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.updatePadding(
        top = bars.top,
        bottom = bars.bottom,
        left = bars.left,
        right = bars.right,
      )
      WindowInsetsCompat.CONSUMED
    }
  }

  /**
   * Starting with Android 17 (API 37), apps targeting SDK 37+ must hold
   * ACCESS_LOCAL_NETWORK before opening any connection to a LAN address.
   * Without it TCP connects stall until the platform timeout, which looks
   * like an infinite "Connecting…" spinner.
   */
  private fun requestLocalNetworkAccessIfNeeded() {
    if (Build.VERSION.SDK_INT >= 37 &&
      ContextCompat.checkSelfPermission(
        this,
        Manifest.permission.ACCESS_LOCAL_NETWORK
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      requestLocalNetworkPermission.launch(Manifest.permission.ACCESS_LOCAL_NETWORK)
    }
  }
}
