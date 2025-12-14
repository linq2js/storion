/**
 * Money value object - immutable representation of monetary value.
 */
export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: string = "USD"
  ) {
    if (_amount < 0) {
      throw new Error("Money amount cannot be negative");
    }
  }

  static create(amount: number, currency: string = "USD"): Money {
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  static zero(currency: string = "USD"): Money {
    return new Money(0, currency);
  }

  get amount(): number {
    return this._amount;
  }

  get currency(): string {
    return this._currency;
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return Money.create(this._amount + other._amount, this._currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    const result = this._amount - other._amount;
    if (result < 0) {
      throw new Error("Cannot subtract: result would be negative");
    }
    return Money.create(result, this._currency);
  }

  multiply(factor: number): Money {
    return Money.create(this._amount * factor, this._currency);
  }

  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amount > other._amount;
  }

  isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amount < other._amount;
  }

  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }

  format(): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: this._currency,
    }).format(this._amount);
  }

  toJSON(): { amount: number; currency: string } {
    return { amount: this._amount, currency: this._currency };
  }

  private ensureSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Currency mismatch: ${this._currency} vs ${other._currency}`
      );
    }
  }
}

