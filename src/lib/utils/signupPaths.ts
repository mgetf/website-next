export type SignupFormatOption = {
  id: number;
  code: string;
  isIndividual: boolean;
};

export function signupPathForFormat(
  format: SignupFormatOption,
  teamMode: 'create' | 'existing' = 'create',
): string {
  if (format.isIndividual) return `/signup/${format.code}`;
  return teamMode === 'existing'
    ? `/signup/${format.code}/existing`
    : `/signup/${format.code}/create`;
}
