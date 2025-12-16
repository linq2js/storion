/**
 * Focus Demo Component
 * Demonstrates the Focus API for lens-like state access
 */
import { memo } from "react";
import { useStore } from "storion/react";
import { focusStore } from "../stores";

export const FocusDemo = memo(function FocusDemo() {
  // Read specific values inside selector for proper tracking
  const { profile, lastUpdated, actions } = useStore(({ get }) => {
    const [state, actions] = get(focusStore);
    return {
      profile: state.profile,
      lastUpdated: state.lastUpdated,
      actions,
    };
  });

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-2xl font-bold">
            {profile.name.charAt(0)}
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={profile.name}
              onChange={(e) => actions.updateName(e.target.value)}
              className="text-xl font-semibold bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-purple-500 focus:outline-none transition-colors w-full"
            />
            <p className="text-zinc-400 text-sm mt-1">{profile.email}</p>
          </div>
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Theme</h4>
            <p className="text-sm text-zinc-500">
              Current:{" "}
              <code className="text-purple-400">{profile.settings.theme}</code>
            </p>
          </div>
          <button
            onClick={actions.toggleTheme}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              profile.settings.theme === "dark" ? "bg-purple-600" : "bg-zinc-600"
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform ${
                profile.settings.theme === "dark" ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* City with Fallback */}
      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">City</h4>
            <p className="text-sm text-zinc-500">
              Current:{" "}
              <code className="text-purple-400">{profile.address?.city || "N/A"}</code>
            </p>
          </div>
          <select
            value={profile.address?.city || ""}
            onChange={(e) => actions.setCity(e.target.value)}
            className="bg-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Select city...</option>
            <option value="New York">New York</option>
            <option value="San Francisco">San Francisco</option>
            <option value="Tokyo">Tokyo</option>
            <option value="London">London</option>
          </select>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 space-y-3">
        <h4 className="font-medium">Settings</h4>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Notifications</span>
          <button
            onClick={() =>
              actions.updateSettings({
                notifications: !profile.settings.notifications,
              })
            }
            className={`w-10 h-6 rounded-full transition-colors ${
              profile.settings.notifications
                ? "bg-green-500"
                : "bg-zinc-600"
            }`}
          >
            <span
              className={`block w-4 h-4 rounded-full bg-white transition-transform mx-1 ${
                profile.settings.notifications
                  ? "translate-x-4"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Language</span>
          <select
            value={profile.settings.language}
            onChange={(e) =>
              actions.updateSettings({ language: e.target.value })
            }
            className="bg-zinc-700 rounded px-2 py-1 text-sm"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="ja">Japanese</option>
          </select>
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <p className="text-xs text-zinc-500 text-center">
          Last updated: {new Date(lastUpdated).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
});
