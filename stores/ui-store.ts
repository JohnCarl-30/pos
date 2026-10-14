import { create } from "zustand";

type UiState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
