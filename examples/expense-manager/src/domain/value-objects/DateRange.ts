/**
 * DateRange value object for filtering expenses.
 */
export class DateRange {
  private constructor(
    private readonly _start: Date,
    private readonly _end: Date
  ) {
    if (_start > _end) {
      throw new Error("Start date must be before or equal to end date");
    }
  }

  static create(start: Date, end: Date): DateRange {
    return new DateRange(
      new Date(start.setHours(0, 0, 0, 0)),
      new Date(end.setHours(23, 59, 59, 999))
    );
  }

  static thisMonth(): DateRange {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return DateRange.create(start, end);
  }

  static lastMonth(): DateRange {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return DateRange.create(start, end);
  }

  static thisWeek(): DateRange {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return DateRange.create(start, end);
  }

  static today(): DateRange {
    const now = new Date();
    return DateRange.create(now, now);
  }

  static allTime(): DateRange {
    return DateRange.create(new Date(2000, 0, 1), new Date(2100, 11, 31));
  }

  get start(): Date {
    return new Date(this._start);
  }

  get end(): Date {
    return new Date(this._end);
  }

  contains(date: Date): boolean {
    return date >= this._start && date <= this._end;
  }

  equals(other: DateRange): boolean {
    return (
      this._start.getTime() === other._start.getTime() &&
      this._end.getTime() === other._end.getTime()
    );
  }

  getDays(): number {
    const diff = this._end.getTime() - this._start.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }

  format(): string {
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    const startStr = this._start.toLocaleDateString("en-US", options);
    const endStr = this._end.toLocaleDateString("en-US", options);

    if (startStr === endStr) {
      return startStr;
    }
    return `${startStr} - ${endStr}`;
  }
}

