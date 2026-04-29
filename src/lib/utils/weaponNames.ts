// Display-name overrides for raw TF2/MGE weapon identifiers found in match logs.
// Source reference: logstf-web `weapons.py`. Unknown weapons fall back to a humanized form.

const WEAPON_DISPLAY_NAMES: Record<string, string> = {
  world: 'Finished off',
  shotgun_soldier: 'Shotgun',
  tf_projectile_rocket: 'Rocket Launcher',
  tf_projectile_pipe: 'Grenade Launcher',
  tf_projectile_pipe_remote: 'Sticky Launcher',
  quake_rl: 'Original',
  sniperrifle: 'Sniper Rifle',
  scattergun: 'Scattergun',
  pistol_scout: 'Pistol',
  crusaders_crossbow: "Crusader's Crossbow",
  syringegun_medic: 'Syringe Gun',
  ullapool_caber: 'Ullapool Caber',
  ullapool_caber_explosion: 'Ullapool Caber Explosion',
  minigun: 'Minigun',
  shotgun_primary: 'Shotgun',
  revolver: 'Revolver',
  shotgun_pyro: 'Shotgun',
  degreaser: 'Degreaser',
  knife: 'Knife',
  axtinguisher: 'Axtinguisher',
  obj_minisentry: 'Minisentry',
  awper_hand: 'Awper Hand',
  flaregun: 'Flare Gun',
  tribalkukri: 'Kukri',
  bleed_kill: 'Bleed',
  deflect_rocket: 'Deflected Rocket',
  letranger: "L'Etranger",
  rocketlauncher_directhit: 'Direct Hit',
  blackbox: 'Black Box',
  robot_arm: 'Gunslinger Melee',
  flamethrower: 'Flamethrower',
  obj_sentrygun: 'Sentry Gun Lvl 1',
  obj_sentrygun2: 'Sentry Gun Lvl 2',
  obj_sentrygun3: 'Sentry Gun Lvl 3',
  ubersaw: 'Ubersaw',
  the_winger: 'Winger',
  iron_curtain: 'Iron Curtain',
  steel_fists: 'Fists of Steel',
  short_circuit: 'Short Circuit',
  the_rescue_ranger: 'Rescue Ranger',
  wrangler_kill: 'Wrangler',
  fryingpan: 'Pan',
  spy_cicle: 'Spycicle',
  unique_pickaxe_escape: 'Escape Plan',
};

export function formatWeaponName(rawName: string): string {
  const known = WEAPON_DISPLAY_NAMES[rawName];
  if (known) return known;
  return rawName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
