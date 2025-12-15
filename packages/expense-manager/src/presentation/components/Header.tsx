import { memo } from "react";
import { useStore } from "storion/react";
import { uiStore } from "../stores";

export const Header = memo(function Header() {
  const { openAddModal } = useStore(({ resolve }) => {
    const [, actions] = resolve(uiStore);
    return { openAddModal: actions.openAddModal };
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

          {/* Add Button */}
          <button
            onClick={openAddModal}
            className="btn btn-primary group"
          >
            <svg
              className="w-5 h-5 transition-transform group-hover:rotate-90"
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
            <span className="hidden sm:inline">New Expense</span>
          </button>
        </div>
      </div>
    </header>
  );
});
