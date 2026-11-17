// ── Language switcher ───────────────────────────────────────────────────

import { useState, type MouseEvent } from "react";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { Translate } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { SYSTEM, getPreference, setLanguagePreference, type LanguagePreference } from "../i18n";

interface LanguageSwitcherProps {
  /** Icon colour; the login page sits on a plain background. */
  color?: "inherit" | "default" | "primary";
}

/**
 * Icon button with a three-way choice: system, English, Chinese. The choice is
 * persisted by `setLanguagePreference`.
 */
export default function LanguageSwitcher({ color = "default" }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const preference = getPreference();

  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const close = () => setAnchor(null);

  const choose = (next: LanguagePreference) => {
    setLanguagePreference(next);
    close();
  };

  const options: { id: LanguagePreference; label: string }[] = [
    { id: SYSTEM, label: t("language.system") },
    { id: "en", label: t("language.english") },
    { id: "zh", label: t("language.chinese") },
  ];

  return (
    <>
      <Tooltip title={t("language.label")}>
        <IconButton
          size="small"
          color={color}
          onClick={open}
          aria-label={t("language.label")}
          aria-haspopup="menu"
          aria-expanded={!!anchor}
        >
          <Translate sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        {options.map((option) => (
          <MenuItem
            key={option.id}
            dense
            selected={preference === option.id}
            onClick={() => choose(option.id)}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
