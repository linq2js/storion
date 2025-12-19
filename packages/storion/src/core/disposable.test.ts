/**
 * Tests for disposable utilities.
 */

import { describe, it, expect, vi } from "vitest";
import { tryDispose } from "./disposable";

describe("tryDispose()", () => {
  it("should call dispose function on object with dispose method", () => {
    const disposeFn = vi.fn();
    const disposable = { dispose: disposeFn };

    tryDispose(disposable);

    expect(disposeFn).toHaveBeenCalledOnce();
  });

  it("should handle dispose as an array of functions", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();
    const disposable = { dispose: [fn1, fn2, fn3] };

    tryDispose(disposable);

    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
    expect(fn3).toHaveBeenCalledOnce();
  });

  it("should recursively dispose nested disposable objects in array", () => {
    const innerDispose = vi.fn();
    const outerFn = vi.fn();
    const disposable = {
      dispose: [outerFn, { dispose: innerDispose }],
    };

    tryDispose(disposable);

    expect(outerFn).toHaveBeenCalledOnce();
    expect(innerDispose).toHaveBeenCalledOnce();
  });

  it("should handle deeply nested disposable objects", () => {
    const deepDispose = vi.fn();
    const disposable = {
      dispose: [{ dispose: [{ dispose: deepDispose }] }],
    };

    tryDispose(disposable);

    expect(deepDispose).toHaveBeenCalledOnce();
  });

  it("should safely ignore null", () => {
    expect(() => tryDispose(null)).not.toThrow();
  });

  it("should safely ignore undefined", () => {
    expect(() => tryDispose(undefined)).not.toThrow();
  });

  it("should safely ignore primitives", () => {
    expect(() => tryDispose(123)).not.toThrow();
    expect(() => tryDispose("string")).not.toThrow();
    expect(() => tryDispose(true)).not.toThrow();
    expect(() => tryDispose(Symbol("test"))).not.toThrow();
  });

  it("should safely ignore objects without dispose property", () => {
    expect(() => tryDispose({})).not.toThrow();
    expect(() => tryDispose({ foo: "bar" })).not.toThrow();
    expect(() => tryDispose([])).not.toThrow();
  });

  it("should safely ignore objects with non-function/non-array dispose", () => {
    expect(() => tryDispose({ dispose: "not a function" })).not.toThrow();
    expect(() => tryDispose({ dispose: 123 })).not.toThrow();
    expect(() => tryDispose({ dispose: null })).not.toThrow();
  });

  it("should handle function objects with dispose property", () => {
    const disposeFn = vi.fn();
    const fn = Object.assign(() => {}, { dispose: disposeFn });

    tryDispose(fn);

    expect(disposeFn).toHaveBeenCalledOnce();
  });

  it("should skip non-function items in dispose array", () => {
    const fn = vi.fn();
    const disposable = {
      dispose: [fn, "not a function", 123, null, undefined],
    };

    tryDispose(disposable);

    expect(fn).toHaveBeenCalledOnce();
  });

  it("should handle mixed array with functions and disposable objects", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const nestedDispose = vi.fn();

    const disposable = {
      dispose: [fn1, { dispose: nestedDispose }, fn2],
    };

    tryDispose(disposable);

    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
    expect(nestedDispose).toHaveBeenCalledOnce();
  });

  it("should handle empty dispose array", () => {
    const disposable = { dispose: [] };

    expect(() => tryDispose(disposable)).not.toThrow();
  });
});

