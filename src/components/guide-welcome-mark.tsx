"use client";
import { useEffect } from "react";
import { markGuideWelcomedAction } from "@/modules/onboarding/actions";

/* Registra que a pessoa já viu as boas-vindas: o painel para de levá-la ao guia sozinho. */
export function GuideWelcomeMark() {
  useEffect(() => { void markGuideWelcomedAction(); }, []);
  return null;
}
