#!/usr/bin/env python3
"""Pathfinder 1e class extras from the Archives of Nethys (aonprd.com, Open Game Content).

    python3 tools/build_pf_extras.py <cache_dir>

- public/data/pf-talents.json  talent-like choices with a limit by level (rogue talents, rage powers, hexes…),
                               keyed by class id ("pf-rogue"), same format as talents.json (FFd20)
- public/data/pf-paths.json    one-time choices that grant powers by level: cleric/inquisitor domains,
                               sorcerer/bloodrager bloodlines, wizard schools, oracle mysteries, shaman spirits
- public/data/pf-classes.json  class feature texts replaced by the clean AoN text (d20pfsrd pages carry FAQ
                               boxes and sidebars), plus "domainSlots" for clerics
"""
import concurrent.futures as cf
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

AON = 'https://www.aonprd.com/'
DATA = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compendium data builder)'})
    err = None
    for _ in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode('utf8', 'replace')
        except Exception as e:  # retry
            err = e
    raise err


def cached(cache, name, url):
    f = os.path.join(cache, re.sub(r'[^A-Za-z0-9_.-]+', '_', name) + '.html')
    if os.path.exists(f) and os.path.getsize(f) > 0:
        return open(f, encoding='utf8').read()
    s = get(url)
    with open(f, 'w', encoding='utf8') as fh:
        fh.write(s)
    return s


def clean(h):
    h = re.sub(r'<br\s*/?>', '\n', h)
    h = re.sub(r'<(table|tr)[^>]*>', '\n', h)
    h = re.sub(r'</t[dh]>', ' | ', h)
    h = re.sub(r'<[^>]+>', '', h)
    h = html.unescape(h).replace('\xa0', ' ')
    h = re.sub(r'[ \t]+', ' ', h)
    h = re.sub(r'\n\s*\n+', '\n', h)
    return h.strip(' \n:')


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def main_span(page):
    i = page.find('MainContent_DataListTypes_LabelName_0')
    if i < 0:
        i = page.find('MainContent_DataListTypes')
    if i < 0:
        return ''
    j = page.find('</span>\n        </td>', i)
    return page[page.find('>', i) + 1:j if j > 0 else None]


ORD = r'(\d+)(?:st|nd|rd|th)'


def level_of(t, default=1):
    m = re.search(r'\b(?:[Aa]t|[Ss]tarting at|[Bb]eginning at|[Uu]pon reaching) ' + ORD + r' level', t)
    return int(m.group(1)) if m else default


def powers(section, default_level=1):
    """'<i>Fire Bolt (Sp)</i>: text' or '<b>Claws (Su)</b>: text' blocks."""
    out = []
    parts = re.split(r'<(?:i|b)>([^<]{2,70}?)\s*\((Ex|Su|Sp)\)</(?:i|b)>\s*:?', section)
    for k in range(1, len(parts) - 2, 3):
        name, kind, body = parts[k].strip(), parts[k + 1], parts[k + 2]
        body = re.split(r'<h\d|<b>(?:Domain Spells|Bonus Spells|Bonus Feats|Class Skills?|Revelations|Final Revelation)', body)[0]
        text = clean(body)
        out.append({'name': name, 'type': kind, 'level': level_of(text, default_level if not out else default_level), 'text': text})
    return out


# ------------------------------------------------------------------ talent lists (one row per talent)
TALENT_PAGES = [
    # (page, group name, table key, class ids)
    ('RogueTalents.aspx', 'Rogue Talents', 'rogue talent', ['rogue', 'rogue-unchained']),
    ('NinjaTricks.aspx', 'Ninja Tricks', 'ninja trick', ['ninja']),
    ('BarbarianRagePowers.aspx', 'Rage Powers', 'rage power', ['barbarian', 'barbarian-unchained', 'skald']),
    ('WitchHexes.aspx', 'Hexes', 'hex', ['witch']),
    ('ShamanHexes.aspx', 'Hexes', 'hex', ['shaman']),
    ('AlchemistDiscoveries.aspx', 'Discoveries', 'discovery', ['alchemist']),
    ('MagusArcana.aspx', 'Magus Arcana', 'magus arcana', ['magus']),
    ('SlayerTalents.aspx', 'Slayer Talents', 'slayer talent', ['slayer']),
    ('InvestigatorTalents.aspx', 'Investigator Talents', 'investigator talent', ['investigator']),
    ('ArcanistExploits.aspx', 'Arcanist Exploits', 'arcanist exploit', ['arcanist']),
    ('PaladinMercies.aspx', 'Mercies', 'mercy', ['paladin']),
    ('VigilanteTalents.aspx', 'Vigilante Talents', 'vigilante talent', ['vigilante']),
    ('MonkUCKiPowers.aspx', 'Ki Powers', 'ki power', ['monk-unchained']),
]


def talent_rows(page):
    rows = []
    # format 1: data list rows "<i>Name (Ex)</i> (<a>book</a>): text<hr />"
    for m in re.finditer(r'MainContent_DataList\w*_LabelName_\d+">(.*?)</span>', page, re.S):
        h = m.group(1)
        nm = re.search(r'<(i|b)>(?:<img[^>]*>)?\s*([^<]+?)\s*(?:\((Ex|Su|Sp)\))?\s*</\1>', h)
        if not nm:
            continue
        rest = h[nm.end():]
        rest = re.sub(r'^\s*\(<a[^>]*>.*?</a>(?:,\s*<a[^>]*>.*?</a>)*\)\s*:?', '', rest, flags=re.S)
        rows.append((html.unescape(nm.group(2)).strip(), nm.group(3) or '', clean(rest.replace('<hr />', ''))))
    # format 2: "<h2 class="title"><a …>Name</a> (Su)</h2> <b>Source</b> … text"
    for m in re.finditer(r'<h2 class="title"><a[^>]*>(?:<img[^>]*>)?\s*([^<]+)</a>\s*(?:\((Ex|Su|Sp)\))?</h2>(.*?)(?=<h2 class="title">|</span>\s*</td>|$)', page, re.S):
        body = re.sub(r'<b>Source</b>.*?<br\s*/?>', '', m.group(3), count=1, flags=re.S)
        rows.append((html.unescape(m.group(1)).strip(), m.group(2) or '', clean(body)))
    out, seen = [], set()
    for name, kind, text in rows:
        if not name or name.lower() in seen or len(text) < 10:
            continue
        seen.add(name.lower())
        pre = re.search(r'(?:[Pp]rerequisites?)\s*:?\s*([^.]+)\.', text)
        out.append({'name': name, 'type': kind, 'prereq': pre.group(1).strip() if pre else '', 'text': text})
    return out


def talent_page(cache, page):
    s = cached(cache, page, AON + page)
    rows = talent_rows(s)
    for sub in sorted(set(re.findall(re.escape(page) + r'\?(Type=[^"&]+)"', s))):  # pages split by type (rage powers)
        rows += talent_rows(cached(cache, f'{page}_{sub}', AON + page + '?' + sub))
    seen = set()
    return [r for r in rows if not (r['name'].lower() in seen or seen.add(r['name'].lower()))]


def per_level(cls, key):
    out, n = [], 0
    for row in cls['levels']:
        for sp in row['special']:
            s = re.sub(r'\(.*?\)|[\d+]', '', sp.lower()).strip()
            if s.startswith(key) or s.startswith(key + 's'):
                n += 1
        out.append(n)
    return out


# ------------------------------------------------------------------ paths (domains, bloodlines…)
def spell_list(text_html, label):
    m = re.search(r'<b>' + label + r'</b>\s*:?(.*?)(?:<br\s*/?>\s*<br|<h\d|$)', text_html, re.S)
    if not m:
        return {}
    t = clean(m.group(1))
    out = {}
    for mm in re.finditer(r'(\d+)(?:st|nd|rd|th)\s*[—–-]\s*([^,]+?)(?=,\s*\d+(?:st|nd|rd|th)\s*[—–-]|$)', t):  # "1st—burning hands, 2nd—…"
        out[int(mm.group(1))] = mm.group(2).strip(' .')
    if not out:  # "mage armor (3rd), resist energy (5th)…" (class level in parentheses)
        for mm in re.finditer(r'([^,()]+?)\s*\((\d+)(?:st|nd|rd|th)\)', t):
            out[int(mm.group(2))] = mm.group(1).strip(' .')
    return out


def field(text_html, label):
    m = re.search(r'<b>' + label + r'</b>\s*:?(.*?)(?:<br\s*/?>|<h\d)', text_html, re.S)
    return clean(m.group(1)) if m else ''


PATHS = [
    # (list page, display page, kind, class ids, how many, default level of first power)
    ('ClericDomains.aspx', 'DomainDisplay.aspx', 'domain', ['cleric', 'inquisitor'], {'cleric': 2, 'inquisitor': 1}),
    ('SorcererBloodlines.aspx', 'BloodlineDisplay.aspx', 'bloodline', ['sorcerer'], {'sorcerer': 1}),
    ('BloodragerBloodlines.aspx', 'BloodragerBloodlineDisplay.aspx', 'bloodline', ['bloodrager'], {'bloodrager': 1}),
    ('WizardSchools.aspx', 'SchoolDisplay.aspx', 'school', ['wizard'], {'wizard': 1}),
    ('OracleMysteries.aspx', 'MysteryDisplay.aspx', 'mystery', ['oracle'], {'oracle': 1}),
    ('ShamanSpirits.aspx', 'ShamanSpiritDisplay.aspx', 'spirit', ['shaman'], {'shaman': 1}),
]


def parse_path(page, kind):
    body = main_span(page)
    title = re.search(r'<h1 class="title">(?:<img[^>]*>)?\s*([^<]+)</h1>', body)
    name = clean(title.group(1)) if title else ''
    name = re.sub(r'\s+(Bloodline|Domain|School|Mystery|Spirit)$', '', name)
    main = re.split(r'<h2 class="title">', body)[0]  # subdomains / subschools / variants are left out
    out = {'name': name, 'kind': kind}
    out['classSkills'] = field(main, 'Class Skills?')
    out['bonusFeats'] = field(main, 'Bonus Feats')
    out['spells'] = spell_list(main, 'Domain Spells') or spell_list(main, 'Bonus Spells')
    pw = []
    if kind == 'domain':
        g = main.find('Granted Powers')
        pw = powers(main[g:] if g >= 0 else main)
    elif kind == 'bloodline':
        arc = field(main, 'Bloodline Arcana')
        if arc:
            pw.append({'name': 'Bloodline Arcana', 'type': '', 'level': 1, 'text': arc})
        g = main.find('Bloodline Powers')
        pw += powers(main[g:] if g >= 0 else main)
    elif kind == 'mystery':
        out['revelations'] = powers(main[main.find('Revelations'):] if 'Revelations' in main else '')
        fr = re.search(r'<b>Final Revelation</b>\s*:?(.*?)(?:<br\s*/?>\s*<br|<h\d|$)', main, re.S)
        if fr:
            pw.append({'name': 'Final Revelation', 'type': '', 'level': 20, 'text': clean(fr.group(1))})
    else:
        pw = powers(main)
    out['powers'] = pw
    desc = re.search(r'</h1>.*?<br\s*/?>(.*?)<br\s*/?>\s*<br', main, re.S)
    out['desc'] = clean(desc.group(1))[:400] if desc else ''
    return out


# ------------------------------------------------------------------ class feature texts
AON_CLASS = {'barbarian-unchained': 'Barbarian (Unchained)', 'monk-unchained': 'Monk (Unchained)', 'rogue-unchained': 'Rogue (Unchained)', 'summoner-unchained': 'Summoner (Unchained)', 'vampire-hunter': 'Vampire Hunter'}
norm = lambda s: re.sub(r'\s*\((ex|su|sp)\)', '', re.sub(r'[’\']', "'", s.lower())).strip()


def class_features(page):
    body = main_span(page) or page
    i = body.find('Class Features')
    body = body[i:] if i >= 0 else body
    body = re.sub(r'<table.*?</table>', '', body, flags=re.S)
    out = {}
    for m in re.finditer(r'<b>([^<]{2,60}?)</b>\s*:(.*?)(?=<b>[^<]{2,60}?</b>\s*:|<h\d|$)', body, re.S):
        name = clean(m.group(1))
        text = clean(m.group(2))
        if len(text) > 20 and norm(name) not in out:
            out[norm(name)] = text
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = os.path.join(sys.argv[1], 'aon_extras')
    os.makedirs(cache, exist_ok=True)
    classes = json.load(open(os.path.join(DATA, 'pf-classes.json')))
    by_id = {c['id']: c for c in classes}

    # talents
    talents = {}
    for page, group, key, ids in TALENT_PAGES:
        rows = talent_page(cache, page)
        for cid in ids:
            c = by_id.get(cid)
            if not c:
                continue
            pl = per_level(c, key)
            if not any(pl):
                pl = None
            talents.setdefault(f'pf-{cid}', []).append({'group': group, 'key': key, 'advanced': False, 'perLevel': pl, 'items': rows, 'source': AON + page})
        print(page, len(rows))
    # vigilante: social talents use the same list page (social talent entries are mixed in)
    if 'pf-vigilante' in talents:
        g = talents['pf-vigilante'][0]
        pl = per_level(by_id['vigilante'], 'social talent')
        talents['pf-vigilante'].append({**g, 'group': 'Social Talents', 'key': 'social talent', 'perLevel': pl})

    # paths
    paths = {}
    jobs = []
    for lst, disp, kind, ids, count in PATHS:
        idx = cached(cache, lst, AON + lst)
        names = sorted(set(html.unescape(x) for x in re.findall(re.escape(disp) + r'\?ItemName=([^"&]+)"', idx)))
        print(lst, len(names))
        jobs += [(disp, kind, ids, count, n) for n in names]

    def one(job):
        disp, kind, ids, count, n = job
        try:
            p = parse_path(cached(cache, f'{disp}_{n}', AON + disp + '?ItemName=' + urllib.parse.quote(n)), kind)
        except Exception as e:
            print('FAILED', disp, n, e)
            return None
        return (ids, count, {**p, 'id': f'{kind}-{slug(p["name"] or n)}', 'source': AON + disp + '?ItemName=' + urllib.parse.quote(n)})

    with cf.ThreadPoolExecutor(6) as ex:
        res = [x for x in ex.map(one, jobs) if x]
    for ids, count, p in res:
        for cid in ids:
            if cid in by_id:
                e = paths.setdefault(f'pf-{cid}', {'kind': p['kind'], 'count': count.get(cid, 1), 'options': []})
                if not any(o['id'] == p['id'] for o in e['options']):
                    e['options'].append(p)
    for e in paths.values():
        e['options'].sort(key=lambda o: o['name'])
    # oracle revelations: a talent group whose items depend on the mystery
    if 'pf-oracle' in paths:
        items = [{**r, 'path': o['id'], 'prereq': ''} for o in paths['pf-oracle']['options'] for r in o.get('revelations', [])]
        talents.setdefault('pf-oracle', []).append({'group': 'Revelations', 'key': 'revelation', 'advanced': False, 'perLevel': per_level(by_id['oracle'], 'revelation'), 'items': items, 'source': AON + 'OracleMysteries.aspx', 'byPath': True})

    # clean class feature texts
    fixed = 0
    def cf_one(c):
        name = AON_CLASS.get(c['id'], c['name'])
        try:
            return c['id'], class_features(cached(cache, 'class_' + name, AON + 'ClassDisplay.aspx?ItemName=' + urllib.parse.quote(name)))
        except Exception as e:
            print('FAILED class', name, e)
            return c['id'], {}
    with cf.ThreadPoolExecutor(6) as ex:
        feats = dict(ex.map(cf_one, classes))
    for c in classes:
        aon = feats.get(c['id'], {})
        for f in c.get('features', []):
            k = norm(f['name'])
            alias = {'spellcasting': 'spells', 'weapon proficiency': 'weapon and armor proficiency'}.get(k, k)
            t = aon.get(k) or aon.get(alias) or next((v for kk, v in aon.items() if kk.startswith(k) or k.startswith(kk)), None)
            if t:
                f['text'] = t
                fixed += 1
            else:  # strip FAQ boxes from the d20pfsrd text
                f['text'] = re.sub(r'FAQ\b.*?\[Source\]\s*', '', f['text'], flags=re.S).strip()
        # sidebars from d20pfsrd that are not class features
        c['features'] = [f for f in c.get('features', []) if not re.search(r'3rd party|third party|optional rules?|^alternate .*options$|options$|^new |^favored class|paizo|^all |^animal companion (feats|archetypes)|\(optional\)|alternate natural attacks|bloodrager bloodlines|druidic herbalism', f['name'], re.I)]
        if c['id'] == 'cleric':
            c['domainSlots'] = True
    json.dump(classes, open(os.path.join(DATA, 'pf-classes.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump(talents, open(os.path.join(DATA, 'pf-talents.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump(paths, open(os.path.join(DATA, 'pf-paths.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('features fixed', fixed, '| talent classes', len(talents), '| path classes', len(paths), {k: len(v['options']) for k, v in paths.items()})


if __name__ == '__main__':
    main()
