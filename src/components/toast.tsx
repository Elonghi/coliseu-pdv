"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

type ToastTone = "ok" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone };
type Notify = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<Notify | null>(null);
let nextToastId = 0;

/** Retorna `null` fora do shell administrativo; quem chama deve exibir o aviso por conta própria. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback<Notify>((message, tone = "ok") => {
    const id = ++nextToastId;
    setItems((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
  }, [dismiss]);

  return <ToastContext value={notify}>
    {children}
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((item) => <div className={`toast ${item.tone === "error" ? "is-error" : ""}`} key={item.id}>
        {item.tone === "error" ? <CircleAlert size={18}/> : <CircleCheck size={18}/>}
        <span>{item.message}</span>
        <button type="button" onClick={() => dismiss(item.id)} aria-label="Dispensar aviso"><X size={16}/></button>
      </div>)}
    </div>
  </ToastContext>;
}
