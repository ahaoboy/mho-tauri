// ── Configuration manager dialog ────────────────────────────────────────

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
} from "@mui/material";
import { Delete, Storage, Login } from "@mui/icons-material";
import type { SavedConfig } from "../types";

// ── Props ────────────────────────────────────────────────────────────────

interface ConfigDialogProps {
  open: boolean;
  configs: SavedConfig[];
  onClose: () => void;
  onLoad: (config: SavedConfig) => void;
  onDelete: (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function ConfigDialog({
  open,
  configs,
  onClose,
  onLoad,
  onDelete,
}: ConfigDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /** Handle the delete flow with confirmation. */
  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onDelete(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Storage fontSize="small" color="primary" />
        Saved Configurations
      </DialogTitle>

      <DialogContent dividers>
        {configs.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            No saved configurations yet.
            <br />
            Fill in the connection form and click <strong>Save</strong>.
          </Typography>
        ) : (
          <List disablePadding>
            {configs.map((cfg) => (
              <ListItem
                key={cfg.id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    color={confirmDelete === cfg.id ? "error" : "default"}
                    onClick={() => handleDelete(cfg.id)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton
                  onClick={() => {
                    onLoad(cfg);
                    onClose();
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Login fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={cfg.label}
                    secondary={`${cfg.username}@${cfg.host}:${cfg.port}  ·  ${cfg.authMethod === "password" ? "Password" : "Key"}`}
                    slotProps={{
                      primary: { variant: "body2", sx: { fontWeight: 500 } },
                      secondary: {
                        variant: "caption",
                        sx: { fontFamily: "monospace" },
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}

        {confirmDelete && (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: "block" }}>
            Click again to confirm deletion.
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
