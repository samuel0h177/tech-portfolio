/** Unset or "true" is on; "false" / "0" / "off" is off. */
export function viteFlagEnabled(value: string | undefined): boolean {
  if (value == null || value === '') return true;
  const v = value.trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off';
}
