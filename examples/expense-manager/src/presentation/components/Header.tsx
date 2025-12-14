import { useStore } from "storion/react";
import { uiStore } from "../stores";

export function Header() {
  const { openAddModal } = useStore(({ get }) => {
    const [, actions] = get(uiStore);
    return { openAddModal: actions.openAddModal };
  });

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-xl">
              💰
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Expense Manager
              </h1>
              <p className="text-xs text-slate-500">Track your spending</p>
            </div>
          </div>

          <button onClick={openAddModal} className="btn btn-primary">
            <span>+</span>
            <span className="hidden sm:inline">Add Expense</span>
          </button>
        </div>
      </div>
    </header>
  );
}

