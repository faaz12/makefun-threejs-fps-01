// Weapons for FROSTLINE: four buyable guns plus a thrown cryo charge.
// Every weapon is pure data; firing, reload and spread live in the
// simulation, so bots and the player share the same numbers.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P7 Frostbite', kind: 'pistol', price: 0,
    damage: 34, headMult: 3.0, fireInterval: 0.22, auto: false,
    mag: 12, reserveMax: 48, reloadTime: 1.1, spread: 0.011, moveSpread: 0.02,
    range: 60, sound: 'pistol', kick: 0.011, tracerColor: 0xffe9a8,
  },
  smg: {
    id: 'smg', name: 'K-12 Gale', kind: 'smg', price: 1500,
    damage: 22, headMult: 2.6, fireInterval: 0.085, auto: true,
    mag: 28, reserveMax: 112, reloadTime: 1.5, spread: 0.017, moveSpread: 0.03,
    range: 45, sound: 'smg', kick: 0.007, tracerColor: 0xffe9a8,
  },
  rifle: {
    id: 'rifle', name: 'AR-90 Northwind', kind: 'rifle', price: 2700,
    damage: 33, headMult: 3.0, fireInterval: 0.12, auto: true,
    mag: 25, reserveMax: 75, reloadTime: 1.9, spread: 0.008, moveSpread: 0.024,
    range: 80, sound: 'rifle', kick: 0.014, tracerColor: 0xffe9a8,
  },
  sniper: {
    id: 'sniper', name: 'V-88 Whiteout', kind: 'sniper', price: 4750,
    damage: 92, headMult: 2.5, fireInterval: 1.15, auto: false,
    mag: 5, reserveMax: 15, reloadTime: 2.6, spread: 0.001, moveSpread: 0.06,
    range: 120, sound: 'sniper', kick: 0.05, tracerColor: 0xffe9a8,
  },
};

export const GRENADE = {
  id: 'grenade', name: 'Cryo Charge', price: 300, maxCarry: 2,
  fuse: 1.6, radius: 6.5, damage: 110, throwSpeed: 17,
};

export const BUY_ORDER = ['pistol', 'smg', 'rifle', 'sniper', 'grenade', 'armor'];
export const ARMOR_PRICE = 650;
export const ARMOR_VALUE = 100;

// A fresh owned-weapon state for one actor.
export function newLoadout() {
  return {
    pistol: { mag: 12, reserve: 48 },
    smg: { mag: 0, reserve: 0 },
    rifle: { mag: 0, reserve: 0 },
    sniper: { mag: 0, reserve: 0 },
    grenades: 0,
    armor: 0,
    current: 'pistol',
  };
}

// Buying a weapon gives a full mag plus reserve; buying again tops the reserve up.
export function buyWeapon(loadout, id) {
  const def = WEAPONS[id];
  if (!def) return false;
  const slot = loadout[id];
  if (slot.mag === 0 && slot.reserve === 0) {
    slot.mag = def.mag;
    slot.reserve = def.reserveMax;
  } else {
    slot.reserve = Math.min(def.reserveMax, slot.reserve + def.reserveMax);
  }
  loadout.current = id;
  return true;
}

export function currentWeapon(loadout) {
  return WEAPONS[loadout.current];
}

export function currentAmmo(loadout) {
  return loadout[loadout.current];
}
