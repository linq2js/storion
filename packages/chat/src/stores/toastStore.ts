import { store, type ActionsBase } from "storion";
import { generateId } from "../types";

export type ToastType = "info" | "success" | "warning" | "error" | "message";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  avatar?: string;
  duration?: number;
  createdAt: number;
  // For navigation - roomId to navigate to when clicked
  roomId?: string;
}

export interface ToastState {
  toasts: Toast[];
}

export interface ToastActions extends ActionsBase {
  show: (toast: Omit<Toast, "id" | "createdAt">) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const DEFAULT_DURATION = 4000;

export const toastStore = store<ToastState, ToastActions>({
  name: "toast",
  state: {
    toasts: [],
  },
  setup: ({ update }) => {
    const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

    return {
      show: (toast) => {
        const id = generateId();
        const duration = toast.duration ?? DEFAULT_DURATION;

        update((s) => {
          s.toasts.push({
            ...toast,
            id,
            createdAt: Date.now(),
          });
        });

        // Auto-dismiss after duration
        if (duration > 0) {
          const timeout = setTimeout(() => {
            update((s) => {
              s.toasts = s.toasts.filter((t) => t.id !== id);
            });
            timeouts.delete(id);
          }, duration);
          timeouts.set(id, timeout);
        }

        return id;
      },

      dismiss: (id) => {
        // Clear timeout if exists
        const timeout = timeouts.get(id);
        if (timeout) {
          clearTimeout(timeout);
          timeouts.delete(id);
        }

        update((s) => {
          s.toasts = s.toasts.filter((t) => t.id !== id);
        });
      },

      dismissAll: () => {
        // Clear all timeouts
        timeouts.forEach((timeout) => clearTimeout(timeout));
        timeouts.clear();

        update((s) => {
          s.toasts = [];
        });
      },
    };
  },
});
