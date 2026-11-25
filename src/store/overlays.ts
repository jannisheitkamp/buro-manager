// Offen/zu für Suche (⌘K) und Assistent, damit Layout und die Komponenten denselben Zustand teilen
import { create } from 'zustand';

type Overlay = { open: boolean; setOpen: (o: boolean) => void };

export const useCommandPalette = create<Overlay>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
export const useAssistant = create<Overlay>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
