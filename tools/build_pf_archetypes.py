#!/usr/bin/env python3
"""Pathfinder 1e archetypes (Open Game Content) from the Archives of Nethys (aonprd.com).

    python3 tools/build_pf_archetypes.py <cache_dir>

Downloads the archetype lists and pages (cached in <cache_dir>/aon_archetypes) and writes
public/data/pf-archetypes.json: [{id, classId: 'pf-<class>', name, intro, features: [{name, type, level, text, replaces}], source}]
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
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'pf-archetypes.json')
PF_CLASSES = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'pf-classes.json')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compendium data builder)'})
    for _ in range(3):
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


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def text_of(h):
    h = re.sub(r'<br\s*/?>', '\n', h)
    h = re.sub(r'<[^>]+>', '', h)
    return re.sub(r'[ \t]+', ' ', html.unescape(h)).strip()


ORD = r'(\d+)(?:st|nd|rd|th)'


def feature_level(t):
    m = re.search(r'\b[Aa]t ' + ORD + r' level', t) or re.search(r'\b' + ORD + r'[- ]level', t)
    return int(m.group(1)) if m else 1


def replaces_of(t):
    out = []
    for m in re.finditer(r'(?:ability|feature|This|this|and|It|it|archetype) (?:replaces|replace) ([^.;]+)', t):
        part = re.sub(r'\b(the|class features?|abilities|ability|his|her|their|normal|base|class)\b', ' ', m.group(1))
        for x in re.split(r',|\band\b|\bor\b', part):
            x = re.sub(r'\s+', ' ', x).strip(' ’\'"')
            if re.search(r'[a-z]{3}', x, re.I):
                out.append(x)
    return out


def parse_archetype(page):
    i = page.find('MainContent_DataListTypes_LabelName_0')
    if i < 0:
        return None
    j = page.find('</span>\n        </td>', i)
    body = page[i:j if j > 0 else i + 60000]
    body = body[body.find('>') + 1:]
    name = text_of((re.search(r'<h1 class="title">(.*?)</h1>', body, re.S) or [None, ''])[1])
    src = re.search(r'<b>Source</b>\s*<a href="([^"]+)"[^>]*><i>([^<]+)</i>', body)
    body = re.sub(r'^.*?</h1>', '', body, flags=re.S)
    body = re.sub(r'<b>Source</b>.*?(<br\s*/?>|$)', '', body, count=1, flags=re.S)
    # split into "<b>Feature (Ex)</b>: text" blocks
    parts = re.split(r'<b>([^<]{2,80})</b>\s*:?', body)
    intro = text_of(parts[0])
    feats = []
    for k in range(1, len(parts) - 1, 2):
        title = text_of(parts[k]).strip(': ')
        t = text_of(parts[k + 1]).strip(': \n')
        m = re.match(r'(.*?)\s*\((Ex|Su|Sp)\)\s*$', title)
        is_feature = bool(m) or re.search(r'replaces|this ability|\blevel\b|class skills|proficiency', t, re.I)
        if not is_feature and feats:  # an option inside the previous feature (e.g. a list of powers)
            feats[-1]['text'] += f'\n{title}: {t}'
            feats[-1]['replaces'] += replaces_of(t)
            continue
        feats.append({'name': (m.group(1) if m else title).strip(), 'type': m.group(2) if m else '',
                      'level': feature_level(t), 'text': t, 'replaces': replaces_of(t)})
    return {'name': name, 'intro': intro[:600], 'features': feats,
            'book': src.group(2) if src else ''}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = os.path.join(sys.argv[1], 'aon_archetypes')
    os.makedirs(cache, exist_ok=True)
    ours = {c['id'] for c in json.load(open(PF_CLASSES))}
    idx = cached(cache, 'index', AON + 'Archetypes.aspx')
    classes = sorted(set(re.findall(r'ClassDisplay\.aspx\?ItemName=([^"]+)"', idx)))
    jobs = []
    for cname in classes:
        cid = slug(cname)
        if cid not in ours:
            print('skip (class not in pf-classes.json):', cname)
            continue
        lst = cached(cache, 'list_' + cname, AON + 'Archetypes.aspx?Class=' + urllib.parse.quote(cname))
        names = sorted(set(html.unescape(x) for x in re.findall(r'ArchetypeDisplay\.aspx\?FixedName=([^"]+)"', lst)))
        print(cname, len(names))
        jobs += [(cid, n) for n in names]

    def one(job):
        cid, fixed = job
        url = AON + 'ArchetypeDisplay.aspx?FixedName=' + urllib.parse.quote(fixed)
        try:
            a = parse_archetype(cached(cache, 'a_' + fixed, url))
        except Exception as e:
            print('FAILED', fixed, e)
            return None
        if not a or not a['name']:
            return None
        return {'id': f'pf-{cid}--{slug(a["name"])}', 'classId': f'pf-{cid}', 'name': a['name'], 'intro': a['intro'],
                'features': a['features'], 'source': url, 'book': a['book'], 'system': 'pf1e'}

    with cf.ThreadPoolExecutor(6) as ex:
        out = [x for x in ex.map(one, jobs) if x]
    # a feature named like a class feature, with no level of its own, takes that feature's level
    base = {c['id']: {f['name'].lower(): f['level'] for f in c.get('features', [])} for c in json.load(open(PF_CLASSES))}
    for a in out:
        lv = base.get(a['classId'][3:], {})
        for f in a['features']:
            k = f['name'].lower()
            if k in lv and not re.search(r'\b[Aa]t \d+(?:st|nd|rd|th) level|\d+(?:st|nd|rd|th)[- ]level', f['text']):
                f['level'] = lv[k]
    seen = set()
    out = [x for x in out if not (x['id'] in seen or seen.add(x['id']))]
    out.sort(key=lambda x: (x['classId'], x['name']))
    with open(OUT, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'archetypes ->', OUT)


if __name__ == '__main__':
    main()
