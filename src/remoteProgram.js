// Remote-client program math, shared by ClientApp and TrainerApp so both show the same
// weeks/ticks. Program days are stored as a flat 1..N list (same as in-person programs);
// remote clients see them grouped into weeks of 3: day 4 = W2D1, day 5 = W2D2, etc.
// A remote session's `day_num` is that absolute program day, and `program_id` ties it to
// the program so a package renewal on the same program keeps the client's progress.

// ponytail: fixed 3/week for every remote client (trainer's call) — make it per-package
// (pkg.sessions_per_week) if that changes.
export const REMOTE_PER_WEEK = 3;

export const wdLabel = (day) => `W${Math.ceil(day / REMOTE_PER_WEEK)}D${((day - 1) % REMOTE_PER_WEEK) + 1}`;

export const weekDays = (week) => Array.from({ length: REMOTE_PER_WEEK }, (_, i) => (week - 1) * REMOTE_PER_WEEK + i + 1);

// Note text for a program day ("" if the trainer hasn't written it yet).
export const remoteDayNote = (programExercises, day) => {
  const raw = programExercises || [];
  if (raw[0]?.day === undefined) return "";
  return (raw.find(d => d.day === day)?.note || "").trim();
};

// done: Map(day -> session) of completed days for this program.
// currentWeek: first week that still has an undone day (all 3 done -> next week unlocks).
export function remoteProgress(sessions, programId) {
  const done = new Map();
  (sessions || []).forEach(s => {
    if (s.status !== "cancelled" && s.program_id === programId && s.day_num) done.set(s.day_num, s);
  });
  let currentWeek = 1;
  while (weekDays(currentWeek).every(d => done.has(d))) currentWeek++;
  return { done, currentWeek };
}

// Days of the given week the trainer still has to write.
export const missingDays = (programExercises, week) => weekDays(week).filter(d => !remoteDayNote(programExercises, d));
