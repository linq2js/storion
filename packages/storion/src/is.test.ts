/**
 * Tests for type guards.
 */

import { describe, it, expect } from "vitest";
import { store } from "./core/store";
import { container } from "./core/container";
import {
  is,
  isStorion,
  getKind,
  isSpec,
  isContainer,
  isStore,
  isFocus,
  isStoreContext,
} from "./is";
import { STORION_TYPE } from "./types";

describe("is()", () => {
  it("should detect store spec", () => {
    const spec = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    expect(is(spec, "store.spec")).toBe(true);
    expect(is(spec, "store")).toBe(false);
    expect(is(spec, "container")).toBe(false);
  });

  it("should detect store container", () => {
    const c = container();

    expect(is(c, "container")).toBe(true);
    expect(is(c, "store.spec")).toBe(false);
    expect(is(c, "store")).toBe(false);
  });

  it("should detect store instance", () => {
    const spec = store({
      state: { count: 0 },
      setup: () => ({}),
    });
    const c = container();
    const instance = c.get(spec);

    expect(is(instance, "store")).toBe(true);
    expect(is(instance, "store.spec")).toBe(false);
    expect(is(instance, "container")).toBe(false);
  });

  it("should detect focus", () => {
    const c = container();

    // Focus is destructured in setup, so we need to check during setup
    let capturedFocus: unknown;
    const specWithCapture = store({
      state: { count: 0 },
      setup: (ctx) => {
        capturedFocus = ctx.focus("count");
        const [get, set] = capturedFocus as [() => number, (v: number) => void];
        return { get, set };
      },
    });
    c.get(specWithCapture);

    expect(is(capturedFocus, "focus")).toBe(true);
    expect(is(capturedFocus, "store")).toBe(false);
  });

  it("should detect store context", () => {
    let capturedContext: unknown;
    const spec = store({
      state: { count: 0 },
      setup: (ctx) => {
        capturedContext = ctx;
        return {};
      },
    });
    const c = container();
    c.get(spec);

    expect(is(capturedContext, "store.context")).toBe(true);
    expect(is(capturedContext, "selector.context")).toBe(false);
  });

  it("should return false for non-Storion objects", () => {
    expect(is({}, "store.spec")).toBe(false);
    expect(is(null, "store.spec")).toBe(false);
    expect(is(undefined, "store.spec")).toBe(false);
    expect(is("string", "store.spec")).toBe(false);
    expect(is(123, "store.spec")).toBe(false);
    expect(is([], "store.spec")).toBe(false);
  });
});

describe("isStorion()", () => {
  it("should detect any Storion object", () => {
    const spec = store({
      state: { count: 0 },
      setup: () => ({}),
    });
    const c = container();
    const instance = c.get(spec);

    expect(isStorion(spec)).toBe(true);
    expect(isStorion(c)).toBe(true);
    expect(isStorion(instance)).toBe(true);
  });

  it("should return false for non-Storion objects", () => {
    expect(isStorion({})).toBe(false);
    expect(isStorion(null)).toBe(false);
    expect(isStorion(undefined)).toBe(false);
  });
});

describe("getKind()", () => {
  it("should return the kind of a Storion object", () => {
    const spec = store({
      state: { count: 0 },
      setup: () => ({}),
    });
    const c = container();
    const instance = c.get(spec);

    expect(getKind(spec)).toBe("store.spec");
    expect(getKind(c)).toBe("container");
    expect(getKind(instance)).toBe("store");
  });
});

describe("specific type guards", () => {
  it("isSpec() should work", () => {
    const spec = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    expect(isSpec(spec)).toBe(true);
    expect(isSpec({})).toBe(false);
  });

  it("isContainer() should work", () => {
    const c = container();

    expect(isContainer(c)).toBe(true);
    expect(isContainer({})).toBe(false);
  });

  it("isStore() should work", () => {
    const spec = store({
      state: { count: 0 },
      setup: () => ({}),
    });
    const c = container();
    const instance = c.get(spec);

    expect(isStore(instance)).toBe(true);
    expect(isStore({})).toBe(false);
  });

  it("isFocus() should work", () => {
    let capturedFocus: unknown;
    const spec = store({
      state: { count: 0 },
      setup: (ctx) => {
        capturedFocus = ctx.focus("count");
        const [get, set] = capturedFocus as [() => number, (v: number) => void];
        return { get, set };
      },
    });
    const c = container();
    c.get(spec);

    expect(isFocus(capturedFocus)).toBe(true);
    expect(isFocus({})).toBe(false);
  });

  it("isStoreContext() should work", () => {
    let capturedContext: unknown;
    const spec = store({
      state: { count: 0 },
      setup: (ctx) => {
        capturedContext = ctx;
        return {};
      },
    });
    const c = container();
    c.get(spec);

    expect(isStoreContext(capturedContext)).toBe(true);
    expect(isStoreContext({})).toBe(false);
  });
});

describe("STORION_TYPE", () => {
  it("should be accessible on Storion objects", () => {
    const spec = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    expect(spec[STORION_TYPE]).toBe("store.spec");
  });
});
