// ── Type-safe translation keys ──────────────────────────────────────────
//
// Augments i18next with the English catalogue, so `t("login.connect")` is
// checked at compile time. `zh.ts` is typed against `en.ts`, which keeps both
// catalogues in sync.

import type en from "./en";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
