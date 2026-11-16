// ── Mho Tauri — application root ────────────────────────────────────────

import { useEffect } from "react";
import { CssBaseline } from "@mui/material";
import { useAutoOrientation } from "./hooks/useAutoOrientation";
import { isMobile } from "./utils/platform";
import { useStore } from "./store";
import LoginForm from "./components/LoginForm";
import Workspace from "./components/Workspace";

export default function App() {
  const loggedIn = useStore((s) => s.loggedIn);

  // ── Disable right-click context menu ──────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // ── Window orientation ────────────────────────────────────
  const orientation =
    loggedIn && !isMobile() && screen.width > screen.height ? "landscape" : "portrait";
  useAutoOrientation(orientation);

  return (
    <>
      <CssBaseline />
      {loggedIn ? <Workspace /> : <LoginForm />}
    </>
  );
}
