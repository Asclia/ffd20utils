#!/usr/bin/env python3
"""
Build the random tables and creature lists used by the dungeon tools.

Usage:
    python3 tools/build_tables.py <cache_dir>

Sources (all openly licensed; attribution is kept in public/data/tables.json -> "sources"):
  - Maze Rats by Ben Milton — CC BY 4.0
      cache/tables/MazeRatsTables.md (github.com/skpy/MazeRatsObsidian)
  - Ironsworn and Ironsworn: Delve by Shawn Tomkin — only items whose own license is CC BY 4.0
      cache/tables/ds/*/package/json/{classic,delve}.json  (npm: @datasworn/ironsworn-classic[-delve])
  - Pathfinder Roleplaying Game traps (d20pfsrd.com) — Open Game License 1.0a
      cache/tables/pf_gamemastering_traps-hazards-and-special-terrains_traps_.html
  - Pathfinder Roleplaying Game monster list (aonprd.com) — Open Game License 1.0a
      cache/tables/aon_monsters.html
  - Final Fantasy d20 bestiary (finalfantasyd20.com) — fan content, linked to its pages
      cache/pages/gamemastering__bestiary__*.html
"""
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'data')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import tables, one_line, clean, slug  # noqa: E402

CC_BY = 'https://creativecommons.org/licenses/by/4.0'
SOURCES = [
    {'id': 'mazerats', 'name': 'Maze Rats', 'author': 'Ben Milton', 'license': 'CC BY 4.0', 'licenseUrl': CC_BY,
     'url': 'https://questingbeast.itch.io/maze-rats',
     'attribution': 'Maze Rats © Ben Milton, licensed under CC BY 4.0. Tables used unmodified, split into individual lists.'},
    {'id': 'ironsworn', 'name': 'Ironsworn / Ironsworn: Delve', 'author': 'Shawn Tomkin', 'license': 'CC BY 4.0', 'licenseUrl': CC_BY,
     'url': 'https://ironswornrpg.com',
     'attribution': 'Ironsworn and Ironsworn: Delve © Shawn Tomkin, oracle and theme/domain text licensed under CC BY 4.0 (via the Datasworn project). Only CC BY items are included.'},
    {'id': 'pf-traps', 'name': 'Pathfinder Roleplaying Game — Traps', 'author': 'Paizo Inc. (via d20pfsrd.com)', 'license': 'Open Game License 1.0a',
     'licenseUrl': 'https://www.d20pfsrd.com/extras/community-use-and-ogl/', 'url': 'https://www.d20pfsrd.com/gamemastering/traps-hazards-and-special-terrains/traps/',
     'attribution': 'Open Game Content from the Pathfinder Roleplaying Game © Paizo Inc., used under the Open Game License v1.0a.'},
    {'id': 'pf-monsters', 'name': 'Pathfinder Roleplaying Game — Monsters', 'author': 'Paizo Inc. (via Archives of Nethys)', 'license': 'Open Game License 1.0a',
     'licenseUrl': 'https://www.aonprd.com/OGL.aspx', 'url': 'https://www.aonprd.com/Monsters.aspx?Letter=All',
     'attribution': 'Monster names, CR, type and environment: Open Game Content from the Pathfinder Roleplaying Game © Paizo Inc., used under the Open Game License v1.0a.'},
    {'id': 'ffd20-bestiary', 'name': 'Final Fantasy d20 — Bestiary', 'author': 'FFd20 team', 'license': 'fan content',
     'licenseUrl': 'https://finalfantasyd20.com/', 'url': 'https://finalfantasyd20.com/gamemastering/bestiary/',
     'attribution': 'Creature names, CR and links from finalfantasyd20.com (fan-made). Final Fantasy is a trademark of Square Enix.'},
]

# Category of each Maze Rats table (for the UI)
MR_CATEGORY = [
    (r'^Dungeon', 'dungeon'), (r'Trap', 'dungeon'), (r'^Monster|Mutation', 'monster'),
    (r'Treasure|Valuable|Item|Potion|Weapon|Worn|Tool|Book|Ingredient', 'treasure'),
    (r'Name|Surname|NPC|Profession|Appearance|Physical Detail|Clothing|Personalit|Manner|Asset|Liabilit|Misfortune|Goal|Method|Secret|Reputation|Hobb|Relationship|Divine|Mission|Insanit|Faction', 'npc'),
    (r'City|District|Building|Inn|Street|Upper|Lower', 'city'),
    (r'Wilderness|Region|Landmark|Structure|Plant|Animal|Discover', 'wilderness'),
    (r'Spell|Ethereal|Physical (Effect|Element|Form)|Omen|Magic', 'magic'),
]


def mr_category(name):
    for rx, cat in MR_CATEGORY:
        if re.search(rx, name):
            return cat
    return 'misc'


def build_mazerats(path):
    text = open(path, encoding='utf8').read()
    out = []
    seen = set()
    # | Header |  /  | - |  / rows... / blank / ^Anchor
    for m in re.finditer(r'(?m)^\|\s*([^|\n]+?)\s*\|\s*\n(?:\|\s*-+\s*\|\s*\n)?((?:[ \t]*\|[^\n]*\|[ \t]*\n)+)\s*\^(\w+)', text):
        name, body, anchor = m.group(1).strip(), m.group(2), m.group(3)
        rows = [re.sub(r'^\s*\|\s*|\s*\|\s*$', '', r).strip() for r in body.strip().split('\n')]
        rows = [r for r in rows if r and r != '-']
        # nested rolls: `dice: [[MazeRatsTables#^CityActivities]]` -> {@mr-cityactivities}
        rows = [re.sub(r'`dice:\s*\[\[MazeRatsTables#\^(\w+)\]\]`', lambda mm: '{@mr-' + slug(mm.group(1)) + '}', r) for r in rows]
        key = anchor.lower()
        if key in seen or len(rows) < 4:
            continue
        seen.add(key)
        out.append({'id': f'mr-{slug(anchor)}', 'name': name, 'category': mr_category(name), 'source': 'mazerats', 'rows': rows})
    # two-column weighted tables: | dice: 1d6 | Name |  /  | 1-2 | text |
    for m in re.finditer(r'\|\s*dice:\s*(\d*d\d+)\s*\|\s*([^|\n]+?)\s*\|\s*\n\|[\s|-]+\|\s*\n((?:[ \t]*\|[^\n]*\|[ \t]*\n)+)\s*\^(\w+)', text):
        dice, name, body, anchor = m.group(1), m.group(2).strip(), m.group(3), m.group(4)
        key = anchor.lower()
        if key in seen:
            continue
        rows = []
        for r in body.strip().split('\n'):
            cells = [c.strip() for c in r.strip().strip('|').split('|')]
            if len(cells) < 2:
                continue
            rng = re.match(r'(\d+)(?:\s*-\s*(\d+))?$', cells[0])
            if not rng:
                continue
            txt = re.sub(r'`dice:\s*\[\[MazeRatsTables#\^(\w+)\]\]`', lambda mm: '{@mr-' + slug(mm.group(1)) + '}', cells[1])
            rows.append({'min': int(rng.group(1)), 'max': int(rng.group(2) or rng.group(1)), 'text': txt})
        if rows:
            seen.add(key)
            out.append({'id': f'mr-{slug(anchor)}', 'name': name, 'category': mr_category(name), 'source': 'mazerats', 'dice': dice, 'rows': rows})
    # resolve references whose anchor has a typo or a singular/plural variant in the source
    ids = {t['id'] for t in out}
    fixes = {'mr-missons': 'mr-missions', 'mr-phyiscalelements': 'mr-physicalelements', 'mr-citydistrictthemes': 'mr-districtthemes', 'mr-npcs': 'mr-civilizednpcs'}

    def fix(ref):
        if ref in ids:
            return ref
        for cand in (fixes.get(ref), ref + 's', ref.rstrip('s'), ref + 'items', ref + 's'.replace('ss', 's')):
            if cand and cand in ids:
                return cand
        return ref

    def fix_text(txt):
        return re.sub(r'\{@([\w-]+)\}', lambda mm: '{@' + fix(mm.group(1)) + '}', txt)
    for t in out:
        t['rows'] = [fix_text(r) if isinstance(r, str) else {**r, 'text': fix_text(r['text'])} for r in t['rows']]
    return out


def is_ccby(src):
    return (src or {}).get('license', '').rstrip('/') == CC_BY


def ds_rows(rows):
    out = []
    for r in rows or []:
        if r.get('text') and r.get('min') is not None:
            out.append({'min': r['min'], 'max': r['max'], 'text': r['text']})
    return out


def build_ironsworn(ds_dir):
    out = []
    files = glob.glob(os.path.join(ds_dir, '*', 'package', 'json', '*.json'))
    for f in files:
        d = json.load(open(f, encoding='utf8'))
        book = 'Delve' if 'delve' in os.path.basename(f) else 'Ironsworn'
        skip_collections = {'moves', 'turning_point'}  # rules-bound oracles, not useful for dungeon prep

        def walk(node, path):
            if not isinstance(node, dict):
                return
            if node.get('rows') and is_ccby(node.get('_source')):
                rows = ds_rows(node['rows'])
                if len(rows) >= 4:
                    name = node.get('canonical_name') or node.get('name')
                    out.append({'id': 'is-' + slug(node.get('_id', name)), 'name': f'{name} ({book})', 'category': ironsworn_category(path, name),
                                'source': 'ironsworn', 'dice': node.get('dice', '1d100'), 'rows': rows})
            for k in ('contents', 'collections'):
                for kk, v in (node.get(k) or {}).items():
                    if kk not in skip_collections:
                        walk(v, path + [kk])
        for k, v in (d.get('oracles') or {}).items():
            if k not in skip_collections:
                walk(v, [k])
        # Delve site themes & domains: features and dangers per kind of place
        for kind in ('site_themes', 'site_domains'):
            for k, v in (d.get(kind) or {}).items():
                if not is_ccby(v.get('_source')):
                    continue
                label = 'Theme' if kind == 'site_themes' else 'Domain'
                for part in ('features', 'dangers'):
                    rows = ds_rows(v.get(part))
                    if rows:
                        out.append({'id': f'is-{kind}-{k}-{part}', 'name': f"{v['name']} — {part.capitalize()} ({label}, Delve)",
                                    'category': 'site', 'site': {'kind': label.lower(), 'key': k, 'name': v['name'], 'part': part, 'summary': v.get('summary', '')},
                                    'source': 'ironsworn', 'dice': '1d100', 'rows': rows})
    return out


def ironsworn_category(path, name):
    p = ' '.join(path).lower() + ' ' + name.lower()
    if 'trap' in p or 'feature' in p or 'site' in p:
        return 'dungeon'
    if 'monstrosity' in p or 'threat' in p or 'combat' in p:
        return 'monster'
    if 'character' in p or 'name' in p or 'settlement' in p:
        return 'npc'
    if 'place' in p:
        return 'wilderness'
    return 'misc'


def build_traps(path):
    s = open(path, encoding='utf8', errors='replace').read()
    out = {}
    # categories: the first cells of the "by type" tables hold headings + links
    cats = {}
    for cell_html in re.findall(r'<td[^>]*>(.*?)</td>', s, flags=re.S):
        current = None
        for part in re.split(r'(<a [^>]*>.*?</a>)', cell_html, flags=re.S):
            if part.startswith('<a '):
                txt = one_line(part)
                m = re.match(r'(.*?)\s*\(CR ([^)]*)\)', txt)
                href = re.search(r'href="([^"]+)"', part)
                if m and href and current:
                    cats.setdefault(m.group(1).strip(), set()).add(current)
            else:
                head = one_line(part)
                if head.startswith('Traps') or head.startswith('Miscellaneous'):
                    current = re.sub(r'\s*(Acid|Pit|Bull|Bear|Barbed|Avalanche|Door|Flooding|Altar|Chamber|Dead).*$', '', head).strip()
    for m in re.finditer(r'<a [^>]*href="([^"]+)"[^>]*>([^<]*?)\s*\(CR ([^)<]*)\)\s*</a>', s):
        url, name, cr = m.group(1), html.unescape(m.group(2)).strip(), m.group(3).strip()
        if name and name not in out:
            out[name] = {'name': name, 'cr': cr, 'url': url, 'kinds': sorted(cats.get(name, []))}
    return sorted(out.values(), key=lambda x: x['name'])


def build_pf_monsters(path):
    s = open(path, encoding='utf8', errors='replace').read()
    out = []
    links = dict()
    for m in re.finditer(r'<a href="(MonsterDisplay\.aspx\?ItemName=[^"]+)"[^>]*>([^<]+)</a>', s):
        links.setdefault(html.unescape(m.group(2)).strip(), 'https://www.aonprd.com/' + html.unescape(m.group(1)))
    t = tables(s)
    for row in (t[0][1:] if t else []):
        if len(row) < 4 or not row[0]:
            continue
        out.append({'name': row[0], 'cr': row[1], 'type': row[2], 'env': row[3], 'system': 'pf1e', 'url': links.get(row[0], '')})
    return out


def build_ffd20_monsters(pages):
    out = []
    for f in sorted(glob.glob(os.path.join(pages, 'gamemastering__bestiary__*.html'))):
        parts = os.path.basename(f)[:-5].split('__')
        if len(parts) < 4 or parts[2] in ('universal-monster-rules', 'npcs'):
            continue
        s = open(f, encoding='utf8', errors='replace').read()
        text = clean(s)
        # each stat block heading looks like "Name (CR 3)" or "Name CR 3"
        found = False
        for m in re.finditer(r'(?m)^#*\s*([^\n]{2,60}?)\s*\(?CR\s+(\d+(?:/\d+)?)\)?\s*$', text):
            name = m.group(1).strip(' –-')
            if not name or name.lower().startswith(('table', 'xp')):
                continue
            after = text[m.end():m.end() + 600]
            tm = re.search(r'\b(Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal|Diminutive|Fine)\s+([a-z ]+?)(?:\s*\(|\n)', after)
            em = re.search(r'Environment\s+([^\n]+)', text[m.end():m.end() + 8000])
            typ = tm.group(2).strip() if tm else parts[2].replace('-', ' ')
            typ = re.sub(r'(beast|humanoid|construct|dragon|outsider|plant|aberration|animal|ooze|elemental|fey|vermin)s\b', r'\1', typ)
            names = [(name, m.group(2))]
            vm = re.match(r'(.+?)\s*\(CR\s+(\d+(?:/\d+)?)\)\s+or\s+(.+)$', name)
            if vm:
                names = [(vm.group(1).strip(), vm.group(2)), (vm.group(3).strip(), m.group(2))]
            for nm, crv in names:
                out.append({'name': nm, 'cr': crv, 'type': typ,
                            'env': em.group(1).strip()[:80] if em else '', 'family': parts[3].replace('-', ' ') if len(parts) > 4 else '',
                            'system': 'ffd20', 'url': 'https://finalfantasyd20.com/' + '/'.join(parts) + '/'})
            found = True
        if not found:
            continue
    seen = set()
    uniq = []
    for x in out:
        k = (x['name'].lower(), x['cr'])
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    return uniq


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = sys.argv[1]
    tdir = os.path.join(cache, 'tables')
    tabs = []
    if os.path.exists(os.path.join(tdir, 'MazeRatsTables.md')):
        tabs += build_mazerats(os.path.join(tdir, 'MazeRatsTables.md'))
    tabs += build_ironsworn(os.path.join(tdir, 'ds'))
    traps_file = os.path.join(tdir, 'pf_gamemastering_traps-hazards-and-special-terrains_traps_.html')
    traps = build_traps(traps_file) if os.path.exists(traps_file) else []
    monsters = []
    aon = os.path.join(tdir, 'aon_monsters.html')
    if os.path.exists(aon):
        monsters += build_pf_monsters(aon)
    monsters += build_ffd20_monsters(os.path.join(cache, 'pages'))
    data = {'sources': SOURCES, 'tables': tabs, 'traps': traps}
    with open(os.path.join(OUT, 'tables.json'), 'w', encoding='utf8') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'monsters.json'), 'w', encoding='utf8') as fh:
        json.dump(monsters, fh, ensure_ascii=False, separators=(',', ':'))
    from collections import Counter
    print('tables', len(tabs), dict(Counter(t['source'] for t in tabs)), dict(Counter(t['category'] for t in tabs)))
    print('traps', len(traps), 'monsters', len(monsters), dict(Counter(m['system'] for m in monsters)))


if __name__ == '__main__':
    main()
