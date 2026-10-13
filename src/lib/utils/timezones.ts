export type TimezoneOption = {
  value: string;
  label: string;
};

/** IANA timezones from the runtime, UTC first, then the rest in alphabetical order. */
export function standardTimezoneOptions(): TimezoneOption[] {
  const zones = Intl.supportedValuesOf('timeZone');
  const rest = zones.filter((zone) => zone !== 'UTC').sort((a, b) => a.localeCompare(b, 'en'));

  return [{ value: 'UTC', label: 'UTC' }, ...rest.map((zone) => ({ value: zone, label: zone }))];
}
