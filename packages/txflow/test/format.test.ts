import { describe, expect, it } from "vitest";
import { marketPrice, roundPrice, roundSize } from "../src/format";

describe("format", () => {
  it("rounds prices onto the tick with the tick's decimals", () => {
    expect(roundPrice(50000, "0.1")).toBe("50000.0");
    expect(roundPrice("81506.94", "0.1")).toBe("81506.9");
    expect(roundPrice(81506.96, "0.1", "down")).toBe("81506.9");
    expect(roundPrice(81506.91, "0.1", "up")).toBe("81507.0");
    expect(roundPrice(3123.456, "0.01")).toBe("3123.46");
    expect(roundPrice(1234, "10", "down")).toBe("1230");
    expect(roundPrice(0.30000000000000004, "0.001")).toBe("0.300");
  });

  it("truncates sizes", () => {
    expect(roundSize(0.012345, 4)).toBe("0.0123");
    expect(roundSize("0.3", 3)).toBe("0.300");
    expect(roundSize(1.005, 2)).toBe("1.00");
    expect(roundSize(5, 0)).toBe("5");
  });

  it("builds market prices away from the book", () => {
    expect(marketPrice(100, true, "0.01")).toBe("101.00");
    expect(marketPrice(100, false, "0.01")).toBe("99.00");
  });
});
