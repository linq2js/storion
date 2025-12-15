/**
 * Type checking tests - this file is only for TypeScript compilation checks.
 * It verifies that types work correctly with overloads and keyof constraints.
 *
 * To run: `pnpm tsc --noEmit`
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { store, container, effect } from "./index";
// =============================================================================
// Test Store Definition
// =============================================================================

const testStore = store({
  state: {
    count: 0,
    name: "",
    items: [] as string[],
    active: false,
  },
  setup({ state }) {
    return {
      increment(by = 1) {
        state.count += by;
      },
      setName(name: string) {
        state.name = name;
      },
      addItem(item: string) {
        state.items = [...state.items, item];
      },
      reset() {
        state.count = 0;
        state.name = "";
        state.items = [];
      },
    };
  },
});

const stores = container();
const instance = stores.get(testStore);

// =============================================================================
// subscribe() Overloads - State Properties
// =============================================================================

// Overload 1: subscribe(listener) - all state changes
{
  const unsub = instance.subscribe(() => {
    console.log("state changed");
  });
  unsub();
}

// Overload 2: subscribe(propKey, listener) - specific property
{
  // ✅ Valid property keys with correct types
  instance.subscribe("count", ({ next, prev }) => {
    // next and prev are typed based on property
    console.log(next, prev);
  });

  instance.subscribe("name", ({ next, prev }) => {
    console.log(next, prev);
  });

  instance.subscribe("items", ({ next, prev }) => {
    console.log(next, prev);
  });

  instance.subscribe("active", ({ next, prev }) => {
    console.log(next, prev);
  });
}

// =============================================================================
// subscribe() Overloads - Action Dispatches
// =============================================================================

// Overload 3: subscribe('@actionName', listener) - specific action
{
  // ✅ Valid action keys with @ prefix
  instance.subscribe("@increment", ({ next, prev }) => {
    console.log(`increment called ${next.nth} times with args:`, next.args);
    console.log("prev:", prev);
  });

  instance.subscribe("@setName", ({ next }) => {
    console.log(`setName: ${next.name}`, next.args);
  });

  instance.subscribe("@addItem", ({ next }) => {
    console.log(`addItem:`, next.args);
  });

  instance.subscribe("@reset", ({ next }) => {
    console.log(`reset: nth=${next.nth}`);
  });
}

// Overload 4: subscribe('@*', listener) - all actions (wildcard)
{
  instance.subscribe("@*", ({ next, prev }) => {
    console.log(`Action ${String(next.name)} dispatched (nth: ${next.nth})`);
    console.log("prev:", prev);
  });
}

// =============================================================================
// dirty() Overloads
// =============================================================================

{
  // Overload 1: dirty() - check all
  const isDirty: boolean = instance.dirty();
  console.log(isDirty);

  // Overload 2: dirty(prop) - check specific property
  const countDirty: boolean = instance.dirty("count");
  const nameDirty: boolean = instance.dirty("name");
  const itemsDirty: boolean = instance.dirty("items");
  const activeDirty: boolean = instance.dirty("active");
  console.log(countDirty, nameDirty, itemsDirty, activeDirty);
}

// =============================================================================
// ReactiveActions - action.last()
// =============================================================================

{
  const actions = instance.actions;

  // ✅ Call actions normally
  actions.increment();
  actions.increment(5);
  actions.setName("test");
  actions.addItem("item");
  actions.reset();

  // ✅ Get last invocation with .last()
  const incrementLast = actions.increment.last();
  if (incrementLast) {
    console.log(
      `increment: name=${String(incrementLast.name)}, nth=${incrementLast.nth}`
    );
    console.log("args:", incrementLast.args);
  }

  const setNameLast = actions.setName.last();
  if (setNameLast) {
    console.log("setName args:", setNameLast.args);
  }

  const resetLast = actions.reset.last();
  if (resetLast) {
    console.log("reset args:", resetLast.args);
  }
}

// =============================================================================
// Effect with action.last() reactive tracking
// =============================================================================

{
  effect(() => {
    const invocation = instance.actions.increment.last();
    if (!invocation) return;

    // Types are correct
    console.log(`nth: ${invocation.nth}, args:`, invocation.args);
  });

  // Compose multiple action triggers
  effect(() => {
    const inc = instance.actions.increment.last();
    const reset = instance.actions.reset.last();

    if (!inc || !reset) return;

    // Both have been called
    console.log(`increment: ${inc.nth}, reset: ${reset.nth}`);
  });
}

// =============================================================================
// StoreOptions.equality keyof constraint
// =============================================================================

{
  // Per-property equality configuration
  const storeWithEquality = store({
    state: {
      a: 1,
      b: "string",
      c: { nested: true },
      d: [1, 2, 3],
    },
    equality: {
      a: "strict",
      b: "shallow",
      c: "deep",
      d: "shallow",
      default: "strict",
    },
    setup: () => ({}),
  });

  // Single equality for all props
  const storeWithSingleEquality = store({
    state: { count: 0, name: "" },
    equality: "shallow",
    setup: () => ({}),
  });

  console.log(storeWithEquality, storeWithSingleEquality);
}

// =============================================================================
// onDispatch callback with nth
// =============================================================================

{
  const storeWithDispatch = store({
    state: { count: 0 },
    onDispatch(event) {
      // event has name, args, and nth
      console.log(`Action: ${String(event.name)}, nth: ${event.nth}`);
      console.log("args:", event.args);
    },
    setup: () => ({
      increment() {},
      decrement() {},
    }),
  });

  console.log(storeWithDispatch);
}

// =============================================================================
// StoreInstance type inference
// =============================================================================

{
  // Type is correctly inferred from store definition
  const myStore = store({
    state: { value: 42 },
    setup: () => ({
      setValue: (_v: number) => {},
    }),
  });

  const c = container();
  const inst = c.get(myStore);

  // State is readonly
  const state = inst.state;
  const value: number = state.value;
  console.log(value);

  // Actions are callable with .last()
  inst.actions.setValue(100);
  const last = inst.actions.setValue.last();
  if (last) {
    console.log(`setValue nth=${last.nth}`);
  }
}

// =============================================================================
// dehydrate/hydrate
// =============================================================================

{
  const data = instance.dehydrate();
  console.log(data);

  instance.hydrate({ count: 10, name: "restored" });
}

// =============================================================================
// normalize/denormalize options
// =============================================================================

{
  const storeWithNormalize = store({
    state: {
      date: null as Date | null,
      items: new Set<string>(),
    },
    normalize: (state) => ({
      date: state.date?.toISOString() ?? null,
      items: [...state.items],
    }),
    denormalize: (data) => ({
      date: data.date ? new Date(data.date as string) : null,
      items: new Set(data.items as string[]),
    }),
    setup: () => ({}),
  });

  console.log(storeWithNormalize);
}

// =============================================================================
// meta option
// =============================================================================

{
  const storeWithMeta = store({
    state: { count: 0 },
    meta: {
      // StoreMeta is empty by default, but extensible
    },
    setup: () => ({}),
  });

  console.log(storeWithMeta);
}

console.log("Type checks passed!");
