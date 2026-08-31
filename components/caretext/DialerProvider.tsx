"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type DialerContextValue = {
  isOpen: boolean;
  openDialer: () => void;
  closeDialer: () => void;
};

const DialerContext = createContext<DialerContextValue | null>(null);

export function useDialer() {
  const context = useContext(DialerContext);
  if (!context) {
    throw new Error("useDialer must be used within DialerProvider");
  }
  return context;
}

export function DialerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openDialer = useCallback(() => setIsOpen(true), []);
  const closeDialer = useCallback(() => setIsOpen(false), []);
  const value = useMemo(
    () => ({ isOpen, openDialer, closeDialer }),
    [closeDialer, isOpen, openDialer],
  );

  return <DialerContext.Provider value={value}>{children}</DialerContext.Provider>;
}
