/**
 * stable() - HOC for automatic prop stabilization.
 *
 * Wraps any component to automatically stabilize function and Date prop references,
 * preventing unnecessary re-renders in memoized children.
 *
 * ## Key Features
 *
 * - **Auto-stabilizes functions**: Creates stable wrappers that always call latest
 * - **Auto-stabilizes Dates**: Compares dates by timestamp (getTime())
 * - **Custom equality per prop**: Specify "shallow", "deep", or custom function
 * - **Always wraps with forwardRef**: Works with any component type
 *
 * ## How It Works
 *
 * For function props: Creates a stable wrapper function that always calls the
 * latest function from props. The wrapper reference never changes, but it always
 * invokes the current function. This is the same pattern used in useStore().
 *
 * For other props: If the new value equals the previous value (according to the
 * configured equality), the previous reference is kept.
 *
 * @example
 * ```tsx
 * // Basic usage - auto-stabilizes functions and dates
 * const StableButton = stable(({ onClick, date }) => (
 *   <button onClick={onClick}>{date.toDateString()}</button>
 * ));
 *
 * // Now inline functions and new Date objects won't cause re-renders
 * <StableButton onClick={() => doSomething()} date={new Date()} />
 * ```
 *
 * @example
 * ```tsx
 * // Custom equality for specific props
 * const StableList = stable(
 *   ({ items, onSelect }) => (
 *     <ul>
 *       {items.map(item => (
 *         <li key={item.id} onClick={() => onSelect(item)}>{item.name}</li>
 *       ))}
 *     </ul>
 *   ),
 *   {
 *     items: "shallow",  // Use shallow equality for items array
 *   }
 * );
 * ```
 *
 * @example
 * ```tsx
 * // Works with forwardRef components
 * const Input = forwardRef<HTMLInputElement, { onFocus: () => void }>(
 *   ({ onFocus }, ref) => <input ref={ref} onFocus={onFocus} />
 * );
 * const StableInput = stable(Input);
 *
 * // Ref is properly forwarded
 * const inputRef = useRef<HTMLInputElement>(null);
 * <StableInput ref={inputRef} onFocus={() => track("focus")} />
 * ```
 *
 * @example
 * ```tsx
 * // Combine with memoized children to prevent cascade re-renders
 * const ExpensiveChild = memo(({ onClick }) => {
 *   // expensive render
 *   return <button onClick={onClick}>Click</button>;
 * });
 *
 * const Parent = stable(({ onClick }) => (
 *   <ExpensiveChild onClick={onClick} />
 * ));
 *
 * // Parent re-renders but ExpensiveChild doesn't because onClick is stabilized
 * ```
 */

import {
  forwardRef,
  useState,
  type ComponentType,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type ForwardRefRenderFunction,
  type Ref,
} from "react";
import type { Equality } from "../types";
import { tryStabilize, resolveEquality } from "../core/equality";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for per-prop equality checking.
 *
 * @example
 * ```tsx
 * stable(Component, {
 *   data: "shallow",           // Use shallow equality
 *   items: "deep",             // Use deep equality
 *   config: (a, b) => a.id === b.id,  // Custom equality
 * })
 * ```
 */
export type PropEqualityConfig<TProps extends object> = {
  [K in keyof TProps]?: Equality<TProps[K]>;
};

/**
 * Internal refs for stable component.
 * Uses { value: T } containers for tryStabilize compatibility.
 */
interface StableRefs {
  /** Previous values (containers for tryStabilize) */
  prevValues: Map<string, { value: unknown }>;
  /** Resolved equality functions per key */
  equalityFns: Map<string, (a: unknown, b: unknown) => boolean>;
}

// =============================================================================
// Main stable() function
// =============================================================================

/**
 * Wrap a component with automatic prop stabilization.
 *
 * @param Component - The component to wrap (function component, forwardRef, or render function)
 * @param customEquality - Optional per-prop equality configuration
 * @returns A forwardRef component with stabilized props
 */
export function stable<TProps extends object, TRef = unknown>(
  Component: ComponentType<TProps> | ForwardRefRenderFunction<TRef, TProps>,
  customEquality?: PropEqualityConfig<NoInfer<TProps>>
): ForwardRefExoticComponent<TProps & RefAttributes<TRef>> {
  // Check if the component is already a forwardRef
  const isForwardRefComponent =
    (Component as any).$$typeof === Symbol.for("react.forward_ref");

  // Check if it's a render function that expects ref (arity >= 2)
  const expectsRef =
    isForwardRefComponent ||
    (typeof Component === "function" && Component.length >= 2);

  // Create the wrapper component
  const StableComponent = forwardRef<TRef, TProps>((props, ref) => {
    // Cast needed: forwardRef gives PropsWithoutRef<TProps>, but ref is handled separately
    const inputProps = props as TProps;

    // Initialize refs once (stable across renders)
    const [refs] = useState<StableRefs>(() => ({
      prevValues: new Map(),
      equalityFns: new Map(),
    }));

    // Build stable props using tryStabilize for each key
    const stableProps = {} as TProps;

    for (const key of Object.keys(inputProps) as Array<keyof TProps>) {
      const keyStr = key as string;
      const value = inputProps[key];

      // Get or create resolved equality function for this key
      if (!refs.equalityFns.has(keyStr)) {
        const equalityConfig = customEquality?.[key] as
          | Equality<unknown>
          | undefined;
        refs.equalityFns.set(keyStr, resolveEquality(equalityConfig));
      }
      const equalityFn = refs.equalityFns.get(keyStr)!;

      // Get previous value container (undefined if first time)
      const prev = refs.prevValues.get(keyStr);

      // Stabilize: handles both functions (stable wrapper) and values (equality)
      const [stableValue] = tryStabilize(prev, value, equalityFn);
      (stableProps as any)[key] = stableValue;

      // Store for next render
      if (prev) {
        prev.value = stableValue;
      } else {
        refs.prevValues.set(keyStr, { value: stableValue });
      }
    }

    // Render based on component type
    if (isForwardRefComponent) {
      // It's a forwardRef component, pass ref as prop
      const Comp = Component as ComponentType<TProps & { ref?: Ref<TRef> }>;
      return <Comp {...stableProps} ref={ref as Ref<TRef>} />;
    }

    if (expectsRef) {
      // It's a render function that expects ref as second argument
      return (Component as ForwardRefRenderFunction<TRef, TProps>)(
        stableProps,
        ref
      );
    }

    // Regular function component (no ref)
    const Comp = Component as ComponentType<TProps>;
    return <Comp {...stableProps} />;
  });

  // Set display name for debugging
  const componentName =
    (Component as any).displayName || (Component as any).name || "Component";
  StableComponent.displayName = `Stable(${componentName})`;

  return StableComponent as ForwardRefExoticComponent<
    TProps & RefAttributes<TRef>
  >;
}
