import type { PlanDay, PlanExercise } from './types'

/** Commonly done gym exercises, grouped for the picker. */
export const EXERCISE_LIBRARY: Record<string, string[]> = {
  Chest: [
    'Barbell Bench Press',
    'Incline Barbell Bench Press',
    'Dumbbell Bench Press',
    'Incline Dumbbell Press',
    'Decline Bench Press',
    'Chest Fly (Machine)',
    'Cable Crossover',
    'Dumbbell Fly',
    'Push-ups',
    'Chest Dips',
  ],
  Back: [
    'Deadlift',
    'Pull-ups',
    'Chin-ups',
    'Lat Pulldown',
    'Barbell Row',
    'Dumbbell Row',
    'Seated Cable Row',
    'T-Bar Row',
    'Chest-Supported Row',
    'Straight-Arm Pulldown',
    'Back Extension',
  ],
  Shoulders: [
    'Overhead Press',
    'Seated Dumbbell Press',
    'Arnold Press',
    'Lateral Raise',
    'Cable Lateral Raise',
    'Front Raise',
    'Rear Delt Fly',
    'Face Pull',
    'Upright Row',
    'Shrugs',
  ],
  Arms: [
    'Barbell Curl',
    'Dumbbell Curl',
    'Hammer Curl',
    'Preacher Curl',
    'Cable Curl',
    'Incline Dumbbell Curl',
    'Triceps Pushdown',
    'Overhead Triceps Extension',
    'Skull Crushers',
    'Close-Grip Bench Press',
    'Triceps Dips',
  ],
  Legs: [
    'Back Squat',
    'Front Squat',
    'Leg Press',
    'Romanian Deadlift',
    'Bulgarian Split Squat',
    'Walking Lunges',
    'Hack Squat',
    'Leg Extension',
    'Lying Leg Curl',
    'Seated Leg Curl',
    'Hip Thrust',
    'Standing Calf Raise',
    'Seated Calf Raise',
    'Goblet Squat',
  ],
  Core: [
    'Plank',
    'Hanging Leg Raise',
    'Cable Crunch',
    'Ab Wheel Rollout',
    'Russian Twist',
    'Crunches',
  ],
  Cardio: [
    'Treadmill',
    'Incline Walk',
    'Outdoor Run',
    'Walking',
    'Stationary Bike',
    'Outdoor Cycling',
    'Spin Bike',
    'Assault Bike',
    'Rowing Machine',
    'Ski Erg',
    'Stair Climber',
    'Elliptical',
    'Swimming',
    'Jump Rope',
  ],
}

/** Cardio is logged as minutes + distance instead of weight × reps. */
export const CARDIO_EXERCISES = new Set(EXERCISE_LIBRARY.Cardio)

export function isCardioExercise(name: string): boolean {
  return CARDIO_EXERCISES.has(name)
}

export const ALL_EXERCISES = Object.entries(EXERCISE_LIBRARY).flatMap(([group, names]) =>
  names.map((name) => ({ group, name })),
)

const ex = (name: string, sets = 3, reps = 10): PlanExercise => ({ name, sets, reps })

export interface SplitTemplate {
  id: string
  name: string
  description: string
  /** How many training days per week this split suits. */
  daysPerWeek: string
  days: { name: string; exercises: PlanExercise[] }[]
}

export const SPLITS: SplitTemplate[] = [
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    description: 'Chest, shoulders & triceps · back & biceps · legs. Run once or twice a week.',
    daysPerWeek: '3–6 days',
    days: [
      {
        name: 'Push',
        exercises: [
          ex('Barbell Bench Press', 4, 8),
          ex('Overhead Press', 3, 8),
          ex('Incline Dumbbell Press', 3, 10),
          ex('Lateral Raise', 3, 15),
          ex('Triceps Pushdown', 3, 12),
        ],
      },
      {
        name: 'Pull',
        exercises: [
          ex('Pull-ups', 3, 8),
          ex('Barbell Row', 4, 8),
          ex('Lat Pulldown', 3, 10),
          ex('Face Pull', 3, 15),
          ex('Barbell Curl', 3, 12),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          ex('Back Squat', 4, 6),
          ex('Romanian Deadlift', 3, 8),
          ex('Leg Press', 3, 12),
          ex('Lying Leg Curl', 3, 12),
          ex('Standing Calf Raise', 4, 15),
        ],
      },
    ],
  },
  {
    id: 'upper_lower',
    name: 'Upper / Lower',
    description: 'Alternate upper-body and lower-body days. Great balance of volume and recovery.',
    daysPerWeek: '4 days',
    days: [
      {
        name: 'Upper A',
        exercises: [
          ex('Barbell Bench Press', 4, 6),
          ex('Barbell Row', 4, 8),
          ex('Overhead Press', 3, 8),
          ex('Lat Pulldown', 3, 10),
          ex('Dumbbell Curl', 2, 12),
          ex('Triceps Pushdown', 2, 12),
        ],
      },
      {
        name: 'Lower A',
        exercises: [
          ex('Back Squat', 4, 6),
          ex('Romanian Deadlift', 3, 8),
          ex('Walking Lunges', 3, 10),
          ex('Lying Leg Curl', 3, 12),
          ex('Standing Calf Raise', 3, 15),
        ],
      },
      {
        name: 'Upper B',
        exercises: [
          ex('Incline Dumbbell Press', 4, 10),
          ex('Pull-ups', 4, 8),
          ex('Seated Dumbbell Press', 3, 10),
          ex('Seated Cable Row', 3, 10),
          ex('Lateral Raise', 3, 15),
        ],
      },
      {
        name: 'Lower B',
        exercises: [
          ex('Deadlift', 3, 5),
          ex('Leg Press', 3, 10),
          ex('Bulgarian Split Squat', 3, 10),
          ex('Leg Extension', 3, 12),
          ex('Hanging Leg Raise', 3, 12),
        ],
      },
    ],
  },
  {
    id: 'full_body',
    name: 'Full Body',
    description: 'Every session hits the whole body. Ideal if you train 2–3 times a week.',
    daysPerWeek: '2–3 days',
    days: [
      {
        name: 'Full Body A',
        exercises: [
          ex('Back Squat', 3, 8),
          ex('Barbell Bench Press', 3, 8),
          ex('Barbell Row', 3, 8),
          ex('Lateral Raise', 2, 15),
          ex('Plank', 3, 1),
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          ex('Deadlift', 3, 5),
          ex('Overhead Press', 3, 8),
          ex('Lat Pulldown', 3, 10),
          ex('Walking Lunges', 3, 10),
          ex('Dumbbell Curl', 2, 12),
        ],
      },
    ],
  },
  {
    id: 'bro',
    name: 'Bro Split',
    description: 'One muscle group per day. High volume per muscle, needs 5 days.',
    daysPerWeek: '5 days',
    days: [
      {
        name: 'Chest',
        exercises: [
          ex('Barbell Bench Press', 4, 8),
          ex('Incline Dumbbell Press', 3, 10),
          ex('Chest Fly (Machine)', 3, 12),
          ex('Chest Dips', 3, 10),
        ],
      },
      {
        name: 'Back',
        exercises: [ex('Deadlift', 3, 5), ex('Pull-ups', 3, 8), ex('Barbell Row', 3, 8), ex('Seated Cable Row', 3, 12)],
      },
      {
        name: 'Shoulders',
        exercises: [ex('Overhead Press', 4, 8), ex('Lateral Raise', 4, 15), ex('Rear Delt Fly', 3, 15), ex('Shrugs', 3, 12)],
      },
      {
        name: 'Arms',
        exercises: [
          ex('Barbell Curl', 3, 10),
          ex('Close-Grip Bench Press', 3, 8),
          ex('Hammer Curl', 3, 12),
          ex('Overhead Triceps Extension', 3, 12),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          ex('Back Squat', 4, 6),
          ex('Leg Press', 3, 12),
          ex('Lying Leg Curl', 3, 12),
          ex('Standing Calf Raise', 4, 15),
        ],
      },
    ],
  },
  {
    id: 'arnold',
    name: 'Arnold Split',
    description: 'Chest & back · shoulders & arms · legs. Classic antagonist pairing.',
    daysPerWeek: '3–6 days',
    days: [
      {
        name: 'Chest & Back',
        exercises: [
          ex('Barbell Bench Press', 4, 8),
          ex('Pull-ups', 4, 8),
          ex('Incline Dumbbell Press', 3, 10),
          ex('Barbell Row', 3, 10),
          ex('Dumbbell Fly', 3, 12),
        ],
      },
      {
        name: 'Shoulders & Arms',
        exercises: [
          ex('Arnold Press', 4, 10),
          ex('Lateral Raise', 3, 15),
          ex('Barbell Curl', 3, 10),
          ex('Skull Crushers', 3, 10),
          ex('Hammer Curl', 3, 12),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          ex('Back Squat', 4, 8),
          ex('Romanian Deadlift', 3, 10),
          ex('Leg Extension', 3, 12),
          ex('Seated Leg Curl', 3, 12),
          ex('Seated Calf Raise', 4, 15),
        ],
      },
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Build your own days from the exercise list.',
    daysPerWeek: 'Any',
    days: [{ name: 'Day 1', exercises: [] }],
  },
]

export function splitById(id: string): SplitTemplate {
  return SPLITS.find((s) => s.id === id) ?? SPLITS[SPLITS.length - 1]
}

/** Suggest a split based on how many days per week someone wants to train. */
export function recommendedSplit(daysPerWeek: number): string {
  if (daysPerWeek <= 3) return 'full_body'
  if (daysPerWeek === 4) return 'upper_lower'
  return 'ppl'
}

export function planFromTemplate(id: string): PlanDay[] {
  return splitById(id).days.map((d, i) => ({
    position: i,
    name: d.name,
    exercises: d.exercises.map((e) => ({ ...e })),
  }))
}

/** Rough daily calorie suggestion: ~30 kcal/kg maintenance, adjusted for the goal. */
export function suggestCalories(weightKg: number | null, goal: 'lose' | 'maintain' | 'gain'): number {
  const maintenance = Math.round(((weightKg || 75) * 30) / 50) * 50
  const adjusted = goal === 'lose' ? maintenance - 400 : goal === 'gain' ? maintenance + 300 : maintenance
  return Math.min(6000, Math.max(1200, adjusted))
}
