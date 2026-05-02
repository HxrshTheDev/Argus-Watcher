import { createContext, useContext, useCallback, useRef, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

interface NotificationContextValue {
  notifySuccess: (title: string, description?: string) => void;
  notifyError: (title: string, description?: string) => void;
  notifyInfo: (title: string, description?: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const notifySuccess = useCallback(
    (title: string, description?: string) => {
      toast({ title, description });
    },
    [toast]
  );

  const notifyError = useCallback(
    (title: string, description?: string) => {
      toast({ title, description, variant: "destructive" });
    },
    [toast]
  );

  const notifyInfo = useCallback(
    (title: string, description?: string) => {
      toast({ title, description });
    },
    [toast]
  );

  return (
    <NotificationContext.Provider value={{ notifySuccess, notifyError, notifyInfo }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used inside NotificationProvider");
  return ctx;
}
