/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared validation for user-entered names (Fabric workspace name, source
 * connection name, etc.) — trims leading/trailing whitespace and flags
 * anything other than letters/digits so the person gets a clear warning
 * instead of a cryptic Fabric API error later.
 */

const VALID_NAME_PATTERN = /^[A-Za-z0-9]+$/;

export interface NameValidationResult {
  /** Leading/trailing whitespace removed — always safe to use as the
   * actual value, regardless of `isValid`. */
  trimmed: string;
  /** True only if `trimmed` is non-empty and contains nothing but
   * letters and digits (no spaces, no punctuation, no symbols). */
  isValid: boolean;
  /** Human-readable warning to show under the field when invalid;
   * `null` when the name is valid (or empty — empty just means "not
   * filled in yet", handled separately by each form's own required-field
   * check, not as a special-character warning). */
  warning: string | null;
}

export function validateSimpleName(raw: string): NameValidationResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { trimmed, isValid: false, warning: null };
  }
  const isValid = VALID_NAME_PATTERN.test(trimmed);
  return {
    trimmed,
    isValid,
    warning: isValid
      ? null
      : 'Only letters and numbers are allowed — please remove any spaces, symbols, or special characters.',
  };
}