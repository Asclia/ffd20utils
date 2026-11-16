#!/usr/bin/env python3
"""
Download the source pages used by build_data.py into a cache folder.

Usage:
    python3 tools/fetch_sources.py <cache_dir>
    python3 tools/build_data.py <cache_dir>

Pages: finalfantasyd20.com (classes, feats, races, spells by class, bestiary rules)
and d20pfsrd.com (Pathfinder feat index tables). Only the article part of each FFd20
page is kept (the site's navigation menu is ~1 MB per page). Standard library only.
"""
import concurrent.futures as cf
import os
import re
import sys
import urllib.request

FF = 'https://finalfantasyd20.com'
PF_FEAT_CATEGORIES = ['combat', 'general', 'item-creation', 'metamagic', 'monster', 'teamwork', 'racial',
                      'grit', 'animal-companion', 'achievement', 'stare', 'story']
WANT = re.compile(r'^/(classes/(core|base|hybrid|miscellaneous|npc|prestige)-classes/[^/]+/([a-z0-9-]+/)?(archetypes/[^/]+/)?'
                  r'|magical-items/([^/]+/)?|equipment/weapons/([^/]+/)?'
                  r'|feats/[^/]+/([^/]+/)?|feats/'
                  r'|races/(core|base|monstrous)-races/[^/]+/|races/beastman-tribes/[^/]+/'
                  r'|magic/spells-by-class/([^/]+/)?|magic/spells/[a-z0-9]/[^/]+/|magic/mp-system/'
                  r'|gamemastering/bestiary/universal-monster-rules/([^/]+/)?)$')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (ffd20utils data builder)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf8', 'replace')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = sys.argv[1]
    pages = os.path.join(cache, 'pages')
    os.makedirs(pages, exist_ok=True)
    print('reading site navigation…')
    home = get(FF + '/classes/core-classes/knight/')
    links = sorted(set(re.findall(r'href="https://(?:www\.)?finalfantasyd20\.com(/[^"#?]+)"', home)))
    wanted = [l for l in links if WANT.match(l)]
    print(len(wanted), 'FFd20 pages')

    def fetch(path):
        f = os.path.join(pages, path.strip('/').replace('/', '__') + '.html')
        if os.path.exists(f) and os.path.getsize(f) > 0:
            return
        for _ in range(3):
            try:
                s = get(FF + path)
                break
            except Exception as e:  # retry on network errors
                err = e
        else:
            print('FAILED', path, err)
            return
        i = s.find('<h1 class="page-title">')
        j = s.find('<footer', i)
        with open(f, 'w', encoding='utf8') as fh:
            fh.write(s[i:j if j > 0 else None])

    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(fetch, wanted))
    for extra in ['bestiary/rules-for-monsters/universal-monster-rules/', 'bestiary/rules-for-monsters/creature-types/']:
        f = os.path.join(cache, 'pf_' + extra.replace('/', '_') + '.html')
        if not os.path.exists(f):
            with open(f, 'w', encoding='utf8') as fh:
                fh.write(get('https://www.d20pfsrd.com/' + extra))
    for cat in PF_FEAT_CATEGORIES:
        f = os.path.join(cache, f'pf_feats_{cat}-feats_.html')
        if not os.path.exists(f):
            print('d20pfsrd', cat)
            with open(f, 'w', encoding='utf8') as fh:
                fh.write(get(f'https://www.d20pfsrd.com/feats/{cat}-feats/'))
    print('done. Now run: python3 tools/build_data.py', cache)


if __name__ == '__main__':
    main()
