import { describe, it, expect } from "vitest";
import { computeCompletedUsed, computeReservedCount, COMPLETION_GRACE_MS, completedItems } from "./sessionsMath.js";

const pkg = { id: "p1", sessions_total: 8, start_date: "2026-01-01" };
const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime(); // 2026-01-15 12:00 local

describe("computeCompletedUsed / computeReservedCount", () => {
  it("returns 0 with no package", () => {
    expect(computeCompletedUsed(null, [], [], NOW)).toBe(0);
    expect(computeReservedCount(null, [], [])).toBe(0);
  });

  it("counts a past session as used and booked", () => {
    const sessions = [{ session_date: "2026-01-10", start_time_min: 600, status: "completed" }];
    expect(computeCompletedUsed(pkg, sessions, [], NOW)).toBe(1);
    expect(computeReservedCount(pkg, sessions, [])).toBe(1);
  });

  it("does not charge a future booking, but does reserve it", () => {
    const bookings = [{ book_date: "2026-01-20", schedule_slots: { start_time_min: 600 } }];
    expect(computeCompletedUsed(pkg, [], bookings, NOW)).toBe(0);
    expect(computeReservedCount(pkg, [], bookings)).toBe(1);
  });

  it("excludes cancelled sessions entirely", () => {
    const sessions = [{ session_date: "2026-01-10", start_time_min: 600, status: "cancelled" }];
    expect(computeCompletedUsed(pkg, sessions, [], NOW)).toBe(0);
    expect(computeReservedCount(pkg, sessions, [])).toBe(0);
  });

  it("dedupes a session and a booking on the same date to one count", () => {
    const sessions = [{ session_date: "2026-01-10", start_time_min: 600, status: "completed" }];
    const bookings = [{ book_date: "2026-01-10", schedule_slots: { start_time_min: 700 } }];
    expect(computeCompletedUsed(pkg, sessions, bookings, NOW)).toBe(1);
    expect(computeReservedCount(pkg, sessions, bookings)).toBe(1);
  });

  it("still reserves/counts a booking on a date that only has a cancelled session (regression: was previously hidden in TrainerApp)", () => {
    const sessions = [{ session_date: "2026-01-10", start_time_min: 600, status: "cancelled" }];
    const bookings = [{ book_date: "2026-01-10", schedule_slots: { start_time_min: 700 } }];
    expect(computeReservedCount(pkg, sessions, bookings)).toBe(1);
    expect(computeCompletedUsed(pkg, sessions, bookings, NOW)).toBe(1);
  });

  it("ignores sessions/bookings dated before the package start", () => {
    const sessions = [{ session_date: "2025-12-20", start_time_min: 600, status: "completed" }];
    expect(computeCompletedUsed(pkg, sessions, [], NOW)).toBe(0);
    expect(computeReservedCount(pkg, sessions, [])).toBe(0);
  });

  it("caps completed-used at sessions_total even if more distinct dates exist", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      session_date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      start_time_min: 600,
      status: "completed",
    }));
    expect(computeCompletedUsed(pkg, sessions, [], NOW)).toBe(pkg.sessions_total);
  });

  it("does not charge a session until the grace window after its start time has elapsed", () => {
    const session = { session_date: "2026-01-15", start_time_min: 10 * 60, status: "booked" }; // 10:00
    const sessionStart = new Date(2026, 0, 15, 10, 0, 0).getTime();
    expect(computeCompletedUsed(pkg, [session], [], sessionStart + COMPLETION_GRACE_MS - 1)).toBe(0);
    expect(computeCompletedUsed(pkg, [session], [], sessionStart + COMPLETION_GRACE_MS)).toBe(1);
  });

  it("completedItems includes self-booked (bookings-table-only) attendance, unscoped by any package", () => {
    // Regression: stats/history views that only read the `sessions` table were blind to
    // a client who exclusively self-books and never gets a trainer-logged session row.
    const bookings = [{ book_date: "2026-01-05", schedule_slots: { start_time_min: 600 } }];
    const items = completedItems([], bookings, NOW);
    expect(items).toEqual([{ session_date: "2026-01-05", start_time_min: 600 }]);
  });

  it("completedItems excludes future/in-progress items and dedupes same-date session+booking", () => {
    const sessions = [{ session_date: "2026-01-10", start_time_min: 600, status: "completed" }];
    const bookings = [
      { book_date: "2026-01-10", schedule_slots: { start_time_min: 700 } }, // same date as session — deduped
      { book_date: "2026-01-20", schedule_slots: { start_time_min: 600 } }, // future — excluded
    ];
    expect(completedItems(sessions, bookings, NOW)).toEqual([{ session_date: "2026-01-10", start_time_min: 600 }]);
  });

  it("applies a persistent sessions_used_adjustment on top of the raw completed count", () => {
    // Regression 2026-09-11: a trainer's downward "override sessions used" (e.g.
    // forgiving one session as a credit) used to get silently reverted by the next
    // auto-settle, because it wrote a one-off value that fought the raw recomputed
    // count. Storing it as a persistent delta instead means it keeps applying no
    // matter how many times this gets recomputed.
    const sessions = [
      { session_date: "2026-01-05", start_time_min: 600, status: "completed" },
      { session_date: "2026-01-10", start_time_min: 600, status: "completed" },
    ];
    const forgiven = { ...pkg, sessions_used_adjustment: -1 };
    expect(computeCompletedUsed(forgiven, sessions, [], NOW)).toBe(1); // 2 raw - 1 credit
    const chargedExtra = { ...pkg, sessions_used_adjustment: 2 };
    expect(computeCompletedUsed(chargedExtra, sessions, [], NOW)).toBe(4); // 2 raw + 2 extra
  });

  it("clamps the adjusted count to [0, sessions_total] instead of going negative or over", () => {
    const sessions = [{ session_date: "2026-01-10", start_time_min: 600, status: "completed" }];
    const overForgiven = { ...pkg, sessions_used_adjustment: -5 };
    expect(computeCompletedUsed(overForgiven, sessions, [], NOW)).toBe(0); // 1 - 5 -> floored at 0
    const overCharged = { ...pkg, sessions_used_adjustment: 20 };
    expect(computeCompletedUsed(overCharged, sessions, [], NOW)).toBe(pkg.sessions_total); // capped at total
  });

  it("does not cap reservedCount — over-booking should be visible, not silently clamped", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      session_date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      start_time_min: 600,
      status: "completed",
    }));
    expect(computeReservedCount(pkg, sessions, [])).toBe(10);
  });
});
