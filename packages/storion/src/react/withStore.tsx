/**
 * withStore - Separate hooks from JSX rendering for automatic memoization.
 *
 * Separates the hook phase (always runs) from the render phase (memoized).
 * Only re-renders when hook output changes.
 *
 * ## Exposed Properties
 *
 * Every withStore result exposes its parts for reuse and testing:
 * - `Component.use(ctx, props)` - The hook function
 * - `Component.render(output)` - The render function (direct mode only)
 *
 * @example
 * // Direct usage - no ref
 * const MyComponent = withStore(
 *   (ctx, { userId }: { userId: string }) => {
 *     const [user] = ctx.get(userStore);
 *     return { name: user.name };
 *   },
 *   ({ name }) => <div>{name}</div>
 * );
 *
 * @example
 * // Direct usage - with ref (auto-detected by arity)
 * const MyInput = withStore(
 *   (ctx, { userId }: { userId: string }) => {
 *     const [user] = ctx.get(userStore);
 *     return { value: user.name };
 *   },
 *   ({ value }, ref) => <input ref={ref} value={value} />
 * );
 *
 * @example
 * // HOC usage
 * const withUserData = withStore((ctx, { userId }: { userId: string }) => {
 *   const [user] = ctx.get(userStore);
 *   return { name: user.name };
 * });
 *
 * const Profile = withUserData(({ name }) => <div>{name}</div>);
 *
 * @example
 * // ============================================================
 * // REUSABILITY PATTERNS
 * // ============================================================
 *
 * // 1. Reuse hook in another withStore component
 * const UserCard = withStore(hook, render);
 *
 * const UserCardWithAvatar = withStore(
 *   (ctx, props) => {
 *     // Reuse the existing hook logic
 *     const userData = UserCard.use(ctx, props);
 *     // Extend with additional data
 *     const [settings] = ctx.get(settingsStore);
 *     return { ...userData, showAvatar: settings.showAvatars };
 *   },
 *   ({ name, showAvatar }) => (
 *     <div>
 *       {showAvatar && <Avatar />}
 *       {name}
 *     </div>
 *   )
 * );
 *
 * // 2. Reuse render with different data source
 * const UserCard = withStore(hook, render);
 *
 * // Use same render with mock data (e.g., in Storybook)
 * export const MockUserCard = () => UserCard.render({ name: 'Mock User' });
 *
 * // 3. Compose multiple hooks
 * const UserInfo = withStore(userHook, userRender);
 * const UserStats = withStore(statsHook, statsRender);
 *
 * const FullProfile = withStore(
 *   (ctx, props) => ({
 *     user: UserInfo.use(ctx, props),
 *     stats: UserStats.use(ctx, { userId: props.userId }),
 *   }),
 *   ({ user, stats }) => (
 *     <div>
 *       {UserInfo.render(user)}
 *       {UserStats.render(stats)}
 *     </div>
 *   )
 * );
 *
 * // 4. HOC hook reuse
 * const withAuth = withStore((ctx) => {
 *   const [auth] = ctx.get(authStore);
 *   return { user: auth.currentUser, isLoggedIn: !!auth.currentUser };
 * });
 *
 * // Reuse the auth hook in another HOC
 * const withProtectedRoute = withStore((ctx, props) => {
 *   const auth = withAuth.use(ctx, {});
 *   return { ...props, ...auth, redirectTo: auth.isLoggedIn ? null : '/login' };
 * });
 *
 * @example
 * // ============================================================
 * // TESTING PATTERNS
 * // ============================================================
 *
 * const MyComponent = withStore(hook, render);
 *
 * // Test the hook separately (unit test)
 * it('should extract user name', () => {
 *   const result = MyComponent.use(mockCtx, { userId: '123' });
 *   expect(result.name).toBe('John');
 * });
 *
 * // Test the render separately (snapshot/visual test)
 * it('should render name', () => {
 *   const { getByText } = render(MyComponent.render({ name: 'John' }));
 *   expect(getByText('John')).toBeInTheDocument();
 * });
 */

import {
  memo,
  forwardRef,
  type ReactNode,
  type FC,
  type Ref,
  type ForwardRefRenderFunction,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";
import { useStore } from "./useStore";
import type { Equality, SelectorContext } from "../types";
import { resolveEquality } from "../core/equality";

export interface WithStoreOptions<TOutput extends object> {
  displayName?: string;
  /**
   * Custom equality function for comparing hook output.
   * Controls when the memoized render function re-renders.
   *
   * Note: To control input props equality, wrap the final component with memo().
   */
  equality?: Equality<TOutput>;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Hook function that receives SelectorContext and props.
 *
 * Can use:
 * - Store access via ctx.get()
 * - React hooks (useState, useEffect, useMemo, etc.)
 * - Return any values including functions
 *
 * The hook is called during render phase, so all React hooks rules apply.
 *
 * ⚠️ Limitation: Cannot use React hooks inside pick() callbacks:
 * ```tsx
 * // ❌ DON'T: React hooks inside pick callback
 * const value = ctx.pick(store, state => {
 *   const [x] = useState(0); // ❌ Error: Invalid hook call
 *   return state.value + x;
 * });
 *
 * // ✅ DO: React hooks outside pick
 * const [x] = useState(0);
 * const value = ctx.pick(store, state => state.value + x);
 * ```
 *
 * @example
 * ```tsx
 * const Component = withStore(
 *   (ctx, { userId }) => {
 *     const [user] = ctx.get(userStore);
 *     const [count, setCount] = useState(0);
 *
 *     return {
 *       userName: user.name,
 *       count,
 *       increment: () => setCount(c => c + 1), // ✅ Can return functions
 *     };
 *   },
 *   ({ userName, count, increment }) => (
 *     <div onClick={increment}>{userName}: {count}</div>
 *   )
 * );
 * ```
 */
export type WithStoreHook<TInput extends object, TOutput extends object> = (
  context: SelectorContext,
  props: TInput
) => TOutput;

/**
 * Render function without ref support.
 */
export type WithStoreRender<TOutput extends object> = (
  props: TOutput
) => ReactNode;

/**
 * Render function with ref support.
 */
export type WithStoreRenderWithRef<TOutput extends object, TRef = unknown> = (
  props: TOutput,
  ref: Ref<TRef>
) => ReactNode;

// =============================================================================
// Testing Utility Types
// =============================================================================

/**
 * Testing utilities exposed on components created with withStore(hook, render)
 */
export interface WithStoreTestUtils<
  TInput extends object,
  TOutput extends object,
  TContext = SelectorContext
> {
  /**
   * The hook function for testing.
   * Call this to test the hook logic independently.
   *
   * @example
   * ```ts
   * const result = MyComponent.use(mockCtx, { userId: '123' });
   * expect(result.name).toBe('John');
   * ```
   */
  use: (context: TContext, props: TInput) => TOutput;

  /**
   * The render function for testing.
   * Call this to test the render output independently.
   *
   * @example
   * ```tsx
   * const element = MyComponent.render({ name: 'John' });
   * // Or with testing-library:
   * render(MyComponent.render({ name: 'John' }));
   * ```
   */
  render: (props: TOutput) => ReactNode;
}

/**
 * Testing utilities exposed on HOCs created with withStore(hook)
 */
export interface WithStoreHOCTestUtils<
  TInput extends object,
  TOutput extends object,
  TContext = SelectorContext
> {
  /**
   * The hook function for testing.
   * Call this to test the hook logic independently.
   *
   * @example
   * ```ts
   * const result = withUserData.use(mockCtx, { userId: '123' });
   * expect(result.name).toBe('John');
   * ```
   */
  use: (context: TContext, props: TInput) => TOutput;
}

// =============================================================================
// Component Return Types with Test Utils
// =============================================================================

/**
 * Component type with testing utilities (no ref)
 */
export type WithStoreComponent<
  TInput extends object,
  TOutput extends object,
  TContext = SelectorContext
> = FC<TInput> & WithStoreTestUtils<TInput, TOutput, TContext>;

/**
 * Component type with testing utilities (with ref)
 */
export type WithStoreComponentWithRef<
  TInput extends object,
  TOutput extends object,
  TRef = unknown,
  TContext = SelectorContext
> = ForwardRefExoticComponent<TInput & RefAttributes<TRef>> &
  WithStoreTestUtils<TInput, TOutput, TContext>;

/**
 * HOC type with testing utilities
 */
export type WithStoreHOC<
  TInput extends object,
  TOutput extends object,
  TContext = SelectorContext
> = {
  (component: FC<TOutput>): FC<TInput>;
  <TRef = unknown>(
    component: ForwardRefRenderFunction<TRef, TOutput>
  ): ForwardRefExoticComponent<TInput & RefAttributes<TRef>>;
} & WithStoreHOCTestUtils<TInput, TOutput, TContext>;

// =============================================================================
// Generic WithStore type for createWithStore
// =============================================================================

/**
 * Generic hook type for createWithStore
 */
export type GenericWithStoreHook<
  TContext,
  TInput extends object,
  TOutput extends object
> = (context: TContext, props: TInput) => TOutput;

/**
 * WithStore function type bound to a specific context type.
 */
export interface BoundWithStore<TContext> {
  /**
   * Direct mode: Create component with hook and render function (no ref).
   */
  <TInput extends object, TOutput extends object>(
    hook: GenericWithStoreHook<TContext, TInput, TOutput>,
    render: WithStoreRender<TOutput>,
    options?: WithStoreOptions<TOutput>
  ): WithStoreComponent<TInput, TOutput, TContext>;

  /**
   * Direct mode: Create component with hook and render function (with ref).
   */
  <TInput extends object, TOutput extends object, TRef = unknown>(
    hook: GenericWithStoreHook<TContext, TInput, TOutput>,
    render: WithStoreRenderWithRef<TOutput, TRef>,
    options?: WithStoreOptions<TOutput>
  ): WithStoreComponentWithRef<TInput, TOutput, TRef, TContext>;

  /**
   * HOC mode: Create HOC that transforms props using hook.
   */
  <TInput extends object, TOutput extends object>(
    hook: GenericWithStoreHook<TContext, TInput, TOutput>,
    options?: WithStoreOptions<TOutput>
  ): WithStoreHOC<TInput, TOutput, TContext>;
}

// =============================================================================
// createWithStore - Core factory
// =============================================================================

/**
 * A reactive hook that accepts a selector and returns the selected value.
 * Similar to useStore's signature.
 */
export type UseContextHook<TContext> = <T extends object>(
  selector: (ctx: TContext) => T
) => T;

/**
 * Create a withStore function bound to a custom reactive hook.
 *
 * This is the core building block for creating withStore-like patterns with custom contexts.
 * Useful for single-store apps or custom store patterns.
 *
 * @example
 * ```tsx
 * // For single-store apps with create()
 * const [counter, useCounter] = create({
 *   state: { count: 0 },
 *   setup({ state }) {
 *     return { increment: () => state.count++ };
 *   }
 * });
 *
 * // Create withStore bound to this store's hook
 * const withCounter = createWithStore(useCounter);
 *
 * // Direct mode - hook receives (state, actions) instead of SelectorContext
 * const Display = withCounter(
 *   (state, actions, props: { multiplier: number }) => ({
 *     count: state.count * props.multiplier,
 *     increment: actions.increment,
 *   }),
 *   ({ count, increment }) => <button onClick={increment}>{count}</button>
 * );
 *
 * // HOC mode
 * const withData = withCounter((state) => ({
 *   value: state.count,
 * }));
 * const ValueDisplay = withData(({ value }) => <div>{value}</div>);
 * ```
 *
 * @param useContextHook - A reactive hook that accepts a selector (like useStore or useCreatedStore)
 * @returns A withStore function bound to the custom context
 */
export function createWithStore<TContext>(
  useContextHook: UseContextHook<TContext>
): BoundWithStore<TContext> {
  return function boundWithStore<TInput extends object, TOutput extends object>(
    hook: GenericWithStoreHook<TContext, TInput, TOutput>,
    renderOrOptions?:
      | ((props: TOutput, ref?: any) => ReactNode)
      | WithStoreOptions<TOutput>,
    maybeOptions?: WithStoreOptions<TOutput>
  ): any {
    const render =
      typeof renderOrOptions === "function" ? renderOrOptions : undefined;
    const options = render
      ? maybeOptions
      : (renderOrOptions as WithStoreOptions<TOutput> | undefined);

    const equalityFn = options?.equality
      ? resolveEquality(options.equality)
      : undefined;
    const customDisplayName = options?.displayName;

    // Direct mode: hook + render provided
    if (render) {
      // Auto-detect ref support based on function arity
      if (render.length >= 2) {
        // Render function expects ref (2nd parameter)
        const WrappedComponent = forwardRef(((props: TInput, ref: any) => {
          // Run hook INSIDE the reactive context for proper tracking
          const output = useContextHook((ctx) => hook(ctx, props));
          return render(output, ref);
        }) as any);

        const MemoizedComponent = equalityFn
          ? (memo(WrappedComponent as any, (prev: any, next: any) =>
              equalityFn(prev, next)
            ) as any)
          : (memo(WrappedComponent as any) as any);

        if (customDisplayName) {
          MemoizedComponent.displayName = customDisplayName;
        }

        MemoizedComponent.use = hook;
        MemoizedComponent.render = (props: TOutput) =>
          render(props, null as any);

        return MemoizedComponent;
      }

      // Normal component (no ref)
      const MemoizedRender = equalityFn
        ? (memo(render as WithStoreRender<TOutput>, (prev: any, next: any) =>
            equalityFn(prev, next)
          ) as any)
        : (memo(render as WithStoreRender<TOutput>) as any);

      const WrappedComponent: FC<TInput> = (props: TInput) => {
        // Run hook INSIDE the reactive context for proper tracking
        const output = useContextHook((ctx) => hook(ctx, props));
        return <MemoizedRender {...output} />;
      };

      if (customDisplayName) {
        WrappedComponent.displayName = customDisplayName;
      }

      (WrappedComponent as any).use = hook;
      (WrappedComponent as any).render = render as (
        props: TOutput
      ) => ReactNode;

      return WrappedComponent;
    }

    // HOC mode: only hook provided
    const hoc = ((Component: any) => {
      const isForwardRef =
        Component.$$typeof === Symbol.for("react.forward_ref");
      const componentDisplayName = Component.displayName || Component.name;
      const finalDisplayName =
        customDisplayName ||
        (componentDisplayName
          ? `withStore(${componentDisplayName})`
          : undefined);

      if (isForwardRef || Component.length >= 2) {
        // Component expects ref
        const WrappedComponent = forwardRef(((props: TInput, ref: any) => {
          // Run hook INSIDE the reactive context for proper tracking
          const output = useContextHook((ctx) => hook(ctx, props));
          return isForwardRef ? (
            <Component {...output} ref={ref} />
          ) : (
            Component(output, ref)
          );
        }) as any);

        const MemoizedComponent = equalityFn
          ? (memo(WrappedComponent as any, (prev: any, next: any) =>
              equalityFn(prev, next)
            ) as any)
          : (memo(WrappedComponent as any) as any);

        if (finalDisplayName) {
          MemoizedComponent.displayName = finalDisplayName;
        }

        return MemoizedComponent;
      }

      // Normal component (no ref)
      const MemoizedComponent = equalityFn
        ? (memo(Component as FC<TOutput>, (prev: any, next: any) =>
            equalityFn(prev, next)
          ) as any)
        : (memo(Component as FC<TOutput>) as any);

      const WrappedComponent = (props: TInput) => {
        // Run hook INSIDE the reactive context for proper tracking
        const output = useContextHook((ctx) => hook(ctx, props));
        return <MemoizedComponent {...output} />;
      };

      if (finalDisplayName) {
        WrappedComponent.displayName = finalDisplayName;
      }

      return WrappedComponent;
    }) as WithStoreHOC<TInput, TOutput, TContext>;

    hoc.use = hook;

    return hoc;
  };
}

// =============================================================================
// withStore - Built on createWithStore
// =============================================================================

// Create the standard withStore bound to SelectorContext via useStore
// useStore already has the signature: <T>(selector: (ctx: SelectorContext) => T) => T
const boundWithStore = createWithStore<SelectorContext>(useStore);

// =============================================================================
// Overloads for withStore (keep existing signatures for backwards compatibility)
// =============================================================================

/**
 * Direct mode: Create component with hook and render function (no ref).
 * Returns component with `use` and `render` properties for testing.
 */
export function withStore<TInput extends object, TOutput extends object>(
  hook: WithStoreHook<TInput, TOutput>,
  render: WithStoreRender<TOutput>,
  options?: WithStoreOptions<TOutput>
): WithStoreComponent<TInput, TOutput>;

/**
 * Direct mode: Create component with hook and render function (with ref).
 * Automatically detected when render function has 2 parameters.
 * Returns component with `use` and `render` properties for testing.
 */
export function withStore<
  TInput extends object,
  TOutput extends object,
  TRef = unknown
>(
  hook: WithStoreHook<TInput, TOutput>,
  render: WithStoreRenderWithRef<TOutput, TRef>,
  options?: WithStoreOptions<TOutput>
): WithStoreComponentWithRef<TInput, TOutput, TRef>;

/**
 * HOC mode: Create HOC that transforms props using hook.
 * Returns a function that accepts a component, with `use` property for testing.
 */
export function withStore<TInput extends object, TOutput extends object>(
  hook: WithStoreHook<TInput, TOutput>,
  options?: WithStoreOptions<TOutput>
): WithStoreHOC<TInput, TOutput>;

// =============================================================================
// Implementation - delegate to boundWithStore
// =============================================================================

export function withStore<TInput extends object, TOutput extends object>(
  hook: WithStoreHook<TInput, TOutput>,
  renderOrOptions?:
    | ((props: TOutput, ref?: any) => ReactNode)
    | WithStoreOptions<TOutput>,
  maybeOptions?: WithStoreOptions<TOutput>
): any {
  return (boundWithStore as any)(hook, renderOrOptions, maybeOptions);
}
