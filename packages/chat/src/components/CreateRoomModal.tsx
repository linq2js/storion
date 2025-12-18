import { useState } from "react";
import { withStore } from "storion/react";
import { chatStore } from "../stores";

export const CreateRoomModal = withStore(
  (ctx) => {
    const [state, actions] = ctx.get(chatStore);
    return {
      show: state.showCreateRoom,
      setShow: actions.setShowCreateRoom,
      createRoom: actions.createRoom,
      selectRoom: actions.selectRoom,
    };
  },
  ({ show, setShow, createRoom, selectRoom }) => {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    if (!show) return null;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;

      setIsLoading(true);
      try {
        const room = await createRoom(name.trim(), description.trim() || undefined);
        selectRoom(room.id);
        setName("");
        setDescription("");
      } finally {
        setIsLoading(false);
      }
    };

    const handleClose = () => {
      setShow(false);
      setName("");
      setDescription("");
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-chat-surface border border-chat-border rounded-lg shadow-xl w-full max-w-sm animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-chat-border">
            <h2 className="text-sm font-semibold text-white">Create Room</h2>
            <button
              onClick={handleClose}
              className="p-0.5 text-zinc-400 hover:text-white hover:bg-chat-elevated rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-3 space-y-2">
            <div>
              <label htmlFor="roomName" className="block text-[10px] font-medium text-zinc-300 mb-1">
                Room Name
              </label>
              <input
                id="roomName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., general, random, team-alpha"
                className="w-full px-2 py-1.5 bg-chat-elevated border border-chat-border rounded-md text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-chat-accent/50 focus:border-chat-accent transition-all"
                required
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="roomDescription"
                className="block text-[10px] font-medium text-zinc-300 mb-1"
              >
                Description <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="roomDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this room about?"
                rows={2}
                className="w-full px-2 py-1.5 bg-chat-elevated border border-chat-border rounded-lg text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-chat-accent/50 focus:border-chat-accent resize-none transition-all"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-2 py-1.5 bg-chat-elevated text-zinc-300 text-xs font-medium rounded-md hover:bg-chat-border transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !name.trim()}
                className="flex-1 px-2 py-1.5 bg-chat-accent text-white text-xs font-medium rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isLoading ? "Creating..." : "Create Room"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);
