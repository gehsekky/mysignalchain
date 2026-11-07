export const MINIMUM_AGE = 13;

/**
 * Month and year only, so during the 13th birthday month we can't tell whether
 * the birthday has passed. That month fails the check, which errs on the safe side.
 *
 * @param birthMonth 1-12
 */
export function isOldEnough(
  birthYear: number,
  birthMonth: number,
  now: Date,
): boolean {
  const birthMonths = birthYear * 12 + (birthMonth - 1);
  const currentMonths = now.getUTCFullYear() * 12 + now.getUTCMonth();
  return currentMonths - birthMonths > MINIMUM_AGE * 12;
}
