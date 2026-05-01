// Shared by the Hocuspocus editor service (services/editor/server.ts) and the
// collaborative editor client (src/components/editable-text/collaborative-editor.tsx).

// Server: Hocuspocus `debounce` — wait this long after the last edit before persisting.
// Client: how long typing must idle before showing "Saving progress…".
export const TYPING_DEBOUNCE_MS = 2000

// Server: Hocuspocus `maxDebounce` — force a persist at this cadence even during continuous typing.
// Client: matching heartbeat for refreshing the "Last saved" timestamp during sustained edits.
export const MAX_SAVE_INTERVAL_MS = 30_000

// Client-only: brief buffer between local idle and the server-confirmed write,
// used to keep the "Saving progress…" indicator visible long enough to register.
export const PERSIST_DELAY_MS = 1000
