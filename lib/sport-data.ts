// Exercise library for the Sport tab (shared by server and browser).
// kind: weight = kg × reps · body = reps (optional extra kg) · time = seconds · cardio = minutes + km

export type ExerciseKind = 'weight' | 'body' | 'time' | 'cardio';
export interface Exercise { id: string; name: string; group: string; kind: ExerciseKind }

export const MUSCLE_GROUPS = ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Bauch', 'Ganzkörper', 'Ausdauer'] as const;

const E = (id: string, name: string, group: string, kind: ExerciseKind = 'weight'): Exercise => ({ id, name, group, kind });

export const EXERCISES: Exercise[] = [
  // Brust
  E('bench', 'Bankdrücken (Langhantel)', 'Brust'), E('db-bench', 'Bankdrücken (Kurzhantel)', 'Brust'), E('incline', 'Schrägbankdrücken', 'Brust'),
  E('fly', 'Fliegende', 'Brust'), E('chest-press', 'Brustpresse (Maschine)', 'Brust'), E('pushup', 'Liegestütze', 'Brust', 'body'), E('dips', 'Dips', 'Brust', 'body'),
  // Rücken
  E('deadlift', 'Kreuzheben', 'Rücken'), E('row', 'Langhantelrudern', 'Rücken'), E('db-row', 'Kurzhantelrudern', 'Rücken'), E('pullup', 'Klimmzüge', 'Rücken', 'body'),
  E('lat', 'Latzug', 'Rücken'), E('cable-row', 'Rudern am Kabel', 'Rücken'), E('hyper', 'Rückenstrecker', 'Rücken', 'body'),
  // Beine
  E('squat', 'Kniebeugen (Langhantel)', 'Beine'), E('goblet', 'Goblet Squat', 'Beine'), E('legpress', 'Beinpresse', 'Beine'), E('lunge', 'Ausfallschritte', 'Beine'),
  E('rdl', 'Rumänisches Kreuzheben', 'Beine'), E('legcurl', 'Beinbeuger', 'Beine'), E('legext', 'Beinstrecker', 'Beine'), E('calf', 'Wadenheben', 'Beine'),
  E('hipthrust', 'Hip Thrust', 'Beine'), E('bw-squat', 'Kniebeugen (Körpergewicht)', 'Beine', 'body'), E('jump-squat', 'Sprungkniebeugen', 'Beine', 'body'),
  // Schultern
  E('ohp', 'Schulterdrücken (Langhantel)', 'Schultern'), E('db-ohp', 'Schulterdrücken (Kurzhantel)', 'Schultern'), E('lateral', 'Seitheben', 'Schultern'),
  E('facepull', 'Face Pulls', 'Schultern'), E('reverse-fly', 'Reverse Flys', 'Schultern'),
  // Arme
  E('curl', 'Bizepscurls', 'Arme'), E('hammer', 'Hammercurls', 'Arme'), E('triceps', 'Trizepsdrücken (Kabel)', 'Arme'), E('skull', 'French Press', 'Arme'),
  // Bauch
  E('plank', 'Unterarmstütz (Plank)', 'Bauch', 'time'), E('crunch', 'Crunches', 'Bauch', 'body'), E('legraise', 'Beinheben', 'Bauch', 'body'),
  E('russian', 'Russian Twists', 'Bauch', 'body'), E('situp', 'Sit-ups', 'Bauch', 'body'),
  // Ganzkörper
  E('burpee', 'Burpees', 'Ganzkörper', 'body'), E('kb-swing', 'Kettlebell Swings', 'Ganzkörper'), E('clean', 'Umsetzen', 'Ganzkörper'),
  E('mountain', 'Mountain Climbers', 'Ganzkörper', 'time'), E('jumping-jack', 'Hampelmänner', 'Ganzkörper', 'time'),
  // Ausdauer
  E('run', 'Laufen', 'Ausdauer', 'cardio'), E('bike', 'Radfahren', 'Ausdauer', 'cardio'), E('swim', 'Schwimmen', 'Ausdauer', 'cardio'),
  E('rope', 'Seilspringen', 'Ausdauer', 'time'), E('rowing', 'Rudergerät', 'Ausdauer', 'cardio'), E('walk', 'Gehen', 'Ausdauer', 'cardio'),
];

export const exerciseById = (id: string): Exercise | undefined => EXERCISES.find(e => e.id === id);

/** One set: weight (kg) × reps, or seconds, or minutes + km – depending on the exercise kind. */
export interface WorkoutSet { kg?: number | null; reps?: number | null; sec?: number | null; km?: number | null; done?: boolean }
export interface WorkoutExercise { id: string; name: string; kind: ExerciseKind; sets: WorkoutSet[] }

/** Estimated one-rep max (Epley) – used for "Bestleistung" and progress. */
export const oneRepMax = (kg: number, reps: number) => (reps <= 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10);

/** Training load of a workout in kg (sum of kg × reps of done sets). */
export function volume(exercises: WorkoutExercise[]): number {
  let v = 0;
  for (const e of exercises) for (const s of e.sets) if (s.done !== false && s.kg && s.reps) v += s.kg * s.reps;
  return Math.round(v);
}

export function setLabel(kind: ExerciseKind, s: WorkoutSet): string {
  if (kind === 'weight') return `${s.kg ?? 0} kg × ${s.reps ?? 0}`;
  if (kind === 'body') return `${s.reps ?? 0} Wdh.${s.kg ? ` (+${s.kg} kg)` : ''}`;
  if (kind === 'time') return `${s.sec ?? 0} s`;
  return `${s.sec ? Math.round(s.sec / 60) : 0} min${s.km ? ` · ${s.km} km` : ''}`;
}
