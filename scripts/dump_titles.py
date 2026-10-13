import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('cards_initial.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

by_cat = {}
for c in cards:
    by_cat.setdefault(c['categoryRo'], []).append(c)

for cat, items in by_cat.items():
    print(f"\n=================== {cat} ({len(items)} cards) ===================")
    for c in sorted(items, key=lambda x: x['title']):
        print(f"[{c['id']}] {c['title']}  <--- ({c['filename']})")
