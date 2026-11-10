"use client";
import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. */
  label: string;
  children: ReactNode;
  /** Prevent closing via Esc/backdrop (e.g. while a transaction is in flight). */
  locked?: boolean;
}

/**
 * Native <dialog>: focus trap, Esc, inert background and `aria-modal` come from the platform.
 * Backdrop click closes (like the reference) unless `locked`. Becomes a bottom sheet under 640 px.
 */
export function Modal({ open, onClose, label, children, locked }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
      onClick={(e) => {
        if (!locked && e.target === ref.current) onClose();
      }}
      onClose={() => {
        if (open && !locked) onClose();
      }}
    >
      {open && <div className="p-6">{children}</div>}
    </dialog>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap justify-end gap-2.5">{children}</div>;
}
