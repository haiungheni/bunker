import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('cards_initial.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

for c in cards:
    if c['category'] == 'biologie':
        print(f"{c['filename']:15} -> {c['title']}")
