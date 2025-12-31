/**
 * Tests to investigate render loops with multiple useStore calls.
 * 
 * Hypothesis B: Two useStore calls in same component may cause render loop.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { wrappers } from "./strictModeTest";
import { StoreProvider } from "./context";
import { useStore } from "./useStore";
import { store } from "../core/store";
import { container } from "../core/container";
import { trigger } from "../trigger";
import { async } from "../async";
import { mixins } from "../core/mixins";
import { SelectorContext } from "../types";

describe.each(wrappers)(
  "useStore render loop investigation ($mode mode)",
  ({ mode, render, renderHook }) => {
    const createWrapper = (stores: ReturnType<typeof container>) => {
      return ({ children }: { children: React.ReactNode }) => (
        <StoreProvider container={stores}>{children}</StoreProvider>
      );
    };

    describe("Hypothesis B: Two useStore calls causing render loop", () => {
      it("should NOT cause infinite re-renders with two separate useStore calls", () => {
        const globalStore = store({
          name: "global",
          state: { value: 0 },
          setup: () => ({}),
        });

        const localStore = store({
          name: "local",
          state: { localValue: "" },
          setup: ({ state }) => ({
            setLocal: (v: string) => {
              state.localValue = v;
            },
          }),
        });

        const stores = container();
        let renderCount = 0;

        const { result, rerender } = renderHook(
          () => {
            renderCount++;

            // First useStore call
            const { globalValue } = useStore(({ get }) => {
              const [state] = get(globalStore);
              return { globalValue: state.value };
            });

            // Second useStore call with scoped
            const { localValue, setLocal } = useStore(({ scoped }) => {
              const [state, actions] = scoped(localStore);
              return { localValue: state.localValue, setLocal: actions.setLocal };
            });

            return { globalValue, localValue, setLocal };
          },
          { wrapper: createWrapper(stores) }
        );

        // Allow for StrictMode double-render
        const initialRenderCount = renderCount;
        console.log(`Initial render count: ${initialRenderCount}`);
        
        // Render count should stabilize (not continue indefinitely)
        // In StrictMode: 2-4 renders expected
        // In Normal mode: 1-2 renders expected
        expect(initialRenderCount).toBeLessThanOrEqual(mode === "strict" ? 4 : 2);

        // Rerender should not explode
        const beforeRerender = renderCount;
        rerender();
        const afterRerender = renderCount;
        
        console.log(`Before rerender: ${beforeRerender}, After: ${afterRerender}`);
        
        // One rerender should only add 1-2 render calls (not 40!)
        expect(afterRerender - beforeRerender).toBeLessThanOrEqual(mode === "strict" ? 2 : 1);
      });

      it("should NOT cause infinite re-renders with inline mixin functions + scoped pattern", () => {
        const store1 = store({
          name: "store1",
          state: { count: 0 },
          setup: () => ({}),
        });

        const store2 = store({
          name: "store2",
          state: { name: "test" },
          setup: () => ({}),
        });

        const localStore = store({
          name: "local",
          state: { value: "local" },
          setup: ({ state }) => ({
            setValue: (v: string) => {
              state.value = v;
            },
          }),
        });

        // Mixin functions defined outside component
        const countMixin = (ctx: SelectorContext) => {
          const [state] = ctx.get(store1);
          return state.count;
        };

        const nameMixin = (ctx: SelectorContext) => {
          const [state] = ctx.get(store2);
          return state.name;
        };

        const stores = container();
        let renderCount = 0;

        const { result } = renderHook(
          () => {
            renderCount++;
            console.log(`Render #${renderCount}`);

            // First useStore with inline mixin calls
            const { count, name } = useStore((ctx) => ({
              count: countMixin(ctx),
              name: nameMixin(ctx),
            }));

            // Second useStore with scoped (like flag-ceremony badge pattern)
            const { localValue, setValue } = useStore(({ scoped }) => {
              const [state, actions] = scoped(localStore);
              return { localValue: state.value, setValue: actions.setValue };
            });

            return { count, name, localValue, setValue };
          },
          { wrapper: createWrapper(stores) }
        );

        // Should stabilize - not explode to 40+ renders
        console.log(`Final render count: ${renderCount}`);
        expect(renderCount).toBeLessThanOrEqual(mode === "strict" ? 6 : 3);
      });

      it("should count renders accurately with async-like state", async () => {
        // Simulate async state like rankingMixin
        const asyncStore = store({
          name: "async",
          state: { 
            status: "idle" as "idle" | "pending" | "success",
            data: null as { value: number } | null,
          },
          setup: ({ state }) => ({
            setPending: () => {
              state.status = "pending";
            },
            setSuccess: (value: number) => {
              state.status = "success";
              state.data = { value };
            },
          }),
        });

        const localStore = store({
          name: "local",
          state: { formValue: "" },
          setup: ({ state }) => ({
            setForm: (v: string) => {
              state.formValue = v;
            },
          }),
        });

        const stores = container();
        const asyncInstance = stores.get(asyncStore);
        let renderCount = 0;

        const { result, rerender } = renderHook(
          () => {
            renderCount++;

            // Simulate mixins pattern with async state
            const { status, data } = useStore(({ get }) => {
              const [state] = get(asyncStore);
              return { status: state.status, data: state.data };
            });

            // Scoped local store
            const { formValue, setForm } = useStore(({ scoped }) => {
              const [state, actions] = scoped(localStore);
              return { formValue: state.formValue, setForm: actions.setForm };
            });

            return { status, data, formValue, setForm };
          },
          { wrapper: createWrapper(stores) }
        );

        const initialCount = renderCount;
        console.log(`Initial renders: ${initialCount}`);

        // Simulate async state transitions (like ranking fetch)
        act(() => {
          asyncInstance.actions.setPending();
        });

        const afterPending = renderCount;
        console.log(`After pending: ${afterPending}`);

        act(() => {
          asyncInstance.actions.setSuccess(42);
        });

        const afterSuccess = renderCount;
        console.log(`After success: ${afterSuccess}`);

        // Total renders should be reasonable (not 40+)
        // Expected: initial (1-4) + pending transition (1-2) + success transition (1-2)
        expect(afterSuccess).toBeLessThanOrEqual(mode === "strict" ? 12 : 6);
      });

      it("should NOT cause render loop with trigger() inside mixin (flag-ceremony pattern)", async () => {
        // Exact pattern from flag-ceremony: async store with trigger in mixin
        const leaderboardStore = store({
          name: "leaderboard",
          state: {
            ranking: async.stale<{ percentile: number } | null>(),
          },
          setup: ({ focus }) => {
            const rankingAction = async.action(
              focus("ranking"),
              async () => {
                // Simulate API delay
                await new Promise((r) => setTimeout(r, 50));
                return { percentile: 95 };
              }
            );

            return {
              fetchRanking: rankingAction.dispatch,
            };
          },
        });

        // Mixin that uses trigger (like rankingMixin in flag-ceremony)
        const rankingMixin = ({ get }: SelectorContext) => {
          const [state, { fetchRanking }] = get(leaderboardStore);
          trigger(fetchRanking); // THIS is the pattern we're testing
          return state.ranking;
        };

        // Local store for scoped pattern
        const badgeStore = store({
          name: "badge",
          state: { badgeType: "minimalist" },
          setup: ({ state }) => ({
            setBadgeType: (type: string) => {
              state.badgeType = type;
            },
          }),
        });

        const stores = container();
        let renderCount = 0;

        const { result } = renderHook(
          () => {
            renderCount++;
            console.log(`Render #${renderCount}`);

            // First useStore with trigger in mixin (like flag-ceremony)
            const ranking = useStore((ctx) => {
              return { ranking: rankingMixin(ctx) };
            });

            // Second useStore with scoped (like flag-ceremony badge pattern)
            const { badgeType, setBadgeType } = useStore(({ scoped }) => {
              const [state, actions] = scoped(badgeStore);
              return { badgeType: state.badgeType, setBadgeType: actions.setBadgeType };
            });

            return { ...ranking, badgeType, setBadgeType };
          },
          { wrapper: createWrapper(stores) }
        );

        // Wait for async action to complete
        await new Promise((r) => setTimeout(r, 100));

        const finalRenderCount = renderCount;
        console.log(`Final render count: ${finalRenderCount}`);

        // Should NOT be 40+ renders - that's the bug!
        // Expected: initial (1-4) + async transition (1-2)
        expect(finalRenderCount).toBeLessThanOrEqual(mode === "strict" ? 10 : 5);
        
        // After stabilization, ranking should be success
        expect(result.current.ranking.status).toBe("success");
      });

      it("should NOT cause render loop with mixins() wrapper + trigger (exact flag-ceremony pattern)", async () => {
        // Exact stores from flag-ceremony
        const leaderboardStore = store({
          name: "leaderboard",
          state: {
            ranking: async.stale<{ percentile: number } | null>(),
          },
          setup: ({ focus }) => {
            const rankingAction = async.action(
              focus("ranking"),
              async () => {
                await new Promise((r) => setTimeout(r, 50));
                return { percentile: 95 };
              }
            );
            return { fetchRanking: rankingAction.dispatch };
          },
        });

        const ceremonyStore = store({
          name: "ceremony",
          state: {
            currentStreak: 5,
            longestStreak: 10,
            totalCeremonies: 100,
          },
          setup: () => ({}),
        });

        const badgeStore = store({
          name: "badge",
          state: { badgeType: "minimalist" },
          setup: ({ state }) => ({
            setBadgeType: (type: string) => {
              state.badgeType = type;
            },
          }),
        });

        // Mixins exactly like flag-ceremony
        const currentStreakMixin = ({ get }: SelectorContext) => {
          const [state] = get(ceremonyStore);
          return state.currentStreak;
        };

        const longestStreakMixin = ({ get }: SelectorContext) => {
          const [state] = get(ceremonyStore);
          return state.longestStreak;
        };

        const totalCeremoniesMixin = ({ get }: SelectorContext) => {
          const [state] = get(ceremonyStore);
          return state.totalCeremonies;
        };

        const rankingMixin = ({ get }: SelectorContext) => {
          const [state, { fetchRanking }] = get(leaderboardStore);
          trigger(fetchRanking); // The exact pattern from flag-ceremony
          return state.ranking;
        };

        const stores = container();
        let renderCount = 0;

        const { result } = renderHook(
          () => {
            renderCount++;
            console.log(`Render #${renderCount}`);

            // EXACT flag-ceremony pattern: mixins() wrapper
            const stats = useStore(
              mixins({
                currentStreak: currentStreakMixin,
                longestStreak: longestStreakMixin,
                totalCeremonies: totalCeremoniesMixin,
                ranking: rankingMixin,
              })
            );

            // Second useStore with scoped
            const { badgeType, setBadgeType } = useStore(({ scoped }) => {
              const [state, actions] = scoped(badgeStore);
              return { badgeType: state.badgeType, setBadgeType: actions.setBadgeType };
            });

            return { ...stats, badgeType, setBadgeType };
          },
          { wrapper: createWrapper(stores) }
        );

        // Wait for async action
        await new Promise((r) => setTimeout(r, 100));

        const finalRenderCount = renderCount;
        console.log(`Final render count with mixins(): ${finalRenderCount}`);

        // Should NOT be 40+ renders!
        expect(finalRenderCount).toBeLessThanOrEqual(mode === "strict" ? 10 : 5);
      });
    });
  }
);

