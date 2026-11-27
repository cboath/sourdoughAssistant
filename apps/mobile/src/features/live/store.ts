/** Local UI state for the live view: which ready-time cards the baker dismissed this session. */
import { create } from 'zustand';

interface LiveUiState {
  dismissedReady: ReadonlySet<string>;
  dismissReady(key: string): void;
  reset(): void;
}

export const useLiveUi = create<LiveUiState>()((set) => ({
  dismissedReady: new Set<string>(),
  dismissReady: (key) => set((s) => ({ dismissedReady: new Set([...s.dismissedReady, key]) })),
  reset: () => set({ dismissedReady: new Set<string>() }),
}));
