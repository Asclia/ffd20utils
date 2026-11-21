// Core numeric tables for FFd20 (Pathfinder 1e base + FFd20 overrides).
// Sources: PF1e Bestiary "Monster Creation" and finalfantasyd20.com (Creature MP Chart,
// MP System, Creating NPCs, Boss subtypes).

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
export const ABILITY_LONG = { str: 'Força', dex: 'Destreza', con: 'Constituição', int: 'Inteligência', wis: 'Sabedoria', cha: 'Carisma' };

export const mod = (score) => (score === null || score === undefined ? 0 : Math.floor((score - 10) / 2));
export const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---------------------------------------------------------------- CR
// CR values used across the app. Fractions are stored as numbers.
export const CR_LIST = [1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, ...Array.from({ length: 30 }, (_, i) => i + 1)];
export function crLabel(cr) {
  if (cr === null || cr === undefined || cr === '') return '—';
  const n = Number(cr);
  const fr = { 0.125: '1/8', [1 / 6]: '1/6', 0.25: '1/4', [1 / 3]: '1/3', 0.5: '1/2' };
  for (const [k, v] of Object.entries(fr)) if (Math.abs(Number(k) - n) < 0.001) return v;
  return String(Math.round(n * 100) / 100);
}
export function parseCR(s) {
  if (typeof s === 'number') return s;
  if (!s) return null;
  const m = String(s).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const XP_BY_CR = {
  0.125: 50, [1 / 6]: 65, 0.25: 100, [1 / 3]: 135, 0.5: 200, 1: 400, 2: 600, 3: 800, 4: 1200, 5: 1600, 6: 2400,
  7: 3200, 8: 4800, 9: 6400, 10: 9600, 11: 12800, 12: 19200, 13: 25600, 14: 38400, 15: 51200,
  16: 76800, 17: 102400, 18: 153600, 19: 204800, 20: 307200, 21: 409600, 22: 614400,
  23: 819200, 24: 1228800, 25: 1638400, 26: 2457600, 27: 3276800, 28: 4915200, 29: 6553600, 30: 9830400,
};
export function xpForCR(cr) {
  if (cr === null || cr === undefined) return null;
  for (const [k, v] of Object.entries(XP_BY_CR)) if (Math.abs(Number(k) - cr) < 0.001) return v;
  return null;
}

// PF1e Monster Statistics by CR (Bestiary table 1-1).
// [cr, hp, ac, highAtk, lowAtk, dmgHigh, dmgLow, primaryDC, secondaryDC, goodSave, poorSave]
const STATS_ROWS = [
  [0.5, 10, 11, 1, 0, 4, 3, 11, 8, 3, 0],
  [1, 15, 12, 2, 1, 7, 5, 12, 9, 4, 1],
  [2, 20, 14, 4, 3, 10, 7, 13, 9, 5, 1],
  [3, 30, 15, 6, 4, 13, 9, 14, 10, 6, 2],
  [4, 40, 17, 8, 6, 16, 12, 15, 10, 7, 3],
  [5, 55, 18, 10, 7, 20, 15, 15, 11, 8, 4],
  [6, 70, 19, 12, 8, 25, 18, 16, 11, 9, 5],
  [7, 85, 20, 13, 10, 30, 22, 17, 12, 10, 6],
  [8, 100, 21, 15, 11, 35, 26, 18, 12, 11, 7],
  [9, 115, 23, 17, 12, 40, 30, 18, 13, 12, 8],
  [10, 130, 24, 18, 13, 45, 33, 19, 13, 13, 9],
  [11, 145, 25, 19, 14, 50, 37, 20, 14, 14, 10],
  [12, 160, 27, 21, 15, 55, 41, 21, 15, 15, 11],
  [13, 180, 28, 22, 16, 60, 45, 21, 15, 16, 12],
  [14, 200, 29, 23, 17, 65, 48, 22, 16, 17, 12],
  [15, 220, 30, 24, 18, 70, 52, 23, 16, 18, 13],
  [16, 240, 31, 26, 19, 80, 60, 24, 17, 19, 14],
  [17, 270, 32, 27, 20, 90, 67, 24, 18, 20, 15],
  [18, 300, 33, 28, 21, 100, 75, 25, 18, 20, 16],
  [19, 330, 34, 29, 22, 110, 82, 26, 19, 21, 16],
  [20, 370, 36, 30, 23, 120, 90, 27, 20, 22, 17],
  [21, 400, 37, 31, 24, 130, 97, 28, 20, 23, 18],
  [22, 440, 39, 32, 25, 140, 105, 28, 21, 23, 18],
  [23, 480, 40, 33, 26, 150, 112, 29, 22, 24, 19],
  [24, 520, 42, 35, 27, 165, 124, 30, 22, 25, 20],
  [25, 560, 43, 36, 28, 180, 135, 30, 23, 26, 21],
  [26, 600, 44, 37, 29, 195, 146, 31, 24, 27, 22],
  [27, 640, 45, 38, 30, 210, 157, 32, 24, 28, 23],
  [28, 680, 46, 39, 31, 225, 168, 33, 25, 29, 24],
  [29, 720, 47, 40, 32, 240, 180, 34, 26, 30, 25],
  [30, 760, 48, 41, 33, 255, 191, 35, 27, 31, 26],
];
export const MONSTER_STATS = STATS_ROWS.map(([cr, hp, ac, highAtk, lowAtk, dmgHigh, dmgLow, primaryDC, secondaryDC, goodSave, poorSave]) =>
  ({ cr, hp, ac, highAtk, lowAtk, dmgHigh, dmgLow, primaryDC, secondaryDC, goodSave, poorSave }));
export function statsForCR(cr) {
  if (cr === null || cr === undefined) return null;
  if (cr < 0.5) {
    const base = MONSTER_STATS[0];
    return { ...base, cr, hp: Math.max(3, Math.round(base.hp * cr * 2)) };
  }
  let best = MONSTER_STATS[0];
  for (const r of MONSTER_STATS) if (r.cr <= cr) best = r;
  return best;
}

// ---------------------------------------------------------------- Hit dice by type and CR
const HD_CR = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const HD_GROUPS = {
  a: [1, 2, 3, 4, 5, 7, 9, 10, 12, 14, 15, 16, 17, 19, 20, 22, 24, 26, 28, 30, 34], // aberration, animal, humanoid, ooze, plant, undead, vermin
  b: [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 18, 19, 20, 21, 23, 25, 28, 31], // construct, magical beast, monstrous humanoid, outsider
  d: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 23, 25, 29], // dragon
  f: [2, 3, 4, 5, 6, 8, 10, 12, 13, 15, 17, 18, 20, 22, 23, 25, 26, 28, 31, 33, 37], // fey
};
export function suggestedHD(typeId, cr) {
  const g = { dragon: 'd', fey: 'f', construct: 'b', 'magical-beast': 'b', 'monstrous-humanoid': 'b', outsider: 'b' }[typeId] || 'a';
  const arr = HD_GROUPS[g];
  if (cr === null || cr === undefined) return arr[0];
  if (cr < 0.5) return 1;
  let idx = 0;
  HD_CR.forEach((c, i) => { if (c <= cr) idx = i; });
  let hd = arr[idx];
  if (cr > 20) hd = Math.round(arr[arr.length - 1] + (cr - 20) * (g === 'f' ? 2.5 : 2));
  if (typeId === 'vermin' && cr >= 20) hd = 32;
  return hd;
}

// ---------------------------------------------------------------- Sizes
export const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
export const SIZE_PT = { Fine: 'Minúsculo (Fine)', Diminutive: 'Diminuto', Tiny: 'Miúdo (Tiny)', Small: 'Pequeno', Medium: 'Médio', Large: 'Grande', Huge: 'Enorme', Gargantuan: 'Imenso', Colossal: 'Colossal' };
export const SIZE_DATA = {
  Fine: { mod: 8, special: -8, stealth: 16, fly: 8, space: '1/2 ft.', reach: 0, base: [1, 18, 8], constructHP: 0 },
  Diminutive: { mod: 4, special: -4, stealth: 12, fly: 6, space: '1 ft.', reach: 0, base: [1, 16, 8], constructHP: 0 },
  Tiny: { mod: 2, special: -2, stealth: 8, fly: 4, space: '2-1/2 ft.', reach: 0, base: [2, 14, 8], constructHP: 0 },
  Small: { mod: 1, special: -1, stealth: 4, fly: 2, space: '5 ft.', reach: 5, base: [6, 12, 8], constructHP: 10 },
  Medium: { mod: 0, special: 0, stealth: 0, fly: 0, space: '5 ft.', reach: 5, base: [10, 10, 10], constructHP: 20 },
  Large: { mod: -1, special: 1, stealth: -4, fly: -2, space: '10 ft.', reach: 10, reachLong: 5, base: [18, 8, 14], constructHP: 30 },
  Huge: { mod: -2, special: 2, stealth: -8, fly: -4, space: '15 ft.', reach: 15, reachLong: 10, base: [26, 6, 18], constructHP: 40 },
  Gargantuan: { mod: -4, special: 4, stealth: -12, fly: -6, space: '20 ft.', reach: 20, reachLong: 15, base: [34, 6, 22], constructHP: 60 },
  Colossal: { mod: -8, special: 8, stealth: -16, fly: -8, space: '30 ft.', reach: 30, reachLong: 20, base: [42, 6, 26], constructHP: 80 },
};

// Damage dice progression (PF1e "Tiny and Large weapon damage" / natural attack step table)
// PF1e damage dice progression (Improved Natural Attack / size changes) — two separate chains:
//   d6 chain: 1d2, 1d3, 1d4, 1d6, 1d8, 2d6, 3d6, 4d6, 6d6, 8d6, 12d6
//   d8 chain: 1d10, 2d8, 3d8, 4d8, 6d8, 8d8, 12d8
// 2d4 counts as 1d8; 1d12 goes up to 3d6 (and down to 1d10).
const D6_CHAIN = ['1', '1d2', '1d3', '1d4', '1d6', '1d8', '2d6', '3d6', '4d6', '6d6', '8d6', '12d6', '16d6', '24d6'];
const D8_CHAIN = ['1d10', '2d8', '3d8', '4d8', '6d8', '8d8', '12d8', '16d8', '24d8'];
export const DICE_STEPS = D6_CHAIN; // kept for compatibility
const avgOf = (d) => { const m = /^(\d+)d(\d+)$/.exec(d); return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 : Number(d) || 0; };
function stepOnce(d, dir) {
  if (d === '2d4') d = '1d8';
  if (d === '1d12') return dir > 0 ? '3d6' : '1d10';
  let i = D6_CHAIN.indexOf(d);
  if (i >= 0) {
    if (dir < 0 && i === 0) return d;
    return D6_CHAIN[Math.min(D6_CHAIN.length - 1, i + dir)];
  }
  i = D8_CHAIN.indexOf(d);
  if (i >= 0) {
    if (dir < 0 && i === 0) return '1d8'; // 1d10 down → 1d8
    return D8_CHAIN[Math.min(D8_CHAIN.length - 1, i + dir)];
  }
  // dice outside both chains (2d10, 3d4, 1d12+…): continue from the chain step with the closest average
  const all = [...D6_CHAIN.slice(1), ...D8_CHAIN];
  const near = all.reduce((best, x) => (Math.abs(avgOf(x) - avgOf(d)) < Math.abs(avgOf(best) - avgOf(d)) ? x : best), all[0]);
  return near === d ? d : stepOnce(near, dir);
}
export function stepDice(dice, steps) {
  if (!steps) return dice;
  let d = String(dice).replace(/\s/g, '');
  if (!/^\d+(d\d+)?$/.test(d)) return dice;
  const dir = steps > 0 ? 1 : -1;
  for (let k = 0; k < Math.abs(steps); k++) d = stepOnce(d, dir);
  return d;
}
export function sizeStepsFromMedium(size) {
  return SIZES.indexOf(size) - SIZES.indexOf('Medium');
}
export function scaleDiceForSize(dice, fromSize, toSize) {
  return stepDice(dice, SIZES.indexOf(toSize) - SIZES.indexOf(fromSize));
}
export function avgDice(expr) {
  // supports "2d6+3", "1d8", "4"
  let total = 0;
  const s = String(expr || '').replace(/\s/g, '').replace(/−/g, '-');
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[3]) {
      const n = Number(m[2] || 1);
      total += (m[1] === '-' ? -1 : 1) * n * (Number(m[3]) + 1) / 2;
    } else if (m[5]) {
      total += (m[4] === '-' ? -1 : 1) * Number(m[5]);
    }
  }
  return total;
}

// ---------------------------------------------------------------- Saves & BAB
export const babFor = (prog, hd) => (prog === 'full' ? hd : prog === '3/4' ? Math.floor(hd * 3 / 4) : Math.floor(hd / 2));
export const goodSave = (hd) => (hd > 0 ? 2 + Math.floor(hd / 2) : 0);
export const poorSave = (hd) => Math.floor(hd / 3);

// ---------------------------------------------------------------- MP
// Bonus MP by casting score, column = highest spell level castable (1..9). FFd20 MP System.
const BONUS_MP_ROWS = [
  [10, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [12, [1, 1, 1, 1, 1, 1, 1, 1, 1]],
  [14, [1, 3, 3, 3, 3, 3, 3, 3, 3]],
  [16, [1, 3, 6, 6, 6, 6, 6, 6, 6]],
  [18, [1, 3, 6, 10, 10, 10, 10, 10, 10]],
  [20, [2, 4, 7, 11, 16, 16, 16, 16, 16]],
  [22, [2, 6, 9, 13, 18, 24, 24, 24, 24]],
  [24, [2, 6, 12, 16, 21, 27, 34, 34, 34]],
  [26, [2, 6, 12, 20, 25, 31, 38, 46, 46]],
  [28, [3, 7, 13, 21, 31, 37, 44, 52, 61]],
  [30, [3, 9, 15, 23, 33, 45, 52, 60, 69]],
  [32, [3, 9, 18, 26, 36, 48, 62, 70, 79]],
  [34, [3, 9, 18, 30, 40, 52, 66, 82, 91]],
  [36, [4, 10, 19, 31, 46, 58, 72, 88, 106]],
  [38, [4, 12, 21, 33, 48, 66, 80, 96, 114]],
  [40, [4, 12, 24, 36, 51, 69, 90, 106, 124]],
  [42, [4, 12, 24, 40, 55, 73, 94, 118, 136]],
  [44, [5, 13, 25, 41, 61, 79, 100, 124, 151]],
];
export function bonusMP(score, maxSpellLevel) {
  if (!maxSpellLevel || maxSpellLevel < 1 || score === null || score === undefined || score < 10) return 0;
  const col = Math.min(9, maxSpellLevel) - 1;
  let row = BONUS_MP_ROWS[0][1];
  for (const [min, vals] of BONUS_MP_ROWS) if (score >= min) row = vals;
  return row[col];
}

// Creature MP chart (FFd20): HD -> [fullMP, fullSL, fullBossSL, semiMP, semiSL, semiBossSL, partMP, partSL, partBossSL]
const CMP = [
  null,
  [1, 1, 1, 1, 1, 1, 0, 0, 0], [2, 1, 1, 1, 1, 1, 0, 0, 0], [3, 1, 2, 2, 1, 1, 0, 0, 0],
  [5, 1, 2, 4, 1, 2, 1, 1, 1], [8, 2, 3, 5, 1, 2, 1, 1, 1], [11, 2, 3, 7, 1, 2, 2, 1, 1],
  [15, 2, 4, 9, 2, 3, 2, 1, 2], [19, 2, 4, 11, 2, 3, 3, 1, 2], [24, 3, 5, 13, 2, 3, 3, 1, 2],
  [29, 3, 5, 16, 2, 4, 4, 1, 3], [35, 3, 6, 19, 2, 4, 5, 2, 3], [41, 4, 6, 22, 3, 4, 6, 2, 3],
  [48, 4, 7, 26, 3, 5, 7, 2, 4], [55, 4, 7, 30, 3, 5, 8, 2, 4], [63, 5, 8, 34, 3, 5, 10, 2, 4],
  [71, 5, 8, 38, 4, 6, 11, 2, 4], [80, 5, 9, 43, 4, 6, 12, 3, 4], [89, 6, 9, 47, 4, 6, 14, 3, 4],
  [98, 6, 9, 52, 4, 6, 15, 3, 4], [107, 6, 9, 56, 5, 6, 17, 3, 4], [116, 7, 9, 60, 5, 6, 19, 3, 4],
  [125, 7, 9, 64, 5, 6, 21, 4, 4], [134, 7, 9, 68, 5, 6, 23, 4, 4], [143, 8, 9, 72, 6, 6, 25, 4, 4],
  [152, 8, 9, 76, 6, 6, 27, 4, 4],
];
export const CASTER_TIERS = { none: 'Não conjura', full: 'Full Caster (FC)', semi: 'Semi Caster (SC)', partial: 'Partial Caster (PC)' };
export const CASTER_ABBR = { full: 'FC', semi: 'SC', partial: 'PC' };
export function creatureMP(tier, hd, boss) {
  if (!tier || tier === 'none' || hd < 1) return { mp: 0, maxSL: 0 };
  let row;
  if (hd <= 25) row = CMP[hd];
  else {
    const extra = hd - 25;
    const last = CMP[25];
    row = [last[0] + 9 * extra, hd >= 28 ? 9 : 8, 9, last[3] + 4 * extra, 6, 6, last[6] + 2 * extra, 4, 4];
  }
  const off = tier === 'full' ? 0 : tier === 'semi' ? 3 : 6;
  return { mp: row[off], maxSL: boss ? row[off + 2] : row[off + 1] };
}

// ---------------------------------------------------------------- Limit breaks / burst
export const limitBreakUses = (level) => (level < 1 ? 0 : 1 + Math.floor((level - 1) / 4));
export const burstUses = (hd) => 1 + Math.floor(hd / 4);
export const burstDuration = (hd) => 1 + Math.floor(hd / 4);

// ---------------------------------------------------------------- Boss tiers
export const BOSS_TIERS = {
  none: { label: 'Nenhum', short: '' },
  mini: { label: 'Mini-Boss', short: 'Mini-Boss' },
  boss: { label: 'Boss', short: 'Boss' },
  super: { label: 'Super Boss', short: 'Super Boss' },
};
export const BOSS_IMMUNITIES = ['banish', 'gravity', 'frog', 'mini', 'disable', 'death', 'paralysis', 'sleep', 'stop', 'stun', 'petrification'];

// ---------------------------------------------------------------- NPC gear (FFd20 Creating NPCs)
// [basicLevel, heroicLevel, total, weapons, protection, magic, limited, gear]
export const NPC_GEAR = [
  [1, null, 260, 50, 130, 0, 40, 40], [2, 1, 390, 100, 150, 0, 40, 100], [3, 2, 780, 350, 200, 0, 80, 150],
  [4, 3, 1650, 650, 800, 0, 100, 200], [5, 4, 2400, 900, 1000, 0, 300, 200], [6, 5, 3450, 1400, 1400, 0, 450, 200],
  [7, 6, 4650, 2350, 1650, 0, 450, 200], [8, 7, 6000, 2700, 2000, 500, 600, 200], [9, 8, 7800, 3000, 2500, 1000, 800, 500],
  [10, 9, 10050, 3500, 3000, 2000, 1050, 500], [11, 10, 12750, 4000, 4000, 3000, 1250, 500], [12, 11, 16350, 6000, 4500, 4000, 1350, 500],
  [13, 12, 21000, 8500, 5500, 5000, 1500, 500], [14, 13, 27000, 9000, 8000, 7000, 2500, 500], [15, 14, 34800, 12000, 10500, 9000, 2800, 500],
  [16, 15, 45000, 17000, 13500, 11000, 3000, 500], [17, 16, 58500, 19000, 18000, 16000, 4000, 1500], [18, 17, 75000, 24000, 23000, 20000, 6500, 1500],
  [19, 18, 96000, 30000, 28000, 28000, 8000, 2000], [20, 19, 123000, 40000, 35000, 35000, 11000, 2000], [null, 20, 159000, 55000, 40000, 44000, 18000, 2000],
];
// PF1e character wealth by level (PC wealth NPCs)
export const PC_WEALTH = [0, 0, 1000, 3000, 6000, 10500, 16000, 23500, 33000, 46000, 62000, 82000, 108000, 140000, 185000, 240000, 315000, 410000, 530000, 685000, 880000];

export function npcGear(level, heroic) {
  const row = NPC_GEAR.find((r) => (heroic ? r[1] === level : r[0] === level));
  if (!row) return null;
  const [, , total, weapons, protection, magic, limited, gear] = row;
  return { total, weapons, protection, magic, limited, gear };
}

// ---------------------------------------------------------------- NPC ability arrays (FFd20 Creating NPCs)
export const NPC_ARRAYS = {
  melee: { label: 'Corpo a corpo', basic: [13, 11, 12, 9, 10, 8], heroic: [15, 13, 14, 10, 12, 8] },
  ranged: { label: 'À distância', basic: [11, 13, 12, 10, 9, 8], heroic: [13, 15, 14, 12, 10, 8] },
  wis: { label: 'Conjurador (Wis)', basic: [10, 8, 12, 9, 13, 11], heroic: [12, 8, 14, 10, 15, 13] },
  int: { label: 'Conjurador (Int)', basic: [8, 12, 10, 13, 9, 11], heroic: [8, 14, 12, 15, 10, 13] },
  cha: { label: 'Conjurador (Cha)', basic: [8, 12, 10, 11, 9, 13], heroic: [8, 14, 12, 13, 10, 15] },
  skill: { label: 'Perícias', basic: [10, 12, 11, 13, 8, 9], heroic: [12, 14, 13, 15, 8, 10] },
};

// Treasure per encounter by CR (PF1e, medium XP track), used as "gil"
export const TREASURE_BY_CR = { 1: 260, 2: 550, 3: 800, 4: 1150, 5: 1550, 6: 2000, 7: 2600, 8: 3350, 9: 4250, 10: 5450, 11: 7000, 12: 9000, 13: 11600, 14: 15000, 15: 19500, 16: 25000, 17: 32000, 18: 41000, 19: 53000, 20: 67000 };

export const ALIGNMENTS = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
