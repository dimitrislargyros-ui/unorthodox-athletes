// Common gym exercises, grouped by muscle group/category, used to power the
// searchable exercise picker in Programs, session logging, and PRs. Trainer
// and client can still type any custom name — this list is suggestions only.
export const EXERCISE_LIST = [
  // Chest
  "Barbell Bench Press", "Incline Barbell Bench Press", "Decline Barbell Bench Press",
  "Dumbbell Bench Press", "Incline Dumbbell Bench Press", "Dumbbell Fly",
  "Cable Crossover", "Push-Up", "Chest Dip", "Pec Deck",
  // Back
  "Deadlift", "Romanian Deadlift", "Sumo Deadlift", "Barbell Row", "Pendlay Row",
  "Dumbbell Row", "Pull-Up", "Chin-Up", "Lat Pulldown", "Seated Cable Row",
  "T-Bar Row", "Face Pull", "Straight-Arm Pulldown", "Hyperextension",
  // Shoulders
  "Overhead Press", "Dumbbell Shoulder Press", "Arnold Press", "Push Press",
  "Lateral Raise", "Front Raise", "Rear Delt Fly", "Upright Row", "Barbell Shrug",
  "Dumbbell Shrug", "Cable Lateral Raise",
  // Legs
  "Back Squat", "Front Squat", "Goblet Squat", "Leg Press", "Hack Squat",
  "Walking Lunge", "Bulgarian Split Squat", "Step-Up", "Leg Extension",
  "Leg Curl", "Standing Calf Raise", "Seated Calf Raise", "Hip Thrust",
  "Glute Bridge", "Box Squat", "Sissy Squat",
  // Arms
  "Barbell Curl", "Dumbbell Curl", "Hammer Curl", "Preacher Curl", "Concentration Curl",
  "Cable Curl", "Tricep Pushdown", "Overhead Tricep Extension", "Skull Crusher",
  "Close-Grip Bench Press", "Tricep Dip", "Diamond Push-Up",
  // Core
  "Plank", "Side Plank", "Russian Twist", "Hanging Leg Raise", "Cable Crunch",
  "Sit-Up", "Crunch", "Ab Wheel Rollout", "Mountain Climber", "Bicycle Crunch",
  // Full body / conditioning
  "Clean and Jerk", "Power Clean", "Snatch", "Kettlebell Swing", "Box Jump",
  "Sled Push", "Battle Ropes", "Farmer's Carry", "Burpee", "Jump Rope",
  "Rowing Machine", "Assault Bike", "Treadmill Run",
].sort((a,b)=>a.localeCompare(b));
