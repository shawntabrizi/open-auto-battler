/**
 * Shared overlay layering for the web app.
 *
 * Keep in-game temporary layers low and grouped together, then reserve the
 * 9996+ range for global modal-style overlays in ascending priority.
 */
export const UI_LAYERS = {
  inGameOverlay: 60,
  tooltip: 70,
  confirmDialog: 80,
  editorPicker: 1000,
  cardInspect: 9996,
  keyboardShortcuts: 9997,
  tutorial: 9998,
  globalMenu: 9999,
  transaction: 10010,
} as const;
