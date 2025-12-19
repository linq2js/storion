import { withStore } from "storion/react";
import { toastStore, routeStore, type Toast, type ToastType } from "../stores";

// Icon components for different toast types
function ToastIcon({ type }: { type: ToastType }) {
  const iconClass = "w-4 h-4";

  switch (type) {
    case "success":
      return (
        <svg className={`${iconClass} text-green-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case "error":
      return (
        <svg className={`${iconClass} text-red-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case "warning":
      return (
        <svg className={`${iconClass} text-amber-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );
    case "message":
      return (
        <svg className={`${iconClass} text-chat-accent`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    default:
      return (
        <svg className={`${iconClass} text-blue-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
  }
}

// Single toast item
function ToastItem({
  toast,
  onDismiss,
  onClick,
}: {
  toast: Toast;
  onDismiss: () => void;
  onClick?: () => void;
}) {
  const bgColors: Record<ToastType, string> = {
    info: "bg-blue-500/10 border-blue-500/30",
    success: "bg-green-500/10 border-green-500/30",
    warning: "bg-amber-500/10 border-amber-500/30",
    error: "bg-red-500/10 border-red-500/30",
    message: "bg-chat-accent/10 border-chat-accent/30",
  };

  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-2 p-2 rounded-md border backdrop-blur-sm shadow-lg animate-slide-in-right ${bgColors[toast.type]} ${
        isClickable ? "cursor-pointer hover:bg-white/5 transition-colors" : ""
      }`}
      role="alert"
    >
      {toast.avatar ? (
        <img src={toast.avatar} alt="" className="w-7 h-7 rounded-full bg-chat-elevated flex-shrink-0" />
      ) : (
        <div className="flex-shrink-0 mt-0.5">
          <ToastIcon type={toast.type} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-white text-xs">{toast.title}</p>
        {toast.message && (
          <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{toast.message}</p>
        )}
        {isClickable && (
          <p className="text-[9px] text-chat-accent mt-0.5">Click to view</p>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Toast container
export const ToastContainer = withStore(
  (ctx) => {
    const [toastState, toastActions] = ctx.get(toastStore);
    const [, routeActions] = ctx.get(routeStore);
    return {
      toasts: toastState.toasts,
      dismiss: toastActions.dismiss,
      goToRoom: routeActions.goToRoom,
    };
  },
  ({ toasts, dismiss, goToRoom }) => {
    if (toasts.length === 0) return null;

    const handleToastClick = (toast: Toast) => {
      if (toast.roomId) {
        goToRoom(toast.roomId);
        dismiss(toast.id);
      }
    };

    return (
      <div className="fixed top-2 right-2 z-50 flex flex-col gap-1.5 max-w-xs w-full pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem
              toast={toast}
              onDismiss={() => dismiss(toast.id)}
              onClick={toast.roomId ? () => handleToastClick(toast) : undefined}
            />
          </div>
        ))}
      </div>
    );
  }
);
