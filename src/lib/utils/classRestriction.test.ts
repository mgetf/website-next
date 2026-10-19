import { describe, expect, it } from 'vitest';
import { TF_CLASS_IDS } from '#lib/constants/tfClasses.js';
import {
  hasInvalidClassId,
  orderedRestrictedClassIds,
  restrictedClassesFromIds,
} from './classRestriction';

describe('orderedRestrictedClassIds', () => {
  it('returns valid ids in class-select order and drops duplicates', () => {
    expect(
      orderedRestrictedClassIds([
        TF_CLASS_IDS.medic,
        TF_CLASS_IDS.scout,
        TF_CLASS_IDS.soldier,
        TF_CLASS_IDS.scout,
      ]),
    ).toEqual([TF_CLASS_IDS.scout, TF_CLASS_IDS.soldier, TF_CLASS_IDS.medic]);
  });

  it('returns an empty list when nothing is restricted', () => {
    expect(orderedRestrictedClassIds([])).toEqual([]);
  });
});

describe('hasInvalidClassId', () => {
  it('rejects ids that are not a TF2 class', () => {
    expect(hasInvalidClassId([TF_CLASS_IDS.scout, 99])).toBe(true);
    expect(hasInvalidClassId([1.5])).toBe(true);
  });

  it('accepts a real class list', () => {
    expect(hasInvalidClassId([TF_CLASS_IDS.pyro, TF_CLASS_IDS.spy])).toBe(false);
    expect(hasInvalidClassId([])).toBe(false);
  });
});

describe('restrictedClassesFromIds', () => {
  it('maps ids to labels and ignores unknown ids', () => {
    expect(restrictedClassesFromIds([TF_CLASS_IDS.sniper, 42, TF_CLASS_IDS.scout])).toEqual([
      { id: TF_CLASS_IDS.scout, name: 'scout', label: 'Scout' },
      { id: TF_CLASS_IDS.sniper, name: 'sniper', label: 'Sniper' },
    ]);
  });
});
