"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import type { UserTheme } from "@/modules/auth/session";

const choices: { value: UserTheme; label: string; icon: typeof Sun }[] = [
  { value: "LIGHT", label: "Claro", icon: Sun },
  { value: "DARK", label: "Escuro", icon: Moon },
  { value: "SYSTEM", label: "Automático", icon: Monitor },
];

export function ThemeQuickToggle() {
  const { theme, setTheme, pending } = useTheme();
  const index = choices.findIndex((choice) => choice.value === theme);
  const current = choices[index] ?? choices[2];
  const Icon = current.icon;
  const next = choices[(index + 1) % choices.length];
  return <button className="theme-quick-toggle" type="button" disabled={pending} onClick={() => setTheme(next.value)} title={`Tema: ${current.label}. Alterar para ${next.label}.`} aria-label={`Tema atual: ${current.label}. Alterar para ${next.label}.`}><Icon size={18}/></button>;
}
