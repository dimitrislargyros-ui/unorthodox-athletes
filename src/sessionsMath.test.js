import { describe, it, expect } from "vitest";
import { computeCompletedUsed, computeReservedCount } from "./sessionsMath.js";

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

  it("does not cap reservedCount — over-booking should be visible, not silently clamped", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      session_date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      start_time_min: 600,
      status: "completed",
    }));
    expect(computeReservedCount(pkg, sessions, [])).toBe(10);
  });
});
