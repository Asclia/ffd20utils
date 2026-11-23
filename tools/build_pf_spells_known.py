#!/usr/bin/env python3
"""Spells known by level for the Pathfinder 1e spontaneous casters, from the Archives of Nethys class pages.

    python3 tools/build_pf_spells_known.py <cache_dir>

Writes public/data/pf-spells-known.json: {"pf-sorcerer": [{"0": 4, "1": 2}, …20 rows], …}
"""
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

AON = 'https://www.aonprd.com/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'pf-spells-known.json')
PF_CLASSES = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'pf-classes.json')
AON_NAME = {'summoner-unchained': 'Summoner (Unchained)', 'vampire-hunter': 'Vampire Hunter'}


def cached(cache, name, url):
    f = os.path.join(cache, re.sub(r'[^A-Za-z0-9_.-]+', '_', name) + '.html')
    if os.path.exists(f) and os.path.getsize(f) > 0:
        return open(f, encoding='utf8').read()
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compendium data builder)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        s = r.read().decode('utf8', 'replace')
    with open(f, 'w', encoding='utf8') as fh:
        fh.write(s)
    return s


def cell(h):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', h))).strip()


def known_table(page):
    """the table that follows a "Spells Known" caption: rows "1st | 4 | 2 | — …" under a header "Level | 0 | 1st …" """
    i = page.find('Spells Known')
    if i < 0:
        return None
    end = page.find('</table>', i)
    rows = re.findall(r'<tr[^>]*>(.*?)(?=</tr>|<tr[\s>]|$)', page[i:end], re.S)
    head = None
    out = []
    for r in rows:
        # AoN leaves the last <td> of each row unclosed
        cells = [cell(x) for x in re.findall(r'<t[dh][^>]*>(.*?)(?=</t[dh]>|<t[dh][\s>]|$)', r, re.S)]
        if not cells:
            continue
        if cells[0].lower() == 'level' and head is None:
            head = [re.match(r'\d+', c).group(0) if re.match(r'\d+', c) else None for c in cells[1:]]
            continue
        if head and re.match(r'\d+(st|nd|rd|th)$', cells[0]):
            row = {}
            for lv, v in zip(head, cells[1:]):
                if lv is not None and re.fullmatch(r'\d+', v):
                    row[lv] = int(v)
            out.append(row)
    return out if len(out) >= 20 else None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = os.path.join(sys.argv[1], 'aon_classes')
    os.makedirs(cache, exist_ok=True)
    classes = json.load(open(PF_CLASSES))
    out = {}
    for c in classes:
        if not (c.get('caster') and c.get('spontaneous')):
            continue
        name = AON_NAME.get(c['id'], c['name'])
        page = cached(cache, 'class_' + name, AON + 'ClassDisplay.aspx?ItemName=' + urllib.parse.quote(name))
        t = known_table(page)
        print(c['id'], 'OK' if t else 'no table')
        if t:
            out['pf-' + c['id']] = t[:20]
    with open(OUT, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'classes ->', OUT)


if __name__ == '__main__':
    main()
