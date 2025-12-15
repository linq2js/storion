import { memo } from "react";
import { useStore } from "storion/react";
import { uiStore } from "../stores";

export const Header = memo(function Header() {
  const { activeView, setView } = useStore(({ resolve }) => {
    const [state, actions] = resolve(uiStore);
    return {
      activeView: state.activeView,
      setView: actions.setView,
    };
  });

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-surface-200/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-glow">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-surface-900 tracking-tight">
                Spendwise
              </h1>
              <p className="text-xs text-surface-400 -mt-0.5">
                Track every penny
              </p>
            </div>
          </div>

          {/* Navigation Icons */}
          <nav className="flex items-center gap-1">
            <NavIconButton
              active={activeView === "dashboard"}
              onClick={() => setView("dashboard")}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              }
              label="Dashboard"
            />
            <NavIconButton
              active={activeView === "reports"}
              onClick={() => setView("reports")}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              label="Reports"
            />
          </nav>
        </div>
      </div>
    </header>
  );
});

// Navigation icon button
const NavIconButton = memo(function NavIconButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-2.5 rounded-xl transition-all ${
        active
          ? "bg-primary-50 text-primary-600"
          : "text-surface-400 hover:text-surface-600 hover:bg-surface-100"
      }`}
    >
      {icon}
    </button>
  );
});

// Floating Action Button for adding expenses
export const FloatingAddButton = memo(function FloatingAddButton() {
  const { activeView, openAddModal, setView } = useStore(({ resolve }) => {
    const [state, actions] = resolve(uiStore);
    return {
      activeView: state.activeView,
      openAddModal: actions.openAddModal,
      setView: actions.setView,
    };
  });

  const handleClick = () => {
    // Navigate to dashboard first so user sees the new expense
    if (activeView !== "dashboard") {
      setView("dashboard");
    }
    openAddModal();
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center group"
      aria-label="Add new expense"
    >
      <svg
        className="w-7 h-7 transition-transform group-hover:rotate-90"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4v16m8-8H4"
        />
      </svg>
    </button>
  );
});
