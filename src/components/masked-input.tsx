"use client";
import type { InputHTMLAttributes } from "react";
import { masks, onlyDigits, type MaskKind } from "@/lib/masks";

const attributes: Record<MaskKind, InputHTMLAttributes<HTMLInputElement>> = {
  cnpj: { inputMode: "numeric", placeholder: "00.000.000/0000-00", pattern: "\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}", title: "Informe o CNPJ completo, com 14 dígitos." },
  phone: { inputMode: "tel", placeholder: "(00) 00000-0000", autoComplete: "tel" },
};

/** Campo que formata enquanto a pessoa digita e mantém o cursor no lugar certo. */
export function MaskedInput({ kind, defaultValue, className = "field", ...props }: { kind: MaskKind; defaultValue?: string | null } & Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "type" | "onInput">) {
  const mask = masks[kind];
  return <input
    type="text"
    {...attributes[kind]}
    {...props}
    className={className}
    defaultValue={defaultValue ? mask(defaultValue) : ""}
    onInput={(event) => {
      const input = event.currentTarget;
      const caret = input.selectionStart ?? input.value.length;
      const digitsBeforeCaret = onlyDigits(input.value.slice(0, caret)).length;
      const formatted = mask(input.value);
      if (formatted === input.value) return;
      input.value = formatted;
      let position = 0;
      for (let seen = 0; position < formatted.length && seen < digitsBeforeCaret; position++) if (/\d/.test(formatted[position])) seen++;
      input.setSelectionRange(position, position);
    }}
  />;
}
