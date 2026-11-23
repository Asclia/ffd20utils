#!/usr/bin/env python3
"""Pathfinder 1e weapon list from the Archives of Nethys (aonprd.com, Open Game Content).

    python3 tools/build_pf_weapons.py <cache_dir>

Writes public/data/pf-armor.json: [{name, type: light|medium|heavy|shield, bonus, maxDex, acp, asf, price}] and
public/data/pf-weapons.json: [{name, prof, group, dice, diceS, critRange, critMult, range, kind, hands,
light, thrown, thrownOk, reach, finesse, dtype, special, price, weight}]
(simple, martial, exotic and firearms; Medium damage, price in gp = gil)
"""
import html
import json
import os
import re
import sys
import urllib.request

AON = 'https://www.aonprd.com/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'pf-weapons.json')
OUT_ARMOR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'pf-armor.json')
PAGES = ['Simple', 'Martial', 'Exotic', 'Firearm']
# weapons Weapon Finesse works with besides light weapons
FINESSE = re.compile(r'^(rapier|whip|spiked chain|elven curve blade|elven branched spear|scorpion whip|dueling sword|swordbreaker dagger|cat-o\'-nine-tails|sawtooth sabre|aldori dueling sword)$')
# ranged weapons that are launched (no Strength to damage unless composite), the rest are thrown
LAUNCHER = re.compile(r'bow|crossbow|sling|blowgun|pistol|musket|rifle|gun|blunderbuss|pepperbox|arquebus|axe-musket|culverin|harpoon gun|atlatl|lasso|net|bolas|dart gun|firework|launcher|staff sling', re.I)


def cached(cache, name, url):
    f = os.path.join(cache, name + '.html')
    if os.path.exists(f) and os.path.getsize(f) > 0:
        return open(f, encoding='utf8').read()
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compendium data builder)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        s = r.read().decode('utf8', 'replace')
    with open(f, 'w', encoding='utf8') as fh:
        fh.write(s)
    return s


def text(h):
    h = re.sub(r'<[^>]+>', '', h)
    return re.sub(r'\s+', ' ', html.unescape(h)).strip().replace('—', '').replace('–', '-').strip()


def price(s):
    m = re.match(r'([\d,.]+)\s*(gp|sp|cp)', s)
    if not m:
        return 0
    v = float(m.group(1).replace(',', ''))
    return round(v * {'gp': 1, 'sp': 0.1, 'cp': 0.01}[m.group(2)], 2)


def crit(s):
    m = re.match(r'(?:(\d+)-20\s*/?\s*)?[x×](\d)', s.replace(' ', ''))
    if m:
        return int(m.group(1) or 20), int(m.group(2))
    m = re.match(r'(\d+)-20', s)
    return (int(m.group(1)), 2) if m else (20, 2)


def parse(page, prof):
    out = []
    for sec in re.split(r'<h1 class="title">', page)[1:]:
        title = text(sec[:sec.find('</h1>')])
        t = title.lower()
        if not re.search(r'light|one-handed|two-handed|ranged', t) or re.search(r'ammunition|siege|explosive|gear', t):
            continue
        table = sec[:sec.find('</table>')]
        cols = [text(x).lower() for x in re.findall(r'<th[^>]*>(.*?)</th>', table, re.S)]
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', table, re.S):
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
            if len(cells) < 5:
                continue
            r = dict(zip(cols, [text(c) for c in cells]))
            name = r.get('name', '').strip()
            dice = r.get('dmg (m)') or r.get('dmg') or ''
            if not name or not re.match(r'\d+d\d+', dice):
                continue
            cr, cm = crit(r.get('critical', ''))
            rng = r.get('range', '')
            special = r.get('special', '')
            ranged = 'ranged' in t or 'firearm' in t
            # "shuriken (5)" → shuriken; "katar, tri-bladed" → tri-bladed katar (statblock order)
            lname = re.sub(r'\s*\(\d+\)$', '', name.lower())
            if ', ' in lname:
                a, b = lname.split(', ', 1)
                lname = f'{b} {a}'
            hands = 'two' if 'two-handed' in t else 'one'
            if ranged and re.search(r'longbow|shortbow|crossbow, heavy|heavy crossbow|musket|rifle|blunderbuss|arquebus', lname) and 'one-handed' not in t:
                hands = 'two'
            w = {
                'name': lname, 'prof': 'firearm' if prof == 'Firearm' else prof.lower(), 'group': title,
                'dice': re.match(r'\d+d\d+(?:/\d+d\d+)?', dice).group(0), 'diceS': r.get('dmg (s)', ''),
                'critRange': cr, 'critMult': cm, 'range': rng if re.search(r'\d', rng) else '',
                'kind': 'ranged' if ranged else 'melee', 'hands': hands, 'dtype': r.get('type', ''),
                'special': special, 'price': price(r.get('cost', '')), 'weight': r.get('weight', ''),
            }
            if 'light' in t:
                w['light'] = True
            if ranged and not LAUNCHER.search(lname):
                w['thrown'] = True
            if not ranged and w['range']:
                w['thrownOk'] = True
            if re.search(r'\breach\b', special):
                w['reach'] = True
            if w.get('light') or FINESSE.match(lname) or re.search(r'\bfinesse\b', special):
                w['finesse'] = True
            if '/' in w['dice'] or re.search(r'\bdouble\b', special):
                w['double'] = True
            out.append(w)
    return out


def num(s):
    m = re.search(r'[-+]?\d+', s or '')
    return int(m.group(0)) if m else None


def parse_armor(page, kind):
    out = []
    for sec in re.split(r'<h1 class="title">', page)[1:] or [page]:
        table = sec[:sec.find('</table>')] if '</table>' in sec else sec
        cols = [text(x).lower() for x in re.findall(r'<th[^>]*>(.*?)</th>', table, re.S)]
        if 'armor bonus' not in cols and 'shield bonus' not in cols:
            continue
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', table, re.S):
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
            if len(cells) < 5:
                continue
            r = dict(zip(cols, [text(c) for c in cells]))
            name = re.sub(r'\s*\(\d+\)$', '', r.get('name', '').lower()).strip()
            if ', ' in name:
                a, b = name.split(', ', 1)
                name = f'{b} {a}'
            if kind == 'Shield' and not re.search(r'shield|buckler|klar|madu', name):
                name += ' shield'  # "light steel" → "light steel shield" (statblock name)
            bonus = num(r.get('armor bonus') or r.get('shield bonus'))
            if not name or bonus is None:
                continue
            md = num(r.get('max dex bonus', ''))
            out.append({'name': name, 'type': kind.lower(), 'bonus': bonus, 'maxDex': md, 'acp': abs(num(r.get('armor check penalty', '')) or 0),
                        'asf': num(r.get('arcane spell failure chance', '')) or 0, 'price': price(r.get('cost', ''))})
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cache = os.path.join(sys.argv[1], 'aon_weapons')
    os.makedirs(cache, exist_ok=True)
    out, seen = [], set()
    for p in PAGES:
        for w in parse(cached(cache, p, AON + 'EquipmentWeapons.aspx?Proficiency=' + p), p):
            if w['name'] not in seen:
                seen.add(w['name'])
                out.append(w)
    armor, seen_a = [], set()
    for k in ['Light', 'Medium', 'Heavy', 'Shield']:
        for a in parse_armor(cached(cache, 'armor_' + k, AON + 'EquipmentArmor.aspx?Category=' + k), k):
            if a['name'] not in seen_a:
                seen_a.add(a['name'])
                armor.append(a)
    with open(OUT_ARMOR, 'w', encoding='utf8') as fh:
        json.dump(armor, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(armor), 'armor/shields ->', OUT_ARMOR)
    out.sort(key=lambda w: w['name'])
    with open(OUT, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'weapons ->', OUT)


if __name__ == '__main__':
    main()
