import {
  isValidTfClassId,
  TF_CLASSES_DISPLAY_ORDER,
  type TfClassId,
} from '#lib/constants/tfClasses.js';
import type { TeamClassRestriction } from '#lib/types/team.js';

/** Keep valid class ids, drop duplicates, and return them in class-select order. */
export function orderedRestrictedClassIds(ids: readonly number[]): TfClassId[] {
  const wanted = new Set(ids);
  return TF_CLASSES_DISPLAY_ORDER.filter((tfClass) => wanted.has(tfClass.id)).map(
    (tfClass) => tfClass.id,
  );
}

export function hasInvalidClassId(ids: readonly number[]): boolean {
  return ids.some((id) => !Number.isInteger(id) || !isValidTfClassId(id));
}

/** Map stored class ids to display rows. Unknown ids are ignored. */
export function restrictedClassesFromIds(ids: readonly number[]): TeamClassRestriction[] {
  const wanted = new Set(orderedRestrictedClassIds(ids));
  return TF_CLASSES_DISPLAY_ORDER.filter((tfClass) => wanted.has(tfClass.id)).map((tfClass) => ({
    id: tfClass.id,
    name: tfClass.name,
    label: tfClass.label,
  }));
}
