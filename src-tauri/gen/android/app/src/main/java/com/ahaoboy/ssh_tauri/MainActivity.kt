package com.ahaoboy.ssh_tauri

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

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
}
