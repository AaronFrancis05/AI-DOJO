export interface SituationCharacterCount {
  situationId: number;
  count: number;
}

export const DEFAULT_CHARACTER_COUNT = 3;

export const situationCharacterCounts: SituationCharacterCount[] = [
  { situationId: 1,  count: 3 },
  { situationId: 2,  count: 2 },
  { situationId: 3,  count: 4 },
  { situationId: 5,  count: 2 },
  { situationId: 6,  count: 3 },
  { situationId: 7,  count: 4 },
  { situationId: 8,  count: 2 },
  { situationId: 9,  count: 3 },
  { situationId: 10, count: 4 },
  { situationId: 11, count: 2 },
  { situationId: 12, count: 3 },
  { situationId: 13, count: 4 },
  { situationId: 14, count: 2 },
  { situationId: 15, count: 3 },
  { situationId: 16, count: 4 },
  { situationId: 17, count: 2 },
  { situationId: 18, count: 3 },
  { situationId: 19, count: 4 },
  { situationId: 20, count: 2 },
  { situationId: 21, count: 3 },
  { situationId: 22, count: 4 },
  { situationId: 23, count: 2 },
  { situationId: 24, count: 3 },
  { situationId: 25, count: 4 },
  { situationId: 26, count: 2 },
  { situationId: 27, count: 3 },
  { situationId: 28, count: 4 },
  { situationId: 29, count: 2 },
  { situationId: 30, count: 3 },
  { situationId: 31, count: 4 },
  { situationId: 32, count: 2 },
  { situationId: 33, count: 3 },
  { situationId: 34, count: 4 },
  { situationId: 35, count: 2 },
];

export function getCharacterCount(situationId: number): number {
  const entry = situationCharacterCounts.find(
    (s) => s.situationId === situationId,
  );
  return entry?.count ?? DEFAULT_CHARACTER_COUNT;
}