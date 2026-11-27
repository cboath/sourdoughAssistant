/**
 * Snackbar queue. Services and hooks (not only components) can show "Archived. Undo" after a write.
 * One message at a time; a new message replaces the current one.
 */
import { create } from 'zustand';

export interface SnackbarMessage {
  id: number;
  message: string;
  /** What a screen reader hears instead of `message` (one combined announcement, DR2-06). */
  spokenMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface SnackbarState {
  current: SnackbarMessage | null;
  /**
   * Space that pinned UI (tab bar, BottomActionBar, FAB) takes from the bottom edge, by owner.
   * The snackbar sits above the sum so it never covers them.
   */
  clearances: Record<string, number>;
  setClearance(owner: string, height: number): void;
  clearClearance(owner: string): void;
  show(input: Omit<SnackbarMessage, 'id'>): void;
  dismiss(id?: number): void;
}

let nextId = 1;

export const useSnackbarStore = create<SnackbarState>()((set, get) => ({
  current: null,
  clearances: {},
  setClearance(owner, height) {
    set((s) => ({ clearances: { ...s.clearances, [owner]: height } }));
  },
  clearClearance(owner) {
    set((s) => {
      const next = { ...s.clearances };
      delete next[owner];
      return { clearances: next };
    });
  },
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
