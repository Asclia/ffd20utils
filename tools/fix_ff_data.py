#!/usr/bin/env python3
"""Clean-up pass over the FFd20 data built by build_data.py.

    python3 tools/fix_ff_data.py <cache_dir>

- feats: removes the page markup left in the text, takes the benefit from the "BENEFIT" part of the text, and
  downloads the pages of feats that came only from an index table (metamagic, bardic masterpieces)
- archetypes: removes page markup from the intro and feature texts
- talents and class features: drops section headings that were read as items (no text)
"""
import concurrent.futures as cf
import html
import json
import os
import re
import sys
import urllib.request

FF = 'https://finalfantasyd20.com'
DATA = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
JUNK = re.compile(r'^\s*class="page-content">\s*')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compendium data builder)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf8', 'replace')


def page_text(s):
    i = s.find('<h1 class="page-title">')
    j = s.find('<footer', i)
    h = s[i:j if j > 0 else None]
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', h, flags=re.S)
    h = re.sub(r'<br\s*/?>|</p>|</li>|</h\d>|</tr>', '\n', h)
    h = re.sub(r'</t[dh]>', ' | ', h)
    t = html.unescape(re.sub(r'<[^>]+>', '', h))
    t = re.sub(r'[ \t]+', ' ', t)
    return re.sub(r'\n\s*\n+', '\n', t).strip()


def split_feat(text):
    """'…Prerequisite(s): X.\\nBENEFIT\\nY\\nNORMAL\\nZ' → (prereq, benefit, rest)."""
    t = JUNK.sub('', text or '')
    pre = re.search(r'Prerequisites?(?:\(s\))?\s*:\s*(.+)', t)
    m = re.search(r'\bBENEFITS?\b\s*:?\s*\n?(.*?)(?=\n(?:NORMAL|SPECIAL|NOTE|USE|ACTION)\b|$)', t, re.S)
    return (pre.group(1).strip().rstrip('.') if pre else ''), (m.group(1).strip() if m else ''), t


def main():
    cache = os.path.join(sys.argv[1] if len(sys.argv) > 1 else '.', 'ff_feats')
    os.makedirs(cache, exist_ok=True)
    feats = json.load(open(os.path.join(DATA, 'feats.json')))
    ff = [f for f in feats if f['source'] == 'FFd20']

    def fetch(f):
        if f.get('text') and 'BENEFIT' in f['text'].upper():
            return f, None
        base = re.sub(r'\s*\(.*?\)', '', f['name'])
        slug = re.sub(r'[^a-z0-9]+', '-', base.lower().replace('’', '').replace("'", '')).strip('-')
        cat = f.get('category') or 'general'
        for path in (f.get('url'), f'{FF}/feats/{cat}-feats/{slug}/', f'{FF}/feats/{slug}/'):
            if not path:
                continue
            fn = os.path.join(cache, re.sub(r'[^A-Za-z0-9]+', '_', path)[-120:] + '.html')
            try:
                s = open(fn, encoding='utf8').read() if os.path.exists(fn) else get(path)
                if 'page-title' in s:
                    open(fn, 'w', encoding='utf8').write(s)
                    return f, page_text(s)
            except Exception:
                continue
        return f, None

    with cf.ThreadPoolExecutor(6) as ex:
        res = list(ex.map(fetch, ff))
    fixed = 0
    for f, page in res:
        if page:
            f['text'] = page
        pre, ben, text = split_feat(f.get('text', ''))
        if text:
            f['text'] = text
        if ben and (len((f.get('benefit') or '').strip()) < 5 or re.fullmatch(r'[+−-]?\d+', (f.get('benefit') or '').strip())):
            if re.fullmatch(r'[+−-]?\d+', (f.get('benefit') or '').strip()):
                f['levelAdjust'] = f['benefit'].strip()  # metamagic spell level increase from the index table
            f['benefit'] = ben[:400]
            fixed += 1
        if pre and (not f.get('prerequisites') or f['prerequisites'] in ('—', '-')):
            f['prerequisites'] = pre
    json.dump(feats, open(os.path.join(DATA, 'feats.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('FFd20 feats with benefit filled:', fixed, '| still empty:', sum(1 for f in ff if len((f.get('benefit') or '').strip()) < 5))

    arch = json.load(open(os.path.join(DATA, 'archetypes.json')))
    for a in arch:
        a['intro'] = JUNK.sub('', a.get('intro', '')).strip()
        for f in a['features']:
            f['text'] = JUNK.sub('', f.get('text', ''))
    json.dump(arch, open(os.path.join(DATA, 'archetypes.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

    tal = json.load(open(os.path.join(DATA, 'talents.json')))
    dropped = 0
    for groups in tal.values():
        for g in groups:
            n = len(g['items'])
            g['items'] = [i for i in g['items'] if len((i.get('text') or '').strip()) >= 10]
            dropped += n - len(g['items'])
    json.dump(tal, open(os.path.join(DATA, 'talents.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

    cls = json.load(open(os.path.join(DATA, 'classes.json')))
    for c in cls:
        c['features'] = [f for f in c['features'] if f['name'].strip() and len(f['text'].strip()) >= 15]
        for f in c['features']:
            f['text'] = JUNK.sub('', f['text'])
    json.dump(cls, open(os.path.join(DATA, 'classes.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('talent headings dropped:', dropped)


if __name__ == '__main__':
    main()
