import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('raw_cards_ocr.json', 'r', encoding='utf-8-sig') as f:
    cards = json.load(f)

print(f"Total cards loaded: {len(cards)}")
by_cat = {}
for c in cards:
    cat = c['categoryFolder']
    by_cat.setdefault(cat, []).append(c)

for cat, items in by_cat.items():
    print(f"\n=================== {cat} ({len(items)}) ===================")
    for item in items[:4]:
        lines = [l.strip() for l in item['ocrLines'] if l.strip()]
        print(f"File: {item['filename']}")
        print(f"   Lines ({len(lines)}): {lines}")
