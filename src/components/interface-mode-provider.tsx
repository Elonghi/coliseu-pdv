"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { updateInterfaceModeAction } from "@/modules/auth/interface-mode-actions";
import type { InterfaceMode } from "@/modules/auth/session";

type InterfaceModeContextValue = {
  mode: InterfaceMode;
  pending: boolean;
  setMode: (mode: InterfaceMode) => void;
};

const InterfaceModeContext = createContext<InterfaceModeContextValue | null>(null);

export function InterfaceModeProvider({ initialMode, children }: { initialMode: InterfaceMode; children: React.ReactNode }) {
  const [mode, setModeState] = useState(initialMode);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    document.documentElement.dataset.interface = mode === "MODERN" ? "modern" : "legacy";
    document.documentElement.style.colorScheme = "light";
    return () => {
      document.documentElement.removeAttribute("data-interface");
      document.documentElement.style.colorScheme = "";
    };
  }, [mode]);

  const setMode = useCallback((nextMode: InterfaceMode) => {
    setModeState(nextMode);
    startTransition(async () => {
      try {
        await updateInterfaceModeAction(nextMode);
      } catch {
        setModeState(mode);
      }
    });
  }, [mode]);

  const value = useMemo(() => ({ mode, pending, setMode }), [mode, pending, setMode]);
  return <InterfaceModeContext.Provider value={value}>{children}</InterfaceModeContext.Provider>;
}

export function useInterfaceMode() {
  const context = useContext(InterfaceModeContext);
  if (!context) throw new Error("useInterfaceMode deve ser usado dentro de InterfaceModeProvider.");
  return context;
}
