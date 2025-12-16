/**
 * Focus Store - Demonstrates the Focus API
 *
 * Demonstrates:
 * - focus() for lens-like state access
 * - Getter and setter tuple
 * - Focus change listeners with on()
 * - Fallback values for nullish state
 */
import { store, type ActionsBase } from "storion";

interface UserProfile {
  name: string;
  email: string;
  settings: {
    theme: "light" | "dark";
    notifications: boolean;
    language: string;
  };
  address?: {
    city: string;
    country: string;
  };
}

interface FocusState {
  profile: UserProfile;
  lastUpdated: number | null;
}

interface FocusActions extends ActionsBase {
  getTheme: () => "light" | "dark";
  getName: () => string;
  getCity: () => string;
  toggleTheme: () => void;
  updateName: (name: string) => void;
  setCity: (city: string) => void;
  updateSettings: (settings: Partial<UserProfile["settings"]>) => void;
}

export const focusStore = store<FocusState, FocusActions>({
  name: "focus-demo",
  state: {
    profile: {
      name: "John Doe",
      email: "john@example.com",
      settings: {
        theme: "dark",
        notifications: true,
        language: "en",
      },
      address: undefined, // Initialize optional field for Immer compatibility
    },
    lastUpdated: null,
  },
  setup: ({ state, focus }) => {
    // Focus on nested settings.theme
    const [getTheme, setTheme] = focus("profile.settings.theme");

    // Focus on optional address with fallback
    const [getCity, _setCity] = focus("profile.address.city", {
      fallback: () => "Unknown",
    });
    void _setCity; // Suppress unused variable warning

    // Focus on name
    const [getName, setName] = focus("profile.name");

    return {
      getTheme,
      getName,
      getCity,

      toggleTheme: () => {
        setTheme(getTheme() === "dark" ? "light" : "dark");
        state.lastUpdated = Date.now();
      },

      updateName: (name: string) => {
        setName(name);
        state.lastUpdated = Date.now();
      },

      setCity: (city: string) => {
        // Must replace top-level property (state.profile) for immutable updates
        state.profile = {
          ...state.profile,
          address: state.profile.address
            ? { ...state.profile.address, city }
            : { city, country: "Unknown" },
        };
        state.lastUpdated = Date.now();
      },

      updateSettings: (settings: Partial<UserProfile["settings"]>) => {
        // Must replace top-level property for immutable updates
        state.profile = {
          ...state.profile,
          settings: { ...state.profile.settings, ...settings },
        };
        state.lastUpdated = Date.now();
      },
    };
  },
});
