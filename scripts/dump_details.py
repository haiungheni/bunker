import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('cards_initial.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

for cat_slug in ['biologie', 'bagaj', 'hobby', 'sanatate', 'fapte', 'conditii_speciale', 'bunker', 'catastrofe']:
    items = [c for c in cards if c['category'] == cat_slug]
    print(f"\n=================== {cat_slug.upper()} ({len(items)}) ===================")
    for c in items:
        desc = (c['description'][:50] + '...') if len(c['description']) > 50 else c['description']
        print(f"[{c['id']}] file: {c['filename']:35} | title: {c['title']} | desc: {desc}")
