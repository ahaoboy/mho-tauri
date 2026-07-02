import { platform } from "@tauri-apps/plugin-os";

/**
 * Detect whether the app is running on a mobile device (Android or iOS).
 */
export function isMobile(): boolean {
  try {
    const plat = platform();
    return plat === "android" || plat === "ios";
  } catch {
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  }
}
