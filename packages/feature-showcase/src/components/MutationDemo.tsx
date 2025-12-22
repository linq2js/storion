/**
 * Mutation Demo Component
 * Demonstrates async mixin pattern for component-local mutations and form submissions
 */
import { memo, useState, FormEvent } from "react";
import { useStore } from "storion/react";
import { async, type AsyncContext } from "storion/async";

// ============================================================================
// Define mutations using async() mixin pattern
// These return selector mixins - no store needed!
// ============================================================================

interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

interface SubmitResult {
  id: string;
  timestamp: number;
}

// Simulated API call - form submission
const submitContactForm = async(
  async (ctx: AsyncContext, _data: ContactFormData): Promise<SubmitResult> => {
    // Simulate network delay (in real app, you'd use _data to send to server)
    await async.delay(1500);

    // Check if cancelled
    if (ctx.signal.aborted) throw new Error("Cancelled");

    // Simulate random failure (20% chance)
    if (Math.random() < 0.2) {
      throw new Error("Server error: Please try again");
    }

    return {
      id: `msg-${Date.now()}`,
      timestamp: Date.now(),
    };
  }
);

// Simulated delete mutation
const deleteItem = async(
  async (ctx: AsyncContext, itemId: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (ctx.signal.aborted) throw new Error("Cancelled");
    // Simulate successful delete
    console.log(`Deleted item: ${itemId}`);
  }
);

// Simulated like/unlike mutation
const toggleLike = async(
  async (ctx: AsyncContext, _postId: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (ctx.signal.aborted) throw new Error("Cancelled");
    // Return new like state (toggled)
    return Math.random() > 0.5;
  }
);

// ============================================================================
// Components
// ============================================================================

const LoadingSpinner = memo(function LoadingSpinner({
  size = "md",
}: {
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div
      className={`animate-spin ${sizeClass} border-2 border-purple-500 border-t-transparent rounded-full`}
    />
  );
});

/**
 * Contact Form - demonstrates form submission with async mixin
 */
const ContactForm = memo(function ContactForm() {
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    message: "",
  });

  const { status, error, result, submit, reset } = useStore(({ mixin }) => {
    const [state, actions] = mixin(submitContactForm);
    return {
      status: state.status,
      error: state.error,
      result: state.data,
      submit: actions.dispatch,
      reset: actions.reset,
    };
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(formData);
  };

  const handleReset = () => {
    reset();
    setFormData({ name: "", email: "", message: "" });
  };

  if (status === "success" && result) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h4 className="text-green-400 font-semibold mb-2">Message Sent!</h4>
        <p className="text-zinc-400 text-sm mb-4">
          ID: {result.id}
          <br />
          Sent at: {new Date(result.timestamp).toLocaleTimeString()}
        </p>
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
        >
          Send Another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">
          Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          placeholder="John Doe"
          required
          disabled={status === "pending"}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">
          Email
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          placeholder="john@example.com"
          required
          disabled={status === "pending"}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">
          Message
        </label>
        <textarea
          value={formData.message}
          onChange={(e) =>
            setFormData({ ...formData, message: e.target.value })
          }
          className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 min-h-[100px]"
          placeholder="Your message..."
          required
          disabled={status === "pending"}
        />
      </div>

      {status === "error" && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {(error as Error).message}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "pending"}
        className="w-full px-4 py-3 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {status === "pending" ? (
          <>
            <LoadingSpinner size="sm" />
            Submitting...
          </>
        ) : (
          "Submit"
        )}
      </button>
    </form>
  );
});

/**
 * Deletable Item - demonstrates delete mutation
 */
const DeletableItem = memo(function DeletableItem({
  id,
  title,
  onDeleted,
}: {
  id: string;
  title: string;
  onDeleted: (id: string) => void;
}) {
  const { isDeleting, error, handleDelete } = useStore(({ mixin }) => {
    const [state, actions] = mixin(deleteItem);
    return {
      isDeleting: state.status === "pending",
      error: state.status === "error" ? state.error : null,
      handleDelete: () => {
        actions.dispatch(id).then(() => onDeleted(id));
      },
    };
  });

  return (
    <div
      className={`flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 ${
        isDeleting ? "opacity-50" : ""
      }`}
    >
      <span className="text-zinc-200">{title}</span>
      <div className="flex items-center gap-2">
        {error && (
          <span className="text-red-400 text-xs">
            {(error as Error).message}
          </span>
        )}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
          title="Delete"
        >
          {isDeleting ? <LoadingSpinner size="sm" /> : "🗑️"}
        </button>
      </div>
    </div>
  );
});

/**
 * Likeable Post - demonstrates toggle mutation
 */
const LikeablePost = memo(function LikeablePost({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [liked, setLiked] = useState(false);

  const { isLoading, toggle } = useStore(({ mixin }) => {
    const [state, actions] = mixin(toggleLike);
    return {
      isLoading: state.status === "pending",
      toggle: () => {
        actions.dispatch(id).then((newLiked) => {
          setLiked(newLiked);
        });
      },
    };
  });

  return (
    <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
      <span className="text-zinc-200">{title}</span>
      <button
        onClick={toggle}
        disabled={isLoading}
        className={`p-2 rounded-lg transition-colors ${
          liked
            ? "bg-pink-500/20 text-pink-400"
            : "hover:bg-zinc-700 text-zinc-400"
        }`}
      >
        {isLoading ? <LoadingSpinner size="sm" /> : liked ? "❤️" : "🤍"}
      </button>
    </div>
  );
});

/**
 * Main Demo Component
 */
export const MutationDemo = memo(function MutationDemo() {
  const [items, setItems] = useState([
    { id: "1", title: "First Item" },
    { id: "2", title: "Second Item" },
    { id: "3", title: "Third Item" },
  ]);

  const handleItemDeleted = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-8">
      {/* Info Banner */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
        <h4 className="text-purple-400 font-semibold mb-2">
          🚀 Async Mixin Pattern
        </h4>
        <p className="text-zinc-400 text-sm">
          This demo uses <code className="text-purple-300">async(handler)</code>{" "}
          without a focus - creating component-local async state. Perfect for
          mutations and form submissions that don't need global state.
        </p>
      </div>

      {/* Contact Form */}
      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
          <span>📝</span>
          Form Submission
        </h4>
        <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
          <ContactForm />
        </div>
      </div>

      {/* Delete Items */}
      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
          <span>🗑️</span>
          Delete Mutations
        </h4>
        <div className="space-y-2">
          {items.map((item) => (
            <DeletableItem
              key={item.id}
              id={item.id}
              title={item.title}
              onDeleted={handleItemDeleted}
            />
          ))}
          {items.length === 0 && (
            <p className="text-zinc-500 text-center py-4">All items deleted!</p>
          )}
        </div>
      </div>

      {/* Like Posts */}
      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
          <span>❤️</span>
          Toggle Mutations
        </h4>
        <div className="space-y-2">
          <LikeablePost id="post-1" title="First Post" />
          <LikeablePost id="post-2" title="Second Post" />
          <LikeablePost id="post-3" title="Third Post" />
        </div>
      </div>

      {/* Code Example */}
      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
          <span>💻</span>
          Code Pattern
        </h4>
        <pre className="bg-zinc-900 rounded-xl p-4 text-sm text-zinc-300 overflow-x-auto">
          {`// Define mutation (no store needed!)
const submitForm = async(async (ctx, data) => {
  const res = await fetch("/api/submit", {
    method: "POST",
    body: JSON.stringify(data),
    signal: ctx.signal,
  });
  return res.json();
});

// Use in component
const { status, submit } = useStore(({ mixin }) => {
  const [state, actions] = mixin(submitForm);
  return {
    status: state.status,
    submit: actions.dispatch,
  };
});`}
        </pre>
      </div>
    </div>
  );
});
