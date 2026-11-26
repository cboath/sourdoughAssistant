/**
 * Snackbar queue. Services and hooks (not only components) can show "Archived. Undo" after a write.
 * One message at a time; a new message replaces the current one.
 */
import { create } from 'zustand';

export interface SnackbarMessage {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface SnackbarState {
  current: SnackbarMessage | null;
  show(input: Omit<SnackbarMessage, 'id'>): void;
  dismiss(id?: number): void;
}

let nextId = 1;

export const useSnackbarStore = create<SnackbarState>()((set, get) => ({
  current: null,
  show(input) {
    set({ current: { ...input, id: nextId++ } });
  },
  dismiss(id) {
    const { current } = get();
    if (current && (id === undefined || current.id === id)) set({ current: null });
  },
}));

/** Non-React entry point for services. */
export const showSnackbar = (input: Omit<SnackbarMessage, 'id'>) =>
  useSnackbarStore.getState().show(input);
