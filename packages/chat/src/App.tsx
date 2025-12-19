import { useEffect, useState, useLayoutEffect } from "react";
import { useContainer, withStore } from "storion/react";
import { authStore, routeStore, isDashboard, loadInitialData } from "./stores";
import { isAdmin } from "./types";
import {
  LoginScreen,
  Sidebar,
  ChatRoom,
  CreateRoomModal,
  InviteUserModal,
  ProfileModal,
  ToastContainer,
  AdminPanel,
} from "./components";
import { indexedDBCoreService } from "./services/indexedDB";

// Hook to handle dynamic viewport height (DevTools resize)
function useDynamicViewportHeight() {
  useLayoutEffect(() => {
    function updateHeight() {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight}px`
      );
    }

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);
}

// Loading screen
function LoadingScreen() {
  return (
    <div
      className="bg-chat-bg flex items-center justify-center"
      style={{ height: "var(--vh, 100vh)" }}
    >
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-chat-accent to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse-soft">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <p className="text-zinc-500">Loading...</p>
      </div>
    </div>
  );
}

// Main chat layout
const ChatLayout = withStore(
  (ctx) => {
    const [authState] = ctx.get(authStore);
    const [routeState] = ctx.get(routeStore);
    return {
      currentUser: authState.currentUser,
      showAdminDashboard: isDashboard(routeState.route) && isAdmin(authState.currentUser),
    };
  },
  ({ currentUser, showAdminDashboard }) => {
    if (!currentUser) return <LoginScreen />;

    return (
      <div
        className="bg-chat-bg flex overflow-hidden"
        style={{ height: "var(--vh, 100vh)" }}
      >
        <Sidebar />
        {showAdminDashboard ? <AdminPanel /> : <ChatRoom />}
        <CreateRoomModal />
        <InviteUserModal />
        <ProfileModal />
        <ToastContainer />
      </div>
    );
  }
);

// App wrapper with initialization - needs to be inside StoreProvider
const AppContent = withStore(
  (ctx) => {
    const [, actions] = ctx.get(authStore);
    const core = ctx.get(indexedDBCoreService);
    return { restoreSession: actions.restoreSession, core };
  },
  ({ restoreSession, core }) => {
    const app = useContainer();
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
      async function initialize() {
        // Initialize IndexedDB
        await core.init();

        // Try to restore session
        const user = await restoreSession();

        // Load initial data if user was restored
        if (user) {
          await loadInitialData(app);
        }

        setIsInitialized(true);
      }

      initialize();
    }, [restoreSession, core, app]);

    if (!isInitialized) {
      return <LoadingScreen />;
    }

    return <ChatLayout />;
  }
);

export function App() {
  useDynamicViewportHeight();
  return <AppContent />;
}
