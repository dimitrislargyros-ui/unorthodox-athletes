import { describe, it, expect } from "vitest";
import { wdLabel, remoteProgress, missingDays, remoteDayNote } from "./remoteProgram.js";

const P = "p1";
const s = (d, status = "completed", program_id = P) => ({ day_num: d, status, program_id, session_date: "2026-09-01" });

describe("remote weeks", () => {
  it("labels absolute days as week/day", () => {
    expect([1, 3, 4, 6, 7].map(wdLabel)).toEqual(["W1D1", "W1D3", "W2D1", "W2D3", "W3D1"]);
  });
  it("unlocks the next week only when all 3 days are done, in any order", () => {
    expect(remoteProgress([], P).currentWeek).toBe(1);
    expect(remoteProgress([s(1), s(3)], P).currentWeek).toBe(1);
    expect(remoteProgress([s(3), s(1), s(2)], P).currentWeek).toBe(2);
  });
  it("ignores cancelled sessions and other programs", () => {
    expect(remoteProgress([s(1), s(2), s(3, "cancelled")], P).currentWeek).toBe(1);
    expect(remoteProgress([s(1), s(2), s(3, "completed", "other")], P).currentWeek).toBe(1);
  });
  it("reports days the trainer hasn't written", () => {
    const prog = [1, 2, 3, 4, 5].map(day => ({ day, note: "x" }));
    expect(missingDays(prog, 2)).toEqual([6]);
    expect(remoteDayNote([{ name: "legacy flat list" }], 1)).toBe("");
  });
});
