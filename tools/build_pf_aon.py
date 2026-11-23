#!/usr/bin/env python3
"""Pathfinder 1e feats and spells from the Archives of Nethys (aonprd.com, Open Game Content).

    python3 tools/build_pf_aon.py <cache_dir>

- public/data/pf-spells.json      one entry per (spell, class) with the level, from each spell's own "Level" line
                                  (covers every class, including alchemist/investigator formulae and adept)
- public/data/pf-spell-info.json  spell name → school, casting time, components, range, area/target, duration,
                                  saving throw, spell resistance, description
- public/data/feats.json          the Pathfinder entries are replaced by the full AoN feat list (prerequisites,
                                  benefit, normal, special); FFd20 entries are kept
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
    f = os.path.join(cache, re.sub(r'[^A-Za-z0-9_.-]+', '_', name)[:150] + '.html')
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
    return h.strip(' \n:;')


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def first_block(page, want=None):
    """The entry of a display page whose title is `want` (pages can hold several related entries, e.g.
    "Absorb Rune I/II/III"); otherwise the first one. Later <h2> parts are mythic versions etc."""
    starts = [m.start() for m in re.finditer(r'<h1 class="title">', page)]
    if not starts:
        return ''
    pick = starts[0]
    if want:
        norm = lambda t: re.sub(r'[^a-z0-9]+', ' ', html.unescape(re.sub(r'<[^>]+>', '', t)).lower()).strip()
        for st in starts:
            title = re.search(r'<h1 class="title">(.*?)</h1>', page[st:], re.S)
            if title and norm(re.sub(r'\(.*?\)', '', title.group(1))) == norm(want):
                pick = st
                break
    body = page[pick:]
    end = re.search(r'<h1 class="title">|<h2 class="title">|</span>\s*</td>', body[10:])
    return body[:end.start() + 10] if end else body


def field(block, label):
    m = re.search(r'<b>' + label + r'</b>\s*:?(.*?)(?=<br\s*/?>|<b>|<h\d|$)', block, re.S)
    return clean(m.group(1)) if m else ''


# ------------------------------------------------------------------ spells
CLASS_ALIAS = {'sorcerer/wizard': ['sorcerer', 'wizard'], 'summoner (unchained)': ['summoner-unchained'], 'unchained summoner': ['summoner-unchained'],
               'antipaladin': ['antipaladin'], 'vampire hunter': ['vampire-hunter'], 'cleric/oracle': ['cleric', 'oracle']}


def parse_spell(page, want=None):
    b = first_block(page, want)
    if not b:
        return None
    name = clean(re.search(r'<h1 class="title">(.*?)</h1>', b, re.S).group(1))
    src = re.search(r'<b>Source</b>\s*<a[^>]*><i>([^<]+)</i>', b)
    school_html = re.search(r'<b>School</b>(.*?);\s*<b>Level</b>', b, re.S)
    level_txt = field(b, 'Level')
    levels = {}
    for part in level_txt.split(','):
        m = re.match(r'\s*(.+?)\s+(\d)\s*$', part)
        if not m:
            continue
        cname = m.group(1).strip().lower()
        for cid in CLASS_ALIAS.get(cname, [re.sub(r'\s*\(unchained\)', '-unchained', cname).replace(' ', '-')]):
            levels[cid] = int(m.group(2))
    desc = re.search(r'<h3 class="framing">Description</h3>(.*)$', b, re.S)
    info = {
        'school': clean(school_html.group(1)) if school_html else '',
        'castingTime': field(b, 'Casting Time'), 'components': field(b, 'Components'), 'range': field(b, 'Range'),
        'area': field(b, 'Area'), 'target': field(b, 'Targets?'), 'effect': field(b, 'Effect'), 'duration': field(b, 'Duration'),
        'save': field(b, 'Saving Throw'), 'sr': field(b, 'Spell Resistance'), 'book': src.group(1) if src else '',
        'text': clean(desc.group(1))[:1500] if desc else '',
    }
    return name, levels, info


# ------------------------------------------------------------------ feats
def parse_feat(page, want=None):
    b = first_block(page, want)
    if not b:
        return None
    title = clean(re.search(r'<h1 class="title">(.*?)</h1>', b, re.S).group(1))
    m = re.match(r'(.*?)\s*\(([^)]*)\)\s*$', title)
    name, tags = (m.group(1), m.group(2)) if m else (title, '')
    src = re.search(r'<b>Source</b>\s*<a[^>]*><i>([^<]+)</i>', b)
    flavor = re.search(r'</a>\s*(?:,\s*<a[^>]*>.*?</a>\s*)*<br\s*/?>(.*?)<br\s*/?>\s*<br', b, re.S)
    return {
        'name': name.strip(), 'tags': tags, 'book': src.group(1) if src else '',
        'flavor': clean(flavor.group(1)) if flavor and '<b>' not in flavor.group(1) else '',
        'prerequisites': field(b, 'Prerequisites?'), 'benefit': field(b, 'Benefits?'),
        'normal': field(b, 'Normal'), 'special': field(b, 'Special'),
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = os.path.join(sys.argv[1], 'aon_more')
    os.makedirs(cache, exist_ok=True)
    pf_ids = {c['id'] for c in json.load(open(os.path.join(DATA, 'pf-classes.json')))}

    # spells
    idx = cached(cache, 'spells_all', AON + 'Spells.aspx?Class=All')
    summaries = {}
    for m in re.finditer(r'SpellDisplay\.aspx\?ItemName=([^"]+)">(?:<img[^>]*>)?\s*([^<]+)</b>.*?</a></b>:\s*([^<]*)<br', idx, re.S):
        summaries[html.unescape(m.group(1))] = html.unescape(m.group(3)).strip()
    for m in re.finditer(r'SpellDisplay\.aspx\?ItemName=([^"]+)".*?</a>(?:</b>)?(?:<sup>[^<]*</sup>)*(?:<b>)?(?:</a>)?(?:</b>)?:\s*([^<]*)<br', idx, re.S):
        summaries.setdefault(html.unescape(m.group(1)), html.unescape(m.group(2)).strip())
    names = sorted(set(html.unescape(x) for x in re.findall(r'SpellDisplay\.aspx\?ItemName=([^"]+)"', idx)))
    print('spells listed', len(names))

    def one_spell(n):
        try:
            return n, parse_spell(cached(cache, 'spell_' + n, AON + 'SpellDisplay.aspx?ItemName=' + urllib.parse.quote(n)), n)
        except Exception as e:
            print('FAILED spell', n, e)
            return n, None
    with cf.ThreadPoolExecutor(8) as ex:
        spells = list(ex.map(one_spell, names))
    out, info = [], {}
    unknown = set()
    for n, r in spells:
        if not r:
            continue
        name, levels, meta = r
        info[name] = meta
        for cid, lv in levels.items():
            if cid not in pf_ids:
                unknown.add(cid)
            out.append({'name': name, 'level': lv, 'class': cid, 'summary': summaries.get(n, '')[:200] or meta['text'][:160], 'book': meta['book'][:40], 'system': 'pf1e'})
    print('spell entries', len(out), 'unique', len(info), 'classes not in pf-classes (kept for lists):', sorted(unknown))
    json.dump(out, open(os.path.join(DATA, 'pf-spells.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump(info, open(os.path.join(DATA, 'pf-spell-info.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

    # feats
    fidx = cached(cache, 'feats_all', AON + 'Feats.aspx')
    rows = {}
    for m in re.finditer(r'<td><a href="FeatDisplay\.aspx\?ItemName=([^"]+)">(?:<img[^>]*>)?\s*[^<]*</a></td><td>(.*?)</td><td>(.*?)</td>', fidx, re.S):
        rows[html.unescape(m.group(1))] = (clean(m.group(2)), clean(m.group(3)))
    print('feats listed', len(rows))

    def one_feat(n):
        try:
            return n, parse_feat(cached(cache, 'feat_' + n, AON + 'FeatDisplay.aspx?ItemName=' + urllib.parse.quote(n)), n)
        except Exception as e:
            print('FAILED feat', n, e)
            return n, None
    with cf.ThreadPoolExecutor(8) as ex:
        feats = list(ex.map(one_feat, sorted(rows)))
    pf_feats = []
    for n, f in feats:
        pre, summ = rows[n]
        f = f or {'name': n, 'tags': '', 'book': '', 'flavor': '', 'prerequisites': '', 'benefit': '', 'normal': '', 'special': ''}
        text = '\n'.join(x for x in [f['flavor'], f'Prerequisites: {f["prerequisites"]}' if f['prerequisites'] else '', f'Benefit: {f["benefit"]}' if f['benefit'] else '',
                                     f'Normal: {f["normal"]}' if f['normal'] else '', f'Special: {f["special"]}' if f['special'] else ''] if x)
        pf_feats.append({'name': f['name'] or n, 'source': 'Pathfinder', 'category': (f['tags'].split(',')[0].strip().lower() or 'general'), 'tags': f['tags'],
                         'book': f['book'][:60], 'prerequisites': f['prerequisites'] or ('' if pre in ('—', '-') else pre), 'benefit': summ or f['benefit'][:200],
                         'text': text, 'id': 'pf-' + slug(f['name'] or n), 'url': AON + 'FeatDisplay.aspx?ItemName=' + urllib.parse.quote(n)})
    all_feats = json.load(open(os.path.join(DATA, 'feats.json')))
    ff = [x for x in all_feats if x['source'] != 'Pathfinder']
    seen = set()
    pf_feats = [x for x in pf_feats if not (x['id'] in seen or seen.add(x['id']))]
    # keep Pathfinder feats of the previous list that AoN does not have (index-only feats from d20pfsrd)
    canon = lambda n: re.sub(r'\s*\(.*?\)', '', n.replace('’', "'")).strip().lower()
    have = {canon(x['name']) for x in pf_feats}
    old = [x for x in all_feats if x['source'] == 'Pathfinder' and canon(x['name']) not in have and not re.search(r',\s*\w+$', x['name'])]
    json.dump(ff + pf_feats + old, open(os.path.join(DATA, 'feats.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('feats: FFd20', len(ff), '+ Pathfinder', len(pf_feats))


if __name__ == '__main__':
    main()
