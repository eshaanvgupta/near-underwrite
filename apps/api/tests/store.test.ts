import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store.js";

describe("atomic AI request reservations", () => {
  it("prevents concurrent tabs from reusing a confirmation or exceeding a daily cap", async () => {
    const store = new MemoryStore();
    const workspace = crypto.randomUUID();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    expect(await store.reserveAI(workspace, first, 1)).toBe(true);
    expect(await store.reserveAI(workspace, first, 1)).toBe(false);
    expect(await store.reserveAI(workspace, second, 1)).toBe(false);
    await store.reconcileAI(first, "failed", {});
    expect(await store.reserveAI(workspace, second, 1)).toBe(true);
  });
});
