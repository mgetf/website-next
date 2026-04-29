import scout from '$lib/assets/icons/tf/scout.png';
import soldier from '$lib/assets/icons/tf/soldier.png';
import pyro from '$lib/assets/icons/tf/pyro.png';
import demoman from '$lib/assets/icons/tf/demoman.png';
import heavy from '$lib/assets/icons/tf/heavy.png';
import engineer from '$lib/assets/icons/tf/engineer.png';
import medic from '$lib/assets/icons/tf/medic.png';
import sniper from '$lib/assets/icons/tf/sniper.png';
import spy from '$lib/assets/icons/tf/spy.png';

const CLASS_ICONS: Record<string, string> = {
  scout,
  soldier,
  pyro,
  demoman,
  heavy,
  engineer,
  medic,
  sniper,
  spy,
};

export function classIcon(className: string | null | undefined): string | null {
  if (!className) return null;
  return CLASS_ICONS[className.toLowerCase()] ?? null;
}
