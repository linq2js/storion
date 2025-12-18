import { useEffect, useState, useLayoutEffect } from "react";
import { withStore } from "storion/react";
import { chatStore } from "./stores";
import {
  LoginScreen,
  Sidebar,
  ChatRoom,
  CreateRoomModal,
  InviteUserModal,
  ProfileModal,
  ToastContainer,
} from "./components";
import { initDB } from "./services/indexedDB";

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
    const [state] = ctx.get(chatStore);
    return { currentUser: state.currentUser };
  },
  ({ currentUser }) => {
    if (!currentUser) return <LoginScreen />;

    return (
      <div
        className="bg-chat-bg flex overflow-hidden"
        style={{ height: "var(--vh, 100vh)" }}
      >
        <Sidebar />
        <ChatRoom />
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
    const [, actions] = ctx.get(chatStore);
    return { restoreSession: actions.restoreSession };
  },
  ({ restoreSession }) => {
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
      async function initialize() {
        // Initialize IndexedDB
        await initDB();

        // Try to restore session
        await restoreSession();

        setIsInitialized(true);
      }

      initialize();
    }, [restoreSession]);

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
