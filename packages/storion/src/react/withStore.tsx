/**
 * withStore - Separate hooks from JSX rendering for automatic memoization.
 *
 * Separates the hook phase (always runs) from the render phase (memoized).
 * Only re-renders when hook output changes.
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
// Overloads
// =============================================================================

/**
 * Direct mode: Create component with hook and render function (no ref).
 */
export function withStore<TInput extends object, TOutput extends object>(
  hook: WithStoreHook<TInput, TOutput>,
  render: WithStoreRender<TOutput>,
  options?: WithStoreOptions<TOutput>
): FC<TInput>;

/**
 * Direct mode: Create component with hook and render function (with ref).
 * Automatically detected when render function has 2 parameters.
 */
export function withStore<
  TInput extends object,
  TOutput extends object,
  TRef = unknown
>(
  hook: WithStoreHook<TInput, TOutput>,
  render: WithStoreRenderWithRef<TOutput, TRef>,
  options?: WithStoreOptions<TOutput>
): ForwardRefExoticComponent<TInput & RefAttributes<TRef>>;

/**
 * HOC mode: Create HOC that transforms props using hook.
 * Returns a function that accepts a component.
 */
export function withStore<TInput extends object, TOutput extends object>(
  hook: WithStoreHook<TInput, TOutput>,
  options?: WithStoreOptions<TOutput>
): {
  (component: FC<TOutput>): FC<TInput>;
  <TRef = unknown>(
    component: ForwardRefRenderFunction<TRef, TOutput>
  ): ForwardRefExoticComponent<TInput & RefAttributes<TRef>>;
};

// =============================================================================
// Implementation
// =============================================================================

export function withStore<TInput extends object, TOutput extends object>(
  hook: WithStoreHook<TInput, TOutput>,
  renderOrOptions?:
    | ((props: TOutput, ref?: any) => ReactNode)
    | WithStoreOptions<TOutput>,
  maybeOptions?: WithStoreOptions<TOutput>
): any {
  // Determine if it's direct mode (render function) or HOC mode (options or nothing)
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
      const MemoizedRender = equalityFn
        ? (memo(forwardRef(render as any), (prev: any, next: any) =>
            equalityFn(prev, next)
          ) as any)
        : (memo(forwardRef(render as any)) as any);

      const WrappedComponent = forwardRef(((props: TInput, ref: any) => {
        const output = useStore((ctx) => hook(ctx, props)) as any;
        return <MemoizedRender {...output} ref={ref} />;
      }) as any) as any;

      if (customDisplayName) {
        WrappedComponent.displayName = customDisplayName;
      }

      return WrappedComponent;
    }

    // Normal component (no ref)
    const MemoizedRender = equalityFn
      ? (memo(render as WithStoreRender<TOutput>, (prev: any, next: any) =>
          equalityFn(prev, next)
        ) as any)
      : (memo(render as WithStoreRender<TOutput>) as any);

    const WrappedComponent: FC<TInput> = (props: TInput) => {
      const output = useStore((ctx) => hook(ctx, props)) as any;
      return <MemoizedRender {...output} />;
    };

    if (customDisplayName) {
      WrappedComponent.displayName = customDisplayName;
    }

    return WrappedComponent;
  }

  // HOC mode: only hook provided, return function that accepts component
  return (Component: any) => {
    // Auto-detect if Component is a forwardRef component
    // Check if it's already a forwardRef (has $$typeof)
    const isForwardRef = Component.$$typeof === Symbol.for("react.forward_ref");
    const componentDisplayName = Component.displayName || Component.name;
    const finalDisplayName =
      customDisplayName ||
      (componentDisplayName ? `withStore(${componentDisplayName})` : undefined);

    if (isForwardRef || Component.length >= 2) {
      // Component expects ref
      const MemoizedComponent = equalityFn
        ? (memo(
            isForwardRef ? Component : forwardRef(Component as any),
            (prev: any, next: any) => equalityFn(prev, next)
          ) as any)
        : (memo(
            isForwardRef ? Component : forwardRef(Component as any)
          ) as any);

      const WrappedComponent = forwardRef(((props: TInput, ref: any) => {
        const output = useStore((ctx) => hook(ctx, props)) as any;
        return <MemoizedComponent {...output} ref={ref} />;
      }) as any) as any;

      if (finalDisplayName) {
        WrappedComponent.displayName = finalDisplayName;
      }

      return WrappedComponent;
    }

    // Normal component (no ref)
    const MemoizedComponent = equalityFn
      ? (memo(Component as FC<TOutput>, (prev: any, next: any) =>
          equalityFn(prev, next)
        ) as any)
      : (memo(Component as FC<TOutput>) as any);

    const WrappedComponent = (props: TInput) => {
      const output = useStore((ctx) => hook(ctx, props)) as any;
      return <MemoizedComponent {...output} />;
    };

    if (finalDisplayName) {
      WrappedComponent.displayName = finalDisplayName;
    }

    return WrappedComponent;
  };
}
