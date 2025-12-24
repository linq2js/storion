import { describe, it, expect, vi } from "vitest";
import { store, container } from "../index";
import { applyFor, applyExcept, forStores } from "./middleware";

describe("middleware utilities", () => {
  describe("applyFor", () => {
    describe("pattern matching", () => {
      it("should match exact pattern", () => {
        const log = vi.fn();

        const userStore = store({
          name: "user",
          state: { name: "" },
          setup: () => ({}),
        });

        const otherStore = store({
          name: "other",
          state: { count: 0 },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor("user", (ctx) => {
              log(ctx.displayName);
              return ctx.next();
            }),
          ],
        });

        app.get(userStore);
        app.get(otherStore);

        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith("user");
      });

      it("should match startsWith pattern (prefix*)", () => {
        const log = vi.fn();

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const userCache = store({
          name: "userCache",
          state: { data: null },
          setup: () => ({}),
        });

        const otherStore = store({
          name: "other",
          state: { count: 0 },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor("user*", (ctx) => {
              log(ctx.displayName);
              return ctx.next();
            }),
          ],
        });

        app.get(userStore);
        app.get(userCache);
        app.get(otherStore);

        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith("userStore");
        expect(log).toHaveBeenCalledWith("userCache");
      });

      it("should match endsWith pattern (*suffix)", () => {
        const log = vi.fn();

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const authStore = store({
          name: "authStore",
          state: { token: "" },
          setup: () => ({}),
        });

        const userCache = store({
          name: "userCache",
          state: { data: null },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor("*Store", (ctx) => {
              log(ctx.displayName);
              return ctx.next();
            }),
          ],
        });

        app.get(userStore);
        app.get(authStore);
        app.get(userCache);

        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith("userStore");
        expect(log).toHaveBeenCalledWith("authStore");
      });

      it("should match includes pattern (*substr*)", () => {
        const log = vi.fn();

        const myAuthService = store({
          name: "myauthservice",
          state: { token: "" },
          setup: () => ({}),
        });

        const authManager = store({
          name: "authmanager",
          state: { session: "" },
          setup: () => ({}),
        });

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor("*auth*", (ctx) => {
              log(ctx.displayName);
              return ctx.next();
            }),
          ],
        });

        app.get(myAuthService);
        app.get(authManager);
        app.get(userStore);

        // "myauthservice" and "authmanager" both contain "auth"
        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith("myauthservice");
        expect(log).toHaveBeenCalledWith("authmanager");
      });

      it("should match RegExp pattern", () => {
        const log = vi.fn();

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const authStore = store({
          name: "authStore",
          state: { token: "" },
          setup: () => ({}),
        });

        const cacheStore = store({
          name: "cacheStore",
          state: { data: null },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor(/^(user|auth)Store$/, (ctx) => {
              log(ctx.displayName);
              return ctx.next();
            }),
          ],
        });

        app.get(userStore);
        app.get(authStore);
        app.get(cacheStore);

        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith("userStore");
        expect(log).toHaveBeenCalledWith("authStore");
      });

      it("should match multiple patterns", () => {
        const log = vi.fn();

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const cacheStore = store({
          name: "cacheStore",
          state: { data: null },
          setup: () => ({}),
        });

        const otherStore = store({
          name: "other",
          state: { count: 0 },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor(["userStore", "cacheStore"], (ctx) => {
              log(ctx.displayName);
              return ctx.next();
            }),
          ],
        });

        app.get(userStore);
        app.get(cacheStore);
        app.get(otherStore);

        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith("userStore");
        expect(log).toHaveBeenCalledWith("cacheStore");
      });
    });

    describe("predicate function", () => {
      it("should apply middleware when predicate returns true", () => {
        const log = vi.fn();

        const userStore = store({
          name: "user",
          state: { name: "" },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor(
              (ctx) => ctx.type === "store",
              (ctx) => {
                log(ctx.displayName);
                return ctx.next();
              }
            ),
          ],
        });

        app.get(userStore);

        expect(log).toHaveBeenCalledWith("user");
      });
    });

    describe("object form (middlewareMap)", () => {
      it("should apply different middleware based on patterns", () => {
        const userLog = vi.fn();
        const authLog = vi.fn();
        const cacheLog = vi.fn();

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const authStore = store({
          name: "authStore",
          state: { token: "" },
          setup: () => ({}),
        });

        const dataCacheStore = store({
          name: "dataCache",
          state: { data: null },
          setup: () => ({}),
        });

        const otherStore = store({
          name: "other",
          state: { count: 0 },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor({
              userStore: (ctx) => {
                userLog(ctx.displayName);
                return ctx.next();
              },
              authStore: (ctx) => {
                authLog(ctx.displayName);
                return ctx.next();
              },
              "*Cache": (ctx) => {
                cacheLog(ctx.displayName);
                return ctx.next();
              },
            }),
          ],
        });

        app.get(userStore);
        app.get(authStore);
        app.get(dataCacheStore);
        app.get(otherStore);

        expect(userLog).toHaveBeenCalledWith("userStore");
        expect(authLog).toHaveBeenCalledWith("authStore");
        expect(cacheLog).toHaveBeenCalledWith("dataCache");

        // Other store should not trigger any logs
        expect(userLog).toHaveBeenCalledTimes(1);
        expect(authLog).toHaveBeenCalledTimes(1);
        expect(cacheLog).toHaveBeenCalledTimes(1);
      });

      it("should support array of middleware per pattern", () => {
        const log1 = vi.fn();
        const log2 = vi.fn();

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor({
              userStore: [
                (ctx) => {
                  log1("first");
                  return ctx.next();
                },
                (ctx) => {
                  log2("second");
                  return ctx.next();
                },
              ],
            }),
          ],
        });

        app.get(userStore);

        expect(log1).toHaveBeenCalledWith("first");
        expect(log2).toHaveBeenCalledWith("second");
      });

      it("should match first pattern only when multiple match", () => {
        const userLog = vi.fn();
        const storeLog = vi.fn();

        const userStore = store({
          name: "userStore",
          state: { name: "" },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor({
              "user*": (ctx) => {
                userLog(ctx.displayName);
                return ctx.next();
              },
              "*Store": (ctx) => {
                storeLog(ctx.displayName);
                return ctx.next();
              },
            }),
          ],
        });

        app.get(userStore);

        // First matching pattern wins
        expect(userLog).toHaveBeenCalledWith("userStore");
        expect(storeLog).not.toHaveBeenCalled();
      });

      it("should pass through when no patterns match", () => {
        const log = vi.fn();

        const otherStore = store({
          name: "other",
          state: { count: 0 },
          setup: () => ({}),
        });

        const app = container({
          middleware: [
            applyFor({
              userStore: (ctx) => {
                log(ctx.displayName);
                return ctx.next();
              },
            }),
            // Second middleware to verify chain continues
            (ctx) => {
              log("chain-continued");
              return ctx.next();
            },
          ],
        });

        app.get(otherStore);

        expect(log).not.toHaveBeenCalledWith("other");
        expect(log).toHaveBeenCalledWith("chain-continued");
      });
    });
  });

  describe("applyExcept", () => {
    it("should exclude matching patterns", () => {
      const log = vi.fn();

      const userStore = store({
        name: "userStore",
        state: { name: "" },
        setup: () => ({}),
      });

      const tempStore = store({
        name: "tempStore",
        state: { data: null },
        setup: () => ({}),
      });

      const app = container({
        middleware: [
          applyExcept("tempStore", (ctx) => {
            log(ctx.displayName);
            return ctx.next();
          }),
        ],
      });

      app.get(userStore);
      app.get(tempStore);

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith("userStore");
    });

    it("should exclude with wildcard patterns", () => {
      const log = vi.fn();

      const userStore = store({
        name: "userStore",
        state: { name: "" },
        setup: () => ({}),
      });

      const tempCache = store({
        name: "tempCache",
        state: { data: null },
        setup: () => ({}),
      });

      const tempData = store({
        name: "tempData",
        state: { items: [] },
        setup: () => ({}),
      });

      const app = container({
        middleware: [
          applyExcept("temp*", (ctx) => {
            log(ctx.displayName);
            return ctx.next();
          }),
        ],
      });

      app.get(userStore);
      app.get(tempCache);
      app.get(tempData);

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith("userStore");
    });
  });

  describe("forStores", () => {
    it("should only apply to stores, not factories", () => {
      const storeLog = vi.fn();
      const factoryLog = vi.fn();

      const myStore = store({
        name: "myStore",
        state: { count: 0 },
        setup: () => ({}),
      });

      const myFactory = () => ({ value: 42 });

      const app = container({
        middleware: [
          forStores((ctx) => {
            storeLog(ctx.displayName);
            return ctx.next();
          }),
          (ctx) => {
            if (ctx.type === "service") {
              factoryLog("service");
            }
            return ctx.next();
          },
        ],
      });

      app.get(myStore);
      app.get(myFactory);

      expect(storeLog).toHaveBeenCalledWith("myStore");
      expect(factoryLog).toHaveBeenCalledWith("service");
    });

    it("should support array of store middleware", () => {
      const log1 = vi.fn();
      const log2 = vi.fn();

      const myStore = store({
        name: "myStore",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: [
          forStores([
            (ctx) => {
              log1("first");
              return ctx.next();
            },
            (ctx) => {
              log2("second");
              return ctx.next();
            },
          ]),
        ],
      });

      app.get(myStore);

      expect(log1).toHaveBeenCalledWith("first");
      expect(log2).toHaveBeenCalledWith("second");
    });
  });
});

