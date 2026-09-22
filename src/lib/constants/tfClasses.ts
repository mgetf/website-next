/**
 * Team Fortress 2 class IDs as stored by SourceMod / classelo.
 * Safe to import from both client and server code.
 */
export const TF_CLASS_IDS = {
  scout: 1,
  sniper: 2,
  soldier: 3,
  demoman: 4,
  medic: 5,
  heavy: 6,
  pyro: 7,
  spy: 8,
  engineer: 9,
} as const;

export type TfClassId = (typeof TF_CLASS_IDS)[keyof typeof TF_CLASS_IDS];

export interface TfClassOption {
  id: TfClassId;
  name: string;
  label: string;
}

/** Class select screen order: Scout through Spy. */
export const TF_CLASSES_DISPLAY_ORDER: readonly TfClassOption[] = [
  { id: TF_CLASS_IDS.scout, name: 'scout', label: 'Scout' },
  { id: TF_CLASS_IDS.soldier, name: 'soldier', label: 'Soldier' },
  { id: TF_CLASS_IDS.pyro, name: 'pyro', label: 'Pyro' },
  { id: TF_CLASS_IDS.demoman, name: 'demoman', label: 'Demoman' },
  { id: TF_CLASS_IDS.heavy, name: 'heavy', label: 'Heavy' },
  { id: TF_CLASS_IDS.engineer, name: 'engineer', label: 'Engineer' },
  { id: TF_CLASS_IDS.medic, name: 'medic', label: 'Medic' },
  { id: TF_CLASS_IDS.sniper, name: 'sniper', label: 'Sniper' },
  { id: TF_CLASS_IDS.spy, name: 'spy', label: 'Spy' },
];

const TF_CLASS_BY_ID = new Map<number, TfClassOption>(
  TF_CLASSES_DISPLAY_ORDER.map((cls) => [cls.id, cls]),
);

export function isValidTfClassId(value: number): value is TfClassId {
  return TF_CLASS_BY_ID.has(value);
}

export function tfClassById(id: number): TfClassOption | null {
  return TF_CLASS_BY_ID.get(id) ?? null;
}
