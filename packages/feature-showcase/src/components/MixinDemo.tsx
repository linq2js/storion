/**
 * Mixin Demo Component
 * Demonstrates useStore with mixins() helper for composition
 */
import { useStore, mixins, type SelectorContext } from "storion/react";
import { store } from "storion";

// =============================================================================
// Demo Stores
// =============================================================================

const userStore = store({
  name: "mixin-demo-user",
  state: {
    name: "Alice",
    email: "alice@example.com",
  },
  setup({ state }) {
    return {
      setName: (name: string) => {
        state.name = name;
      },
      setEmail: (email: string) => {
        state.email = email;
      },
    };
  },
});

const statsStore = store({
  name: "mixin-demo-stats",
  state: {
    views: 42,
    likes: 128,
  },
  setup({ state }) {
    return {
      incrementViews: () => {
        state.views++;
      },
      incrementLikes: () => {
        state.likes++;
      },
    };
  },
});

// =============================================================================
// Reusable Mixins
// =============================================================================

// Direct mixin - returns object that gets spread
const selectUserInfo = (ctx: SelectorContext) => {
  const [state, actions] = ctx.get(userStore);
  return {
    userName: state.name,
    userEmail: state.email,
    setName: actions.setName,
  };
};

// Primitive mixin - used with named syntax
const selectViews = (ctx: SelectorContext) => {
  const [state] = ctx.get(statsStore);
  return state.views;
};

const selectLikes = (ctx: SelectorContext) => {
  const [state] = ctx.get(statsStore);
  return state.likes;
};

const selectIncrementViews = (ctx: SelectorContext) => {
  const [, actions] = ctx.get(statsStore);
  return actions.incrementViews;
};

const selectIncrementLikes = (ctx: SelectorContext) => {
  const [, actions] = ctx.get(statsStore);
  return actions.incrementLikes;
};

// =============================================================================
// Demo Components
// =============================================================================

/**
 * Demonstrates useStore(mixins([...])) - Array syntax for merging
 */
function ArraySyntaxDemo() {
  // mixins([...]): Array merges all results
  // - Direct mixins (functions returning objects) get spread
  // - Named mixins ({ key: mixin }) map keys to results
  const result = useStore(
    mixins([
      selectUserInfo, // → { userName, userEmail, setName }
      { views: selectViews }, // → { views: number }
      { likes: selectLikes, incLikes: selectIncrementLikes }, // → { likes, incLikes }
    ])
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-purple-400">
        Array Syntax with mixins()
      </h3>
      <code className="block text-xs text-zinc-500 bg-zinc-800/50 p-2 rounded">
        useStore(mixins([selectUserInfo, {"{"} views: selectViews {"}"}, ...]))
      </code>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">userName</div>
          <div className="text-purple-300 font-mono">{result.userName}</div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">userEmail</div>
          <div className="text-purple-300 font-mono text-sm truncate">
            {result.userEmail}
          </div>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="bg-zinc-800/50 rounded-lg p-3 flex-1 text-center">
          <div className="text-2xl font-bold text-blue-400">{result.views}</div>
          <div className="text-xs text-zinc-500">views</div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3 flex-1 text-center">
          <div className="text-2xl font-bold text-pink-400">{result.likes}</div>
          <div className="text-xs text-zinc-500">likes</div>
        </div>
        <button
          onClick={result.incLikes}
          className="px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-lg text-sm font-medium transition-colors"
        >
          ❤️ Like
        </button>
      </div>
    </div>
  );
}

/**
 * Demonstrates useStore(mixins({...})) - Object syntax for mapping keys
 */
function ObjectSyntaxDemo() {
  // mixins({...}): Each key maps to its mixin's return value
  // Note: "Mixin" suffix is automatically stripped from keys
  const { name, email, views, likes, incViews, incLikes } = useStore(
    mixins({
      name: (ctx: SelectorContext) => ctx.get(userStore)[0].name,
      email: (ctx: SelectorContext) => ctx.get(userStore)[0].email,
      views: selectViews,
      likes: selectLikes,
      incViews: selectIncrementViews,
      incLikes: selectIncrementLikes,
    })
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-green-400">
        Object Syntax with mixins()
      </h3>
      <code className="block text-xs text-zinc-500 bg-zinc-800/50 p-2 rounded">
        useStore(mixins({"{"} name: selectName, views: selectViews, ... {"}"}))
      </code>

      <div className="bg-zinc-800/50 rounded-lg p-4">
        <div className="text-sm text-zinc-400 mb-2">User Profile</div>
        <div className="text-lg font-semibold text-green-300">{name}</div>
        <div className="text-sm text-zinc-500">{email}</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={incViews}
          className="flex-1 px-4 py-3 bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 rounded-lg transition-colors"
        >
          <div className="text-xl font-bold text-blue-400">{views}</div>
          <div className="text-xs text-zinc-500">👁️ Add View</div>
        </button>
        <button
          onClick={incLikes}
          className="flex-1 px-4 py-3 bg-pink-600/20 border border-pink-500/30 hover:bg-pink-600/30 rounded-lg transition-colors"
        >
          <div className="text-xl font-bold text-pink-400">{likes}</div>
          <div className="text-xs text-zinc-500">❤️ Add Like</div>
        </button>
      </div>
    </div>
  );
}

/**
 * Main demo component
 */
export function MixinDemo() {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <ArraySyntaxDemo />
      <ObjectSyntaxDemo />
    </div>
  );
}
