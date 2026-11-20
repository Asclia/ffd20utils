#!/usr/bin/env python3
"""
Build Pathfinder 1e data (classes, races, spell lists) from d20pfsrd.com pages
(Open Game License 1.0a; Paizo's Pathfinder Roleplaying Game).

Usage:
    python3 tools/build_pf.py <cache_dir>

<cache_dir>/pf/pages/ holds the pages (URL path with "/" -> "__"), e.g.
classes__core-classes__wizard.html, races__core-races__elf.html,
magic__spell-lists-and-domains__spell-lists-cleric.html
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import tables, clean, sections, slug, parse_class_skills, norm_feature, ordinal, num, ABIL  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'data')
BASE = 'https://www.d20pfsrd.com/'

CAT = {'core-classes': 'core', 'base-classes': 'base', 'hybrid-classes': 'hybrid', 'npc-classes': 'npc',
       'unchained-classes': 'unchained', 'alternate-classes': 'alternate', 'occult-classes': 'occult'}

SPELL_LISTS = {
    'spell-lists-sorcerer-and-wizard': ['sorcerer', 'wizard', 'arcanist'],
    'spell-lists-cleric': ['cleric', 'oracle', 'warpriest'],
    'spell-lists-druid': ['druid', 'hunter', 'shifter'],
    'spell-lists-bard': ['bard', 'skald'],
    'spell-lists-inquisitor': ['inquisitor'],
    'spell-lists-paladin': ['paladin'],
    'spell-lists-ranger': ['ranger', 'hunter'],
    'spell-lists-summoner': ['summoner'],
    'spell-lists-unchained-summoner': ['summoner-unchained'],
    'spell-list-witch': ['witch'],
    'shaman': ['shaman'],
    'formulae-lists-alchemist': ['alchemist', 'investigator'],
    'magus-spell-list': ['magus'],
    'antipaladin-spell-list': ['antipaladin'],
    'bloodrager': ['bloodrager'],
    'mesmerist': ['mesmerist'], 'occultist': ['occultist'], 'psychic': ['psychic'],
    'spiritualist': ['spiritualist'], 'medium': ['medium'],
}

HIDDEN = re.compile(r'^(subscribe|discuss|latest pathfinder|class skills|favored class|archetypes?|alternative capstone|table:|ex-|code of conduct)', re.I)


def title_of(fname):
    last = fname[:-5].split('__')[-1]
    t = last.replace('arg-', '').replace('-', ' ').title()
    return t.replace('Unchained', '(Unchained)').replace('Half Elf', 'Half-Elf').replace('Half Orc', 'Half-Orc')


def parse_pf_class(fname, s):
    parts = fname[:-5].split('__')
    cat = CAT.get(parts[-2], 'base')
    name = title_of(fname)
    text = clean(s)
    hd = re.search(r'Hit Die:?\s*d(\d+)', text)
    sk = re.search(r'Skill Ranks per Level:?\s*(\d+)', text)
    all_tabs = tables(s)
    level_tab = next((t for t in all_tabs if t and t[0] and t[0][0] == 'Level' and any(('Base Attack' in c or c == 'BAB') for c in t[0])), None)
    if not level_tab:
        return None
    hdr = level_tab[0]
    rows = level_tab[1:]
    spell_labels = []
    ordl = re.compile(r'^(0|0th|\d+(st|nd|rd|th))$')
    if rows and rows[0] and all(ordl.match(c.strip()) for c in rows[0]):
        spell_labels = rows[0]
        rows = rows[1:]
    idx = {}
    for i, h in enumerate(hdr):
        hl = h.lower()
        if hl.startswith('level') and 'level' not in idx:
            idx['level'] = i
        elif 'base attack' in hl or hl == 'bab':
            idx['bab'] = i
        elif hl.startswith('fort'):
            idx['fort'] = i
        elif hl.startswith('ref'):
            idx['ref'] = i
        elif hl.startswith('will'):
            idx['will'] = i
        elif hl.startswith('special'):
            idx['special'] = i
        elif hl.startswith('spells') or 'extracts per day' in hl:
            idx['spells'] = i
    levels = []
    for row in rows:
        if not row:
            continue
        lv = ordinal(row[0])
        if not lv:
            continue

        def g(k):
            i = idx.get(k)
            return row[i] if i is not None and i < len(row) else ''
        special = [x.strip() for x in re.split(r',(?![^()]*\))', g('special')) if x.strip() and x.strip() not in ('—', '-', '–')]
        e = {'level': lv, 'bab': num(g('bab').split('/')[0]) or 0, 'fort': num(g('fort')) or 0, 'ref': num(g('ref')) or 0,
             'will': num(g('will')) or 0, 'special': special}
        if 'spells' in idx and spell_labels:
            vals = row[idx['spells']: idx['spells'] + len(spell_labels)]
            spd = {}
            for lab, v in zip(spell_labels, vals):
                n = num(v)
                if n is not None and v.strip() not in ('—', '-'):
                    spd[0 if lab in ('0', '0th') else ordinal(lab)] = n
            e['spellsPerDay'] = spd
            e['spellLevel'] = max([k for k, v in spd.items() if v is not None] or [0])
        levels.append(e)
    cast = None
    m = re.search(r'must have an? (Intelligence|Wisdom|Charisma) score (?:equal to )?(?:of )?at least 10', text)
    if m:
        cast = ABIL[m.group(1).lower()]
    spontaneous = any(t is not level_tab and t and t[0] and t[0][0] == 'Level' and (any('Spells Known' in c for c in t[0]) or (len(t[0]) > 1 and t[0][1] in ('0th', '1st'))) for t in all_tabs)
    features = []
    started = False
    for lvl, head, body in sections(s):
        hl = head.lower()
        if hl.startswith('class features'):
            started = True
            continue
        if not started:
            continue
        if re.match(r'^(favored class|archetypes|alternative capstone|discuss|latest)', hl):
            break
        if HIDDEN.match(head):
            continue
        mm = re.match(r'(.*?)\s*\((Ex|Su|Sp|Ex or Sp|Ex or Su|Su or Sp)\)\s*$', head)
        fname_, ftype = (mm.group(1), mm.group(2).split(' ')[0]) if mm else (head, '')
        features.append({'name': fname_.strip(), 'type': ftype, 'text': clean(body)[:3000]})
    first = {}
    for e in levels:
        for sp in e['special']:
            first.setdefault(norm_feature(sp), e['level'])
    for f in features:
        n = norm_feature(f['name'])
        lv = first.get(n) or next((v for k, v in first.items() if k and (k.startswith(n) or n.startswith(k))), None)
        if lv is None:
            mm = re.search(r'\b(?:At|Beginning at|Starting at)\s+(\d+)(?:st|nd|rd|th) level', f['text'])
            lv = int(mm.group(1)) if mm else 1
        f['level'] = lv
    n20 = levels[-1]['bab'] if levels else 0
    nlev = len(levels) or 20
    babp = 'Full' if n20 >= nlev else ('3/4' if n20 * 4 >= nlev * 3 - 1 else '1/2')
    cid = slug(parts[-1])
    return {
        'id': cid, 'name': name, 'category': cat, 'system': 'pf1e',
        'kind': 'basic' if cat == 'npc' else 'heroic',
        'hd': int(hd.group(1)) if hd else 8, 'skillPoints': int(sk.group(1)) if sk else 2,
        'classSkills': parse_class_skills(text), 'babProgression': babp,
        'castingAbility': cast, 'caster': any('spellsPerDay' in e for e in levels), 'spontaneous': spontaneous,
        'maxLevel': len(levels), 'levels': levels, 'features': features, 'limitBreaks': [],
        'source': BASE + fname[:-5].replace('__', '/') + '/',
    }


def parse_pf_race(fname, s):
    text = clean(s)
    name = title_of(fname)
    mods = {}
    flex = False
    m = re.search(r'Ability Score (?:Modifiers|Racial Traits)\s*:\s*(.*?)\n', text)
    line = m.group(1) if m else ''
    for mm in re.finditer(r'([+\-−–]\s?\d)\s*(?:racial bonus to |bonus to |to )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)', line):
        mods[ABIL[mm.group(2).lower()]] = int(mm.group(1).replace('−', '-').replace('–', '-').replace(' ', ''))
    if not mods and ('of their choice' in line or 'any one ability' in line):
        flex = True
    size = re.search(r'are (Fine|Diminutive|Tiny|Small|Medium|Large) creatures', text)
    typ = re.search(r'are (\w+?)s? (?:creatures )?with the ([\w ]+?) subtypes?', text)
    speed = re.search(r'base speed of (\d+) feet', text)
    lang = re.search(r'Languages:\s*[^.]*?begin play speaking ([^.]+)\.', text)
    traits = []
    for lvl, head, body in sections(s):
        if head.lower().startswith('standard racial traits'):
            for tm in re.finditer(r'(?m)^(?:• )?([A-Z][^:\n]{1,50}):\s*(.+)$', clean(body)):
                if not tm.group(1).startswith(('Ability Score', 'Size', 'Type', 'Base Speed', 'Languages')):
                    traits.append({'name': tm.group(1).strip(), 'text': tm.group(2).strip()})
    t = (typ.group(1).lower().rstrip('s') if typ else 'humanoid')
    return {'id': 'pf-' + slug(name), 'name': name, 'category': fname.split('__')[-2], 'system': 'pf1e',
            'abilityMods': mods, 'flexibleBonus': flex or (not mods and name in ('Human', 'Half-Elf', 'Half-Orc')),
            'size': size.group(1) if size else 'Medium', 'type': t.replace('humanoid', 'humanoid'),
            'subtypes': [x.strip().lower() for x in re.split(r' and |,', typ.group(2))] if typ else [],
            'speed': int(speed.group(1)) if speed else 30,
            'languages': re.sub(r',\s*,', ',', lang.group(1).replace(' and ', ', ')) if lang else 'Common',
            'traits': traits, 'source': BASE + fname[:-5].replace('__', '/') + '/'}


def parse_pf_spell_list(fname, s):
    key = fname[:-5].split('__')[-1]
    classes = SPELL_LISTS.get(key)
    if not classes:
        return []
    head = next((h for l, h, b in sections(s) if h.startswith('Spell Level')), '')
    levels = [int(x) for x in re.findall(r'\d', head)]
    first_tab = s.find('Spell Name')
    third = s.find('Third Party', first_tab) if first_tab > 0 else -1
    out = []
    pos = 0
    for i, t in enumerate(tables(s[:third] if third > 0 else s)):
        if not t or not t[0] or t[0][0] != 'Spell Name':
            continue
        if pos >= len(levels):
            break
        lv = levels[pos]
        pos += 1
        for row in t[1:]:
            if len(row) < 3 or not row[0]:
                continue
            if len(row) == 1 or row[0] in ('Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation', 'Universal'):
                continue
            src = row[-1]
            if not re.match(r'^(PZO|PAP|PRG|PCS|PPC|PAC|PMWI|AP|PFS|Pathfinder|Core|APG|UM|UC|ARG|ACG|OA|UI|UW|HA|MA)', src):
                continue
            for c in classes:
                out.append({'name': row[0].strip(), 'level': lv, 'class': c, 'summary': row[-2].strip()[:200], 'system': 'pf1e'})
    return out


def main():
    cache = sys.argv[1]
    pages = os.path.join(cache, 'pf', 'pages')
    classes, races, spells = [], [], []
    for f in sorted(os.listdir(pages)):
        s = open(os.path.join(pages, f), encoding='utf8', errors='replace').read()
        if f.startswith(('classes__', 'alternative-rule-systems__')):
            c = parse_pf_class(f, s)
            if c and c['levels']:
                classes.append(c)
            else:
                print('no class table', f)
        elif f.startswith('races__'):
            races.append(parse_pf_race(f, s))
        elif f.startswith('magic__spell-lists'):
            spells += parse_pf_spell_list(f, s)
    seen = set()
    spells = [x for x in spells if not ((x['name'], x['class']) in seen or seen.add((x['name'], x['class'])))]
    for name, obj in (('pf-classes.json', classes), ('pf-races.json', races), ('pf-spells.json', spells)):
        with open(os.path.join(OUT, name), 'w', encoding='utf8') as fh:
            json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))
        print('wrote', name, len(obj), os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')


if __name__ == '__main__':
    main()
