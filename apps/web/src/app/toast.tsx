// ActionFailed (RulesM8): menu actions with no dialog say "Couldn't …" in a toast at the bottom for 4 s.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toast } from '../ui';

const ms = 4000;
const Ctx = createContext<(message: string) => void>(() => {});

/** Shows one line at the bottom of the window; a newer one replaces it. */
export function useToast(): (message: string) => void {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const show = useMemo(() => (message: string) => setToast((prev) => ({ message, id: (prev?.id ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <Ctx.Provider value={show}>
      {children}
      <Toast message={toast?.message} id={toast?.id} />
    </Ctx.Provider>
  );
}

/** "Jonas Berg" → "Jonas"; "平野 いずみ" → "平野" (family name first, as the toasts use it with さん). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
