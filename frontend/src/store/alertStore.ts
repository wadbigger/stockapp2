import { create } from 'zustand';
import type { Product } from '../types';

interface AlertStore {
  alertProducts: Product[];
  alertCount: number;
  setAlerts: (products: Product[]) => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alertProducts: [],
  alertCount: 0,
  setAlerts: (products) => set({ alertProducts: products, alertCount: products.length }),
}));
