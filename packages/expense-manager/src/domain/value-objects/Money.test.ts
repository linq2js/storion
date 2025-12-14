import { describe, it, expect } from "vitest";
import { Money } from "./Money";

describe("Money", () => {
  describe("create()", () => {
    it("should create money with amount and currency", () => {
      const money = Money.create(100);
      expect(money.amount).toBe(100);
      expect(money.currency).toBe("USD");
    });

    it("should round to 2 decimal places", () => {
      const money = Money.create(100.125);
      expect(money.amount).toBe(100.13);
    });

    it("should throw for negative amounts", () => {
      expect(() => Money.create(-100)).toThrow("cannot be negative");
    });
  });

  describe("zero()", () => {
    it("should create zero money", () => {
      const money = Money.zero();
      expect(money.amount).toBe(0);
    });
  });

  describe("add()", () => {
    it("should add two money values", () => {
      const a = Money.create(50);
      const b = Money.create(30);
      const result = a.add(b);

      expect(result.amount).toBe(80);
    });

    it("should throw for different currencies", () => {
      const a = Money.create(50, "USD");
      const b = Money.create(30, "EUR");

      expect(() => a.add(b)).toThrow("Currency mismatch");
    });
  });

  describe("subtract()", () => {
    it("should subtract two money values", () => {
      const a = Money.create(50);
      const b = Money.create(30);
      const result = a.subtract(b);

      expect(result.amount).toBe(20);
    });

    it("should throw for negative result", () => {
      const a = Money.create(30);
      const b = Money.create(50);

      expect(() => a.subtract(b)).toThrow("negative");
    });
  });

  describe("multiply()", () => {
    it("should multiply by factor", () => {
      const money = Money.create(50);
      const result = money.multiply(2);

      expect(result.amount).toBe(100);
    });
  });

  describe("comparisons", () => {
    it("should compare greater than", () => {
      const a = Money.create(100);
      const b = Money.create(50);

      expect(a.isGreaterThan(b)).toBe(true);
      expect(b.isGreaterThan(a)).toBe(false);
    });

    it("should compare less than", () => {
      const a = Money.create(50);
      const b = Money.create(100);

      expect(a.isLessThan(b)).toBe(true);
      expect(b.isLessThan(a)).toBe(false);
    });

    it("should check equality", () => {
      const a = Money.create(100);
      const b = Money.create(100);
      const c = Money.create(50);

      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });
  });

  describe("format()", () => {
    it("should format as currency", () => {
      const money = Money.create(1234.56);
      expect(money.format()).toBe("$1,234.56");
    });
  });

  describe("toJSON()", () => {
    it("should serialize to JSON", () => {
      const money = Money.create(100);
      expect(money.toJSON()).toEqual({ amount: 100, currency: "USD" });
    });
  });
});

