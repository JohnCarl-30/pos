"use client";

import { useSyncExternalStore } from "react";

const STEP = 15_000;

function subscribe(callback: () => void) {
  const id = setInterval(callback, STEP);
  return () => clearInterval(id);
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / STEP) * STEP,
    () => null,
  );
}
