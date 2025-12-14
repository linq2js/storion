import React from "react";
import { PropsWithChildren, StrictMode } from "react";
import { render, renderHook, RenderHookOptions } from "@testing-library/react";

const DefaultWrapper = ({ children }: PropsWithChildren) => <>{children}</>;

/**
 * Composes two React wrapper components.
 * OuterWrapper wraps InnerWrapper which wraps children.
 */
function composeWrappers(
  OuterWrapper: React.ComponentType<{ children: React.ReactNode }>,
  InnerWrapper?: React.ComponentType<{ children: React.ReactNode }>
): React.ComponentType<{ children: React.ReactNode }> {
  if (!InnerWrapper) {
    return OuterWrapper;
  }

  return function ComposedWrapper({ children }: { children: React.ReactNode }) {
    return (
      <OuterWrapper>
        <InnerWrapper>{children}</InnerWrapper>
      </OuterWrapper>
    );
  };
}

const StrictModeWrapper = ({ children }: PropsWithChildren) => (
  <StrictMode>{children}</StrictMode>
);

export const wrappers: {
  mode: "normal" | "strict";
  Wrapper: React.FC<{ children: React.ReactNode }>;
  render: (ui: React.ReactElement) => ReturnType<typeof render>;
  renderHook: <TResult, TProps>(
    render: (props: TProps) => TResult,
    options?: RenderHookOptions<TProps>
  ) => ReturnType<typeof renderHook<TResult, TProps>>;
}[] = [
  {
    mode: "normal" as const,
    Wrapper: DefaultWrapper,
    render: (ui: React.ReactElement) => {
      return render(ui, { wrapper: DefaultWrapper });
    },
    renderHook: <TResult, TProps>(
      callback: (props: TProps) => TResult,
      options?: RenderHookOptions<TProps>
    ) => {
      return renderHook(callback, options);
    },
  },
  {
    mode: "strict" as const,
    Wrapper: StrictModeWrapper,
    render: (ui: React.ReactElement) => {
      return render(ui, { wrapper: StrictModeWrapper });
    },
    renderHook: <TResult, TProps>(
      callback: (props: TProps) => TResult,
      options?: RenderHookOptions<TProps>
    ) => {
      const composedWrapper = composeWrappers(
        StrictModeWrapper,
        options?.wrapper
      );
      return renderHook(callback, { ...options, wrapper: composedWrapper });
    },
  },
];
