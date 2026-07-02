// ── Auto-orientation hook — force portrait or landscape on desktop ──────

import { useLayoutEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalSize } from "@tauri-apps/api/dpi";
import { isMobile } from "../utils/platform";

export type Orientation = "portrait" | "landscape";

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
        const needsFlip =
          (target === "portrait" && !isPortrait) || (target === "landscape" && isPortrait);
        if (needsFlip) {
          await win.setSize(new PhysicalSize(size.height, size.width));
        }
      } catch (e) {
        console.error(`useAutoOrientation(${target}):`, e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [target]);
}
