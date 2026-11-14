#!/usr/bin/env python3
"""
Build the rules database (public/data/*.json) used by FFd20 Utils.

Usage:
    python3 tools/build_data.py <cache_dir>

<cache_dir> must contain:
  pages/            HTML pages from finalfantasyd20.com, one file per page, named after the
                    URL path with "/" replaced by "__" (e.g. classes__core-classes__knight.html)
  pf_feats_*.html   d20pfsrd.com feat index pages (e.g. pf_feats_combat-feats_.html)

Only the Python standard library is used. The source pages are fan content from
finalfantasyd20.com (FFd20) and d20pfsrd.com (Pathfinder OGL); the generated files keep a
"source" reference for every entry.
"""
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'data')

ABIL = {'strength': 'str', 'dexterity': 'dex', 'constitution': 'con',
        'intelligence': 'int', 'wisdom': 'wis', 'charisma': 'cha'}


# --------------------------------------------------------------------------- helpers
def clean(s):
    s = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</p>|</li>|</tr>|</h\d>|</div>', '\n', s)
    s = re.sub(r'<li[^>]*>', '• ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s).replace('\xa0', ' ')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n\s*', '\n', s)
    return s.strip()


def one_line(s):
    return re.sub(r'\s+', ' ', clean(s)).strip()


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


class TableParser(HTMLParser):
    """Collects every <table> as a list of rows (list of cell strings)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.cur, self.row, self.cell = [], None, None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.cur = []
        elif tag == 'tr' and self.cur is not None:
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []
        elif tag == 'br' and self.cell is not None:
            self.cell.append(' ')

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(re.sub(r'\s+', ' ', ''.join(self.cell)).strip())
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            if self.cur is not None:
                self.cur.append(self.row)
            self.row = None
        elif tag == 'table' and self.cur is not None:
            self.tables.append(self.cur)
            self.cur = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def tables(s):
    p = TableParser()
    p.feed(s)
    return p.tables


def sections(s):
    """Split page HTML into (level, heading, html_body) by h2/h3/h4 headings."""
    parts = re.split(r'(<h[2-5][^>]*>.*?</h[2-5]>)', s, flags=re.S)
    out = []
    cur = None
    for p in parts:
        m = re.match(r'<h([2-5])[^>]*>(.*?)</h[2-5]>', p, flags=re.S)
        if m:
            cur = [int(m.group(1)), one_line(m.group(2)), '']
            out.append(cur)
        elif cur is not None:
            cur[2] += p
    return out


def page_content(s):
    i = s.find('class="page-content"')
    return s[i:] if i >= 0 else s


def num(s):
    m = re.search(r'[+-]?\d+', s or '')
    return int(m.group(0)) if m else None


def ordinal(s):
    m = re.search(r'(\d+)', s or '')
    return int(m.group(1)) if m else 0


# --------------------------------------------------------------------------- classes
CATS = {'core-classes': 'core', 'base-classes': 'base', 'hybrid-classes': 'hybrid',
        'miscellaneous-classes': 'misc', 'npc-classes': 'npc', 'prestige-classes': 'prestige'}

# casting stat for casters whose page text doesn't match the usual sentence
CAST_FALLBACK = {'cleric': 'wis', 'dragonmaster': 'cha'}


def parse_class_skills(text):
    m = re.search(r'class skills[^.]*?\bare\b(.*?)(?:\.\s*\n|\.$|\n)', text, flags=re.S | re.I)
    if not m:
        return []
    body = m.group(1)
    body = re.sub(r'\band\b', ',', body)
    skills = []
    for part in body.split(','):
        part = part.strip(' .\n')
        if not part:
            continue
        part = re.sub(r'\s*\((Str|Dex|Con|Int|Wis|Cha)\)\s*$', '', part).strip()
        if part and len(part) < 60:
            skills.append(part)
    return skills


def norm_feature(name):
    n = re.sub(r'\s*\(.*?\)', '', name)
    n = re.sub(r'\s+[+-]?\d+(d\d+)?$', '', n)
    n = re.sub(r'\s+\d+$', '', n)
    n = re.sub(r'\s+(I|II|III|IV|V|VI)$', '', n)
    return n.strip().lower()


def parse_class(path, s, cat):
    title = one_line(re.search(r'<h1 class="page-title">(.*?)</h1>', s, re.S).group(1))
    body = page_content(s)
    text = clean(body)
    hd = re.search(r'Hit Di(?:e|ce)\s*:?\s*\**\s*d(\d+)', text)
    sk = re.search(r'Skill (?:Points|Ranks) (?:per|Per|at each) Level:?\s*(\d+)', text)
    if not sk:
        sk = re.search(r'Skill (?:Points|Ranks)[^:]*:\s*(\d+)', text)
    tabs = tables(body)
    level_tab = None
    for t in tabs:
        if t and any('Base Attack' in c for c in t[0]):
            level_tab = t
            break
    levels, extra_cols = [], []
    prog = {}
    if level_tab:
        hdr = level_tab[0]
        idx = {}
        for i, h in enumerate(hdr):
            hl = h.lower()
            if hl.startswith('level') and 'level' not in idx:
                idx['level'] = i
            elif 'base attack' in hl:
                idx['bab'] = i
            elif hl.startswith('fort'):
                idx['fort'] = i
            elif hl.startswith('ref'):
                idx['ref'] = i
            elif hl.startswith('will'):
                idx['will'] = i
            elif hl.startswith('special'):
                idx['special'] = i
            elif hl == 'mp':
                idx['mp'] = i
            elif 'level' in hl and ('spell' in hl or 'song' in hl or 'ninjutsu' in hl):
                idx['spellLevel'] = i
            else:
                extra_cols.append((i, h))
        for row in level_tab[1:]:
            if not row:
                continue
            first = row[0].strip()
            if first.lower() == 'type':
                for k in ('bab', 'fort', 'ref', 'will'):
                    if k in idx and idx[k] < len(row):
                        prog[k] = row[idx[k]]
                continue
            lv = ordinal(first)
            if not lv:
                continue

            def g(k):
                i = idx.get(k)
                return row[i] if i is not None and i < len(row) else ''
            special = [x.strip() for x in re.split(r',(?![^()]*\))', g('special'))
                       if x.strip() and x.strip() not in ('—', '-', '–')]
            entry = {'level': lv, 'bab': num(g('bab').split('/')[0]) or 0,
                     'fort': num(g('fort')) or 0, 'ref': num(g('ref')) or 0,
                     'will': num(g('will')) or 0, 'special': special}
            if 'mp' in idx:
                entry['mp'] = num(g('mp')) or 0
            if 'spellLevel' in idx:
                entry['spellLevel'] = ordinal(g('spellLevel'))
            ex = {}
            for i, h in extra_cols:
                if i < len(row) and row[i] and row[i] not in ('—', '-'):
                    ex[h] = row[i]
            if ex:
                entry['extra'] = ex
            levels.append(entry)
    # casting ability
    cast = None
    m = re.search(r'must have an? (Intelligence|Wisdom|Charisma) score (?:equal to )?(?:of )?at least 10', text)
    if m:
        cast = ABIL[m.group(1).lower()]
    cast = cast or CAST_FALLBACK.get(slug(title))
    # sections / features
    secs = sections(body)
    features, limit_breaks = [], []
    started = False
    requirements = ''
    for lvl, head, bod in secs:
        hl = head.lower()
        if hl.startswith('requirements'):
            requirements = clean(bod)
        if hl.startswith('class features') or (hl.startswith('table:') and not started):
            started = True
            continue
        if not started:
            continue
        if hl.startswith('favored class') or hl.startswith('archetype') or hl.startswith('table:'):
            if hl.startswith('table:'):
                continue
            break
        m = re.match(r'(.*?)\s*\((Ex|Su|Sp|Ex/Su|Su/Sp)\)\s*$', head)
        fname, ftype = (m.group(1), m.group(2)) if m else (head, '')
        desc = clean(bod)
        if fname.lower().startswith('limit break'):
            for lm in re.finditer(r'(?m)^([A-Z][^:\n]{1,60}?)\s*\((Su|Ex|Sp)\):\s*(.+)$', desc):
                limit_breaks.append({'name': lm.group(1).strip(), 'type': lm.group(2),
                                     'text': lm.group(3).strip()})
            continue
        features.append({'name': fname.strip(), 'type': ftype, 'text': desc})
    # level each feature is first gained, from the table
    first_level = {}
    for e in levels:
        for sp in e['special']:
            first_level.setdefault(norm_feature(sp), e['level'])
    for f in features:
        n = norm_feature(f['name'])
        lv = first_level.get(n)
        if lv is None:
            for k, v in first_level.items():
                if k and (k.startswith(n) or n.startswith(k)):
                    lv = v
                    break
        if lv is None:
            mm = re.search(r'\b(?:At|Beginning at|Starting at|at)\s+(\d+)(?:st|nd|rd|th) level', f['text'])
            lv = int(mm.group(1)) if mm else 1
        f['level'] = lv
    # BAB progression label
    babp = (prog.get('bab') or '').strip()
    if not babp and levels:
        b20 = levels[-1]['bab']
        babp = 'Full' if b20 >= len(levels) else ('3/4' if b20 * 4 >= len(levels) * 3 - 1 else '1/2')
    return {
        'id': slug(title), 'name': title, 'category': cat,
        'kind': 'basic' if cat == 'npc' else 'heroic',
        'hd': int(hd.group(1)) if hd else 8,
        'skillPoints': int(sk.group(1)) if sk else 2,
        'classSkills': parse_class_skills(text),
        'babProgression': babp,
        'saves': {k: prog.get(k, '') for k in ('fort', 'ref', 'will')},
        'castingAbility': cast,
        'caster': any('mp' in e for e in levels),
        'maxLevel': len(levels),
        'levels': levels,
        'features': features,
        'limitBreaks': limit_breaks,
        'requirements': requirements,
        'source': 'https://finalfantasyd20.com/' + path.replace('__', '/') + '/',
    }


# --------------------------------------------------------------------------- feats
def parse_ffd20_feat_index(path, s, category):
    out = []
    for t in tables(page_content(s)):
        if not t or not t[0] or 'Feat' not in t[0][0]:
            continue
        for row in t[1:]:
            if len(row) < 3:
                continue
            name = re.sub(r'^[└\-\s]+', '', row[0]).strip()
            if not name:
                continue
            out.append({'name': name, 'source': 'FFd20', 'category': category,
                        'prerequisites': row[1].strip(' -'), 'benefit': row[2].strip()})
    return out


def parse_pf_feat_index(s, category):
    out = []
    for t in tables(s):
        if not t or len(t[0]) < 3 or 'Feat' not in t[0][0]:
            continue
        hdr = [h.lower() for h in t[0]]
        ip = next((i for i, h in enumerate(hdr) if 'prereq' in h), 1)
        ib = next((i for i, h in enumerate(hdr) if 'benefit' in h or 'description' in h), 2)
        ic = next((i for i, h in enumerate(hdr) if 'type' in h or 'category' in h), None)
        isrc = next((i for i, h in enumerate(hdr) if 'source' in h), None)
        for row in t[1:]:
            if len(row) <= max(ip, ib):
                continue
            name = row[0].strip()
            if not name or name.lower().startswith('feat'):
                continue
            out.append({'name': name, 'source': 'Pathfinder', 'category': category,
                        'tags': row[ic] if ic is not None and ic < len(row) else '',
                        'book': row[isrc] if isrc is not None and isrc < len(row) else '',
                        'prerequisites': row[ip].strip(' -—'), 'benefit': row[ib].strip()})
    return out


def parse_ffd20_feat_page(s):
    """Full text of a single FFd20 feat page (used to enrich the index entry)."""
    body = page_content(s)
    return clean(body)


# --------------------------------------------------------------------------- spells
def parse_spells(path, s):
    cls = path.split('__')[-1]
    out = []
    body = page_content(s)
    # pair each table with its title
    for m in re.finditer(r'<h2[^>]*>(.*?)</h2>\s*(<table.*?</table>)', body, flags=re.S):
        title = one_line(m.group(1))
        lv = 0 if re.search(r'\b0-Level|Cantrip|Jutsu', title, re.I) else ordinal(title)
        for row in tables(m.group(2))[0][1:]:
            if len(row) >= 2 and row[0]:
                out.append({'name': row[0].strip(), 'level': lv, 'class': cls, 'summary': row[1].strip()})
    return out


# --------------------------------------------------------------------------- races
def parse_race(path, s, cat):
    title = one_line(re.search(r'<h1 class="page-title">(.*?)</h1>', s, re.S).group(1))
    body = page_content(s)
    text = clean(body)
    mods = {}
    flex = False
    trait_tab = {}
    for t in tables(body):
        if t and t[0] and t[0][0].lower().startswith('racial traits'):
            for row in t[1:]:
                if len(row) >= 2:
                    trait_tab.setdefault(row[0].strip().lower(), row[1].strip())
            break
    abil_re = r'([+\-−–]\s?\d)\s*(?:racial bonus to |bonus to |to )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Str|Dex|Con|Int|Wis|Cha)\b'
    srcs = [trait_tab.get('ability score modifiers', '')]
    m = re.search(r'Ability Score (?:Racial Traits|Modifiers)\s*:\s*(.*?)\n', text)
    if m:
        srcs.append(m.group(1))
    for line in srcs:
        for mm in re.finditer(abil_re, line):
            v = int(mm.group(1).replace('−', '-').replace('–', '-').replace(' ', ''))
            mods[ABIL.get(mm.group(2).lower(), mm.group(2).lower()[:3])] = v
        if mods:
            break
    if not mods and any('of their choice' in x or 'choose' in x for x in srcs):
        flex = True
    size = re.match(r'(Fine|Diminutive|Tiny|Small|Medium|Large|Huge)', trait_tab.get('size', ''))
    if not size:
        size = re.search(r'are (Fine|Diminutive|Tiny|Small|Medium|Large|Huge) creatures', text)
    typ = re.match(r'([A-Za-z ]+?)\s*\(([^)]*)\)', trait_tab.get('type', ''))
    speed = re.search(r'base speed of (\d+) feet', text)
    traits = []
    secs = sections(body)
    for lvl, head, bod in secs:
        if head.lower().startswith('standard racial traits') or head.lower().endswith('racial traits') and 'alternate' not in head.lower():
            for tm in re.finditer(r'(?m)^(?:• )?([A-Z][^:\n]{1,50}):\s*(.+)$', clean(bod)):
                if tm.group(1).startswith('Ability Score'):
                    continue
                traits.append({'name': tm.group(1).strip(), 'text': tm.group(2).strip()})
        if head.lower().startswith('alternate'):
            break
    return {'id': slug(title), 'name': title, 'category': cat,
            'abilityMods': mods, 'flexibleBonus': flex,
            'size': size.group(1) if size else 'Medium',
            'type': (typ.group(1).strip().lower() if typ else 'humanoid'),
            'subtypes': ([x.strip().lower() for x in typ.group(2).split(',')] if typ else []),
            'speed': int(speed.group(1)) if speed else 30,
            'traits': traits,
            'source': 'https://finalfantasyd20.com/' + path.replace('__', '/') + '/'}


# --------------------------------------------------------------------------- main
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = sys.argv[1]
    pages = os.path.join(cache, 'pages')
    os.makedirs(OUT, exist_ok=True)
    files = sorted(os.listdir(pages))

    def read(f):
        with open(os.path.join(pages, f), encoding='utf8') as fh:
            return fh.read()

    # classes
    classes = []
    for f in files:
        parts = f[:-5].split('__')
        if len(parts) == 3 and parts[0] == 'classes' and parts[1] in CATS:
            try:
                c = parse_class(f[:-5], read(f), CATS[parts[1]])
            except Exception as e:  # keep going, report
                print('class parse failed', f, e)
                continue
            if c['levels']:
                classes.append(c)
            else:
                print('no level table:', f)
    print('classes', len(classes))

    # feats: FFd20 index pages (+ detail pages for full text)
    feats = {}
    detail = {}
    for f in files:
        parts = f[:-5].split('__')
        if parts[0] == 'feats' and len(parts) == 3:
            name = one_line(re.search(r'<h1 class="page-title">(.*?)</h1>', read(f), re.S).group(1))
            detail[name.lower()] = (parse_ffd20_feat_page(read(f)), 'https://finalfantasyd20.com/' + f[:-5].replace('__', '/') + '/')
    for f in files:
        parts = f[:-5].split('__')
        if parts[0] == 'feats' and len(parts) == 2:
            cat = parts[1].replace('-feats', '')
            for ft in parse_ffd20_feat_index(f, read(f), cat):
                d = detail.get(ft['name'].lower())
                if d:
                    ft['text'], ft['url'] = d
                feats.setdefault(('ffd20', ft['name'].lower()), ft)
    nff = len(feats)
    for f in sorted(os.listdir(cache)):
        m = re.match(r'pf_feats_([a-z-]+)-feats_\.html$', f)
        if not m:
            continue
        with open(os.path.join(cache, f), encoding='utf8') as fh:
            for ft in parse_pf_feat_index(fh.read(), m.group(1)):
                feats.setdefault(('pf', ft['name'].lower()), ft)
    feat_list = sorted(feats.values(), key=lambda x: (x['name'].lower(), x['source']))
    for ft in feat_list:
        ft['id'] = ('ff-' if ft['source'] == 'FFd20' else 'pf-') + slug(ft['name'])
    print('feats', nff, 'ffd20 +', len(feat_list) - nff, 'pathfinder')

    # spells
    spells = []
    for f in files:
        if f.startswith('magic__spells-by-class__'):
            spells += parse_spells(f[:-5], read(f))
    print('spells', len(spells))

    # races
    races = []
    for f in files:
        parts = f[:-5].split('__')
        if len(parts) == 3 and parts[0] == 'races':
            try:
                races.append(parse_race(f[:-5], read(f), parts[1]))
            except Exception as e:
                print('race parse failed', f, e)
    print('races', len(races))

    def dump(name, obj):
        with open(os.path.join(OUT, name), 'w', encoding='utf8') as fh:
            json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))
        print('wrote', name, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')

    dump('classes.json', classes)
    dump('feats.json', feat_list)
    dump('spells.json', spells)
    dump('races.json', races)


if __name__ == '__main__':
    main()
