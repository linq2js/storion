import { describe, it, expect, vi } from "vitest";
import { meta } from "./meta";
import { createMetaQuery } from "./createMetaQuery";
import { withMeta } from "./withMeta";
import { store } from "../core/store";
import { container } from "../core/container";

describe("meta", () => {
  describe("meta builder creation", () => {
    it("should create a boolean meta builder without arguments", () => {
      const persist = meta();

      const entry = persist();

      expect(entry.value).toBe(true);
      expect(entry.field).toBeUndefined();
      expect(entry.type).toBe(persist); // type references the builder for filtering
    });

    it("should create a meta builder with value transformer", () => {
      const priority = meta((level: number) => level);

      const entry = priority(5);

      expect(entry.value).toBe(5);
      expect(entry.field).toBeUndefined();
      expect(entry.type).toBe(priority);
    });

    it("should create field-level meta with .for()", () => {
      const validate = meta((rule: string) => rule);

      const entry = validate.for("email", "email-format");

      expect(entry.value).toBe("email-format");
      expect(entry.field).toBe("email");
      expect(entry.type).toBe(validate);
    });

    it("should create boolean field-level meta without arguments", () => {
      const required = meta();

      const entry = required.for("name");

      expect(entry.value).toBe(true);
      expect(entry.field).toBe("name");
    });

    it("should support complex value types", () => {
      const schema = meta((config: { min: number; max: number }) => config);

      const entry = schema({ min: 0, max: 100 });

      expect(entry.value).toEqual({ min: 0, max: 100 });
    });

    it("should support multiple arguments", () => {
      const range = meta((min: number, max: number) => ({ min, max }));

      const entry = range(1, 10);

      expect(entry.value).toEqual({ min: 1, max: 10 });
    });
  });

  describe("createMetaQuery - default (first value)", () => {
    it("should return first store-level meta value", () => {
      const persist = meta();
      const entries = [persist()];
      const query = createMetaQuery(entries);

      const result = query(persist);

      expect(result.store).toBe(true);
      expect(result.fields).toEqual({});
    });

    it("should return first value when multiple exist", () => {
      const priority = meta((level: number) => level);
      const entries = [priority(1), priority(2), priority(3)];
      const query = createMetaQuery(entries);

      expect(query(priority).store).toBe(1);
    });

    it("should return undefined for unmatched meta type", () => {
      const persist = meta();
      const other = meta();
      const entries = [persist()];
      const query = createMetaQuery(entries);

      const result = query(other);

      expect(result.store).toBeUndefined();
      expect(result.fields).toEqual({});
    });

    it("should return first field-level value per field", () => {
      const validate = meta((rule: string) => rule);
      const entries = [
        validate("store-rule"),
        validate.for("email", "email-format"),
        validate.for("email", "required"), // second - ignored in default mode
        validate.for("age", "positive-number"),
      ];
      const query = createMetaQuery(entries);

      const result = query(validate);

      expect(result.store).toBe("store-rule");
      expect(result.fields.email).toBe("email-format"); // first value
      expect(result.fields.age).toBe("positive-number");
    });

    it("should handle empty meta", () => {
      const persist = meta();
      const query = createMetaQuery([]);

      const result = query(persist);

      expect(result.store).toBeUndefined();
      expect(result.fields).toEqual({});
    });
  });

  describe("createMetaQuery - all()", () => {
    it("should return arrays of all values", () => {
      const persist = meta();
      const sync = meta((interval: number) => interval);
      const entries = [persist(), sync(5000)];
      const query = createMetaQuery(entries);

      expect(query.all(persist).store).toEqual([true]);
      expect(query.all(sync).store).toEqual([5000]);
    });

    it("should separate store-level and field-level meta", () => {
      const validate = meta((rule: string) => rule);
      const entries = [
        validate("store-rule"),
        validate.for("email", "email-format"),
        validate.for("age", "positive-number"),
      ];
      const query = createMetaQuery(entries);

      const result = query.all(validate);

      expect(result.store).toEqual(["store-rule"]);
      expect(result.fields.email).toEqual(["email-format"]);
      expect(result.fields.age).toEqual(["positive-number"]);
    });

    it("should return empty arrays for unmatched meta type", () => {
      const persist = meta();
      const other = meta();
      const entries = [persist()];
      const query = createMetaQuery(entries);

      const result = query.all(other);

      expect(result.store).toEqual([]);
      expect(result.fields).toEqual({});
    });

    it("should accumulate multiple entries of same type", () => {
      const tag = meta((name: string) => name);
      const entries = [
        tag("important"),
        tag("critical"),
        tag.for("value", "numeric"),
        tag.for("value", "validated"),
      ];
      const query = createMetaQuery(entries);

      const result = query.all(tag);

      expect(result.store).toEqual(["important", "critical"]);
      expect(result.fields.value).toEqual(["numeric", "validated"]);
    });

    it("should handle empty meta", () => {
      const persist = meta();
      const query = createMetaQuery([]);

      const result = query.all(persist);

      expect(result.store).toEqual([]);
      expect(result.fields).toEqual({});
    });

    it("should work with multiple different meta types", () => {
      const persist = meta();
      const priority = meta((level: number) => level);
      const validate = meta((rule: string) => rule);
      const entries = [
        persist(),
        priority(1),
        validate.for("email", "email-format"),
        validate.for("count", "positive"),
      ];
      const query = createMetaQuery(entries);

      expect(query.all(persist).store).toEqual([true]);
      expect(query.all(priority).store).toEqual([1]);
      expect(query.all(validate).store).toEqual([]);
      expect(query.all(validate).fields.email).toEqual(["email-format"]);
      expect(query.all(validate).fields.count).toEqual(["positive"]);
    });
  });

  describe("createMetaQuery.any()", () => {
    it("should return true when has the specified meta type", () => {
      const persist = meta();
      const entries = [persist()];
      const query = createMetaQuery(entries);

      expect(query.any(persist)).toBe(true);
    });

    it("should return false when does not have the specified meta type", () => {
      const persist = meta();
      const sync = meta();
      const entries = [persist()];
      const query = createMetaQuery(entries);

      expect(query.any(sync)).toBe(false);
    });

    it("should return true when has at least one of multiple meta types", () => {
      const persist = meta();
      const sync = meta();
      const cache = meta();
      const entries = [persist()];
      const query = createMetaQuery(entries);

      expect(query.any(persist, sync)).toBe(true);
      expect(query.any(sync, cache)).toBe(false);
      expect(query.any(persist, sync, cache)).toBe(true);
    });

    it("should return true for field-level meta as well", () => {
      const validate = meta();
      const entries = [validate.for("email")];
      const query = createMetaQuery(entries);

      expect(query.any(validate)).toBe(true);
    });

    it("should return false when has no meta", () => {
      const persist = meta();
      const query = createMetaQuery([]);

      expect(query.any(persist)).toBe(false);
    });
  });

  describe("store spec meta", () => {
    it("should store meta entries as array on spec", () => {
      const persist = meta();
      const priority = meta((level: number) => level);

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
        meta: [persist(), priority(1)],
      });

      expect(myStore.meta).toHaveLength(2);
      expect(myStore.meta![0].value).toBe(true);
      expect(myStore.meta![1].value).toBe(1);
    });

    it("should have empty array when no meta", () => {
      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      expect(myStore.meta).toEqual([]);
    });
  });

  describe("withMeta", () => {
    it("should attach meta to a factory function", () => {
      const persist = meta();
      const myService = withMeta(
        (resolver) => ({ doSomething: () => {} }),
        [persist()]
      );

      expect(myService.meta).toHaveLength(1);
      expect(myService.meta[0].value).toBe(true);
    });

    it("should normalize single meta entry to array", () => {
      const persist = meta();
      const myService = withMeta(
        (_resolver) => ({ doSomething: () => {} }),
        persist()
      );

      expect(myService.meta).toHaveLength(1);
    });

    it("should preserve function behavior", () => {
      const persist = meta();
      const myService = withMeta(() => ({ value: 42 }), [persist()]);

      const result = myService();
      expect(result.value).toBe(42);
    });
  });

  describe("middleware context meta", () => {
    it("should provide meta query in store middleware context", () => {
      const persist = meta();
      const logMeta = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
        meta: [persist()],
      });

      const app = container({
        middleware: [
          (ctx) => {
            logMeta(ctx.meta.any(persist), ctx.meta(persist).store);
            return ctx.next();
          },
        ],
      });

      app.get(myStore);

      expect(logMeta).toHaveBeenCalledWith(true, true);
    });

    it("should provide meta query in factory middleware context", () => {
      const persist = meta();
      const logMeta = vi.fn();

      const myService = withMeta((resolver) => ({ value: 42 }), [persist()]);

      const app = container({
        middleware: [
          (ctx) => {
            logMeta(ctx.meta.any(persist), ctx.meta(persist).store);
            return ctx.next();
          },
        ],
      });

      app.get(myService);

      expect(logMeta).toHaveBeenCalledWith(true, true);
    });

    it("should return empty meta query when no meta attached", () => {
      const persist = meta();
      const logMeta = vi.fn();

      const myService = (resolver: any) => ({ value: 42 });

      const app = container({
        middleware: [
          (ctx) => {
            logMeta(ctx.meta.any(persist), ctx.meta(persist).store);
            return ctx.next();
          },
        ],
      });

      app.get(myService);

      expect(logMeta).toHaveBeenCalledWith(false, undefined);
    });
  });

  describe("use cases", () => {
    it("should support persistence metadata via middleware", () => {
      const persist = meta();
      const persistKey = meta((key: string) => key);
      const persistedStores: string[] = [];

      const userStore = store({
        name: "user",
        state: { name: "", token: "" },
        setup: () => ({}),
        meta: [persist(), persistKey("user-data"), persist.for("token")],
      });

      const app = container({
        middleware: [
          (ctx) => {
            if (ctx.meta.any(persist)) {
              persistedStores.push(ctx.displayName!);
            }
            return ctx.next();
          },
        ],
      });

      app.get(userStore);

      expect(persistedStores).toEqual(["user"]);
    });

    it("should support devtools metadata", () => {
      const devtools = meta(
        (options: { name?: string; trace?: boolean }) => options
      );

      const counterStore = store({
        name: "counter",
        state: { count: 0 },
        setup: () => ({}),
        meta: [devtools({ name: "Counter Store", trace: true })],
      });

      const query = createMetaQuery(counterStore.meta!);
      const devtoolsConfig = query(devtools).store;
      expect(devtoolsConfig).toEqual({ name: "Counter Store", trace: true });
    });
  });
});
