import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dev } from "./dev";

describe("dev utilities", () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("devLog", () => {
    it("should log in development", () => {
      dev.log("test message", { data: 123 });

      // In test environment (__DEV__ is true), it should log
      expect(consoleLogSpy).toHaveBeenCalledWith("[rextive] test message", {
        data: 123,
      });
    });

    it("should prefix messages with [rextive]", () => {
      dev.log("hello");

      expect(consoleLogSpy).toHaveBeenCalledWith("[rextive] hello");
    });
  });

  describe("devWarn", () => {
    it("should warn in development", () => {
      dev.warn("warning message");

      expect(consoleWarnSpy).toHaveBeenCalledWith("[rextive] warning message");
    });

    it("should support multiple arguments", () => {
      dev.warn("deprecated", "feature", 123);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[rextive] deprecated",
        "feature",
        123
      );
    });
  });

  describe("devError", () => {
    it("should error in development", () => {
      dev.error("error message");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[rextive] error message");
    });
  });

  describe("devOnly", () => {
    it("should execute function in development", () => {
      const mockFn = vi.fn();
      dev(mockFn);

      // In test environment (__DEV__ is true), function should execute
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should execute complex logic", () => {
      let executed = false;
      dev(() => {
        executed = true;
      });

      expect(executed).toBe(true);
    });
  });

  describe("devAssert", () => {
    it("should pass when condition is true", () => {
      expect(() => dev.assert(true, "should not throw")).not.toThrow();
    });

    it("should throw when condition is false", () => {
      expect(() => dev.assert(false, "test failure")).toThrow(
        "[rextive] Assertion failed: test failure"
      );
    });

    it("should throw with custom message", () => {
      const a: any = 1;
      const b: any = 2;
      expect(() => dev.assert(a === b, "math is broken")).toThrow(
        "[rextive] Assertion failed: math is broken"
      );
    });
  });

  describe("dev namespace API", () => {
    describe("dev()", () => {
      it("should return true in development", () => {
        expect(dev()).toBe(true);
      });
    });

    describe("dev(fn)", () => {
      it("should execute function in development", () => {
        const mockFn = vi.fn();
        dev(mockFn);

        expect(mockFn).toHaveBeenCalledTimes(1);
      });

      it("should return true after executing", () => {
        const result = dev(() => {
          // some dev code
        });

        expect(result).toBe(true);
      });
    });

    describe("dev.log()", () => {
      it("should log in development", () => {
        dev.log("test message", { data: 123 });

        expect(consoleLogSpy).toHaveBeenCalledWith("[rextive] test message", {
          data: 123,
        });
      });

      it("should prefix messages with [rextive]", () => {
        dev.log("hello");

        expect(consoleLogSpy).toHaveBeenCalledWith("[rextive] hello");
      });
    });

    describe("dev.warn()", () => {
      it("should warn in development", () => {
        dev.warn("warning message");

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          "[rextive] warning message"
        );
      });

      it("should support multiple arguments", () => {
        dev.warn("deprecated", "feature", 123);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          "[rextive] deprecated",
          "feature",
          123
        );
      });
    });

    describe("dev.error()", () => {
      it("should error in development", () => {
        dev.error("error message");

        expect(consoleErrorSpy).toHaveBeenCalledWith("[rextive] error message");
      });
    });

    describe("dev.assert()", () => {
      it("should pass when condition is true", () => {
        expect(() => dev.assert(true, "should not throw")).not.toThrow();
      });

      it("should throw when condition is false", () => {
        expect(() => dev.assert(false, "test failure")).toThrow(
          "[rextive] Assertion failed: test failure"
        );
      });

      it("should throw with custom message", () => {
        const a: any = 1;
        const b: any = 2;
        expect(() => dev.assert(a === b, "math is broken")).toThrow(
          "[rextive] Assertion failed: math is broken"
        );
      });
    });
  });
});
