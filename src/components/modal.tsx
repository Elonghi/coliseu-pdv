"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

const ModalContext = createContext<(() => void) | null>(null);

/** Fecha o modal que contém o componente; `null` quando usado fora de um modal. */
export const useModalClose = () => useContext(ModalContext);

export function Modal({ trigger, triggerClassName = "btn btn-ghost", triggerTitle, title, description, size = "md", children }: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLElement>(".dialog-body input:not([type=hidden]):not([disabled]), .dialog-body select, .dialog-body textarea")?.focus({ preventScroll: true });
  }, [open]);

  return <>
    <button type="button" className={triggerClassName} title={triggerTitle} aria-haspopup="dialog" onClick={() => setOpen(true)}>{trigger}</button>
    {open && <dialog
      ref={dialog}
      className={`dialog ${size === "md" ? "" : `dialog-${size}`}`}
      aria-labelledby={titleId}
      onClose={close}
      onMouseDown={(event) => { pressedOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => { if (pressedOnBackdrop.current && event.target === event.currentTarget) close(); }}
    >
      <ModalContext value={close}>
        <header className="dialog-head">
          <div><h2 className="dialog-title" id={titleId}>{title}</h2>{description && <p className="dialog-desc">{description}</p>}</div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label="Fechar"><X size={17}/></button>
        </header>
        <div className="dialog-body">{children}</div>
      </ModalContext>
    </dialog>}
  </>;
}
