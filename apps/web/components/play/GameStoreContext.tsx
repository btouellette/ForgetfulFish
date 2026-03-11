"use client";

import React, { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";

import type { GameStore } from "../../lib/stores/game-store";

const GameStoreContext = createContext<StoreApi<ReturnType<GameStore["getState"]>> | null>(null);

type GameStoreProviderProps = {
  store: GameStore;
  children: React.ReactNode;
};

export function GameStoreProvider({ store, children }: GameStoreProviderProps) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

export function useGameStore<T>(selector: (state: ReturnType<GameStore["getState"]>) => T): T {
  const store = useContext(GameStoreContext);

  if (!store) {
    throw new Error("useGameStore must be used within a GameStoreProvider");
  }

  return useStore(store, selector);
}

export function useGameStoreApi(): GameStore {
  const store = useContext(GameStoreContext);

  if (!store) {
    throw new Error("useGameStoreApi must be used within a GameStoreProvider");
  }

  return store;
}
