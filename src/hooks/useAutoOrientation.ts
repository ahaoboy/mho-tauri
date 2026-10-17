// ── Auto-orientation hook — force portrait or landscape on desktop ──────

import { useLayoutEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalSize } from "@tauri-apps/api/dpi";
import { isMobile } from "../utils/platform";

export type Orientation = "portrait" | "landscape";

/**
 * Landscape aspect used for desktop windows. The old behaviour was a plain
 * width/height swap (e.g. 852×393), which is too short to show command output
 * comfortably. A ~3:2 landscape window keeps the same width but is taller.
 */
const LANDSCAPE_HEIGHT_RATIO = 2 / 3;

/** Never grow the landscape window beyond this share of the screen height. */
const MAX_SCREEN_HEIGHT_RATIO = 0.9;

/** Remembered portrait window size, so landscape → portrait restores it. */
let portraitSize: PhysicalSize | null = null;

/**
 * On desktop, flip the window to match the given orientation target.
 * No-op on mobile. Call at App level so a single hook handles all transitions.
 */
export function useAutoOrientation(target: Orientation) {
  useLayoutEffect(() => {
    if (isMobile()) return;

    let cancelled = false;
    (async () => {
      try {
        const win = getCurrentWindow();
        const size = await win.innerSize();
        if (cancelled) return;

        const isPortrait = size.height > size.width;

        if (target === "portrait") {
          if (isPortrait) {
            // The current window is already portrait — use it as the shape to
            // restore when returning from landscape.
            portraitSize = size;
            return;
          }
          // Restore the exact portrait size captured before the flip.
          const portrait = portraitSize ?? new PhysicalSize(size.height, size.width);
          await win.setSize(portrait);
          return;
        }

        // target === "landscape"
        if (!isPortrait) return;

        portraitSize = size;

        const width = size.height;
        const screenHeight =
          typeof window !== "undefined"
            ? window.screen.availHeight * (window.devicePixelRatio || 1)
            : Number.POSITIVE_INFINITY;
        const height = Math.min(
          Math.round(width * LANDSCAPE_HEIGHT_RATIO),
          Math.round(screenHeight * MAX_SCREEN_HEIGHT_RATIO),
        );

        await win.setSize(new PhysicalSize(width, height));
      } catch (e) {
        console.error(`useAutoOrientation(${target}):`, e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [target]);
}
