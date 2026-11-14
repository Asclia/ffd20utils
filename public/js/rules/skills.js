// PF1e skills + FFd20 new skills (finalfantasyd20.com/skills/).
// [name, ability, trainedOnly, armorCheckPenalty]
const RAW = [
  ['Acrobatics', 'dex', false, true], ['Appraise', 'int', false, false], ['Bluff', 'cha', false, false],
  ['Climb', 'str', false, true], ['Computers', 'int', true, false],
  ['Craft', 'int', false, false], ['Craft (Electronic)', 'int', true, false], ['Craft (Explosive)', 'int', true, false],
  ['Craft (Mechanical)', 'int', true, false], ['Craft (Structural)', 'int', true, false],
  ['Diplomacy', 'cha', false, false], ['Disable Device', 'dex', true, true], ['Disguise', 'cha', false, false],
  ['Drive', 'dex', true, false], ['Escape Artist', 'dex', false, true], ['Fly', 'dex', false, true],
  ['Handle Animal', 'cha', true, false], ['Heal', 'wis', false, false], ['Intimidate', 'cha', false, false],
  ['Knowledge (arcana)', 'int', true, false], ['Knowledge (dungeoneering)', 'int', true, false],
  ['Knowledge (engineering)', 'int', true, false], ['Knowledge (geography)', 'int', true, false],
  ['Knowledge (history)', 'int', true, false], ['Knowledge (local)', 'int', true, false],
  ['Knowledge (nature)', 'int', true, false], ['Knowledge (nobility)', 'int', true, false],
  ['Knowledge (planes)', 'int', true, false], ['Knowledge (religion)', 'int', true, false],
  ['Knowledge (technology)', 'int', true, false],
  ['Linguistics', 'int', true, false], ['Navigate', 'int', true, false], ['Perception', 'wis', false, false],
  ['Perform', 'cha', false, false], ['Pilot', 'dex', true, false], ['Profession', 'wis', true, false],
  ['Repair', 'int', true, false], ['Ride', 'dex', false, true], ['Sense Motive', 'wis', false, false],
  ['Sleight of Hand', 'dex', true, true], ['Spellcraft', 'int', true, false], ['Stealth', 'dex', false, true],
  ['Survival', 'wis', false, false], ['Swim', 'str', false, true], ['Use Magic Device', 'cha', true, false],
];
export const SKILLS = RAW.map(([name, ability, trained, acp]) => ({ name, ability, trained, acp }));
export const SKILL_BY_NAME = Object.fromEntries(SKILLS.map((s) => [s.name.toLowerCase(), s]));

// Does a class/type "class skills" list include this skill?
export function isClassSkill(skillName, list) {
  const n = skillName.toLowerCase();
  for (const raw of list || []) {
    const c = raw.toLowerCase().trim();
    if (c === n) return true;
    if (c.startsWith('knowledge (all') && n.startsWith('knowledge')) return true;
    if (c === 'knowledge' && n.startsWith('knowledge')) return true;
    if ((c === 'craft' || c.startsWith('craft (any')) && n.startsWith('craft')) return true;
    if ((c === 'profession' || c.startsWith('profession (any')) && n.startsWith('profession')) return true;
    if ((c === 'perform' || c.startsWith('perform (any')) && n.startsWith('perform')) return true;
    if (c.includes('(') && n.includes('(') && c.split('(')[0].trim() === n.split('(')[0].trim() && c.includes(n.split('(')[1].replace(')', '').trim())) return true;
  }
  return false;
}

// Simplified NPC skill selections (FFd20 Creating NPCs)
export const NPC_SKILL_SELECTIONS = { thief: 8, archer: 6, bard: 6, 'red-mage': 6, beastmaster: 4, 'black-mage': 4, dragoon: 4, knight: 4, monk: 4, 'white-mage': 4, warrior: 4 };
