import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('raw_cards_ocr.json', 'r', encoding='utf-8-sig') as f:
    cards = json.load(f)

CATEGORY_MAP = {
    'Bagaj': {'slug': 'bagaj', 'ro': 'Bagaj', 'order': 5},
    'Biologia': {'slug': 'biologie', 'ro': 'Biologie', 'order': 2},
    'Bunker': {'slug': 'bunker', 'ro': 'Buncăr', 'order': 8},
    'Catastrofe': {'slug': 'catastrofe', 'ro': 'Catastrofă', 'order': 9},
    'Condiții_speciale': {'slug': 'conditii_speciale', 'ro': 'Condiție Specială', 'order': 7},
    'Hobby': {'slug': 'hobby', 'ro': 'Hobby', 'order': 4},
    'Informații Personale': {'slug': 'fapte', 'ro': 'Informație Personală', 'order': 6},
    'Profesii': {'slug': 'profesie', 'ro': 'Profesie', 'order': 1},
    'Sănătate': {'slug': 'sanatate', 'ro': 'Sănătate', 'order': 3},
}

processed = []

for idx, c in enumerate(cards):
    folder = c['categoryFolder']
    cat_info = CATEGORY_MAP[folder]
    lines = [l.strip() for l in c['ocrLines'] if l.strip()]
    filename = c['filename']
    rel_path = c['relPath']
    
    title = ""
    description = ""
    
    if folder == 'Profesii':
        # Header is PROFESIA, rest is profession
        sub = [l for l in lines if not re.search(r'PROFESI[AĂ]', l, re.IGNORECASE)]
        title = " ".join(sub).strip()
    elif folder == 'Biologia':
        sub = [l for l in lines if not re.search(r'[BS]IOLOGI[AĂ]', l, re.IGNORECASE)]
        title = " ".join(sub).strip()
    elif folder == 'Hobby':
        sub = [l for l in lines if not re.search(r'HOBBY', l, re.IGNORECASE)]
        title = " ".join(sub).strip()
    elif folder == 'Sănătate':
        sub = [l for l in lines if not re.search(r'S[AĂ]N[AĂ]TATE[AĂ]?', l, re.IGNORECASE)]
        title = " ".join(sub).strip()
    elif folder == 'Bagaj':
        sub = [l for l in lines if not re.search(r'BAGAJ(UL)?', l, re.IGNORECASE)]
        title = " ".join(sub).strip()
    elif folder == 'Informații Personale':
        sub = [l for l in lines if not re.search(r'INFORM[AȚTI\':]+|PERSONALE', l, re.IGNORECASE)]
        title = " ".join(sub).strip()
    elif folder == 'Condiții_speciale':
        # Typically: Header 'CONDITIE SPECIALA', middle description, bottom card title
        sub = [l for l in lines if not re.search(r'CON[IDȚ]+[EIA\s]+SPECIAL[AĂ]', l, re.IGNORECASE)]
        if len(sub) > 1:
            title = sub[-1].strip()
            description = " ".join(sub[:-1]).strip()
        elif len(sub) == 1:
            title = sub[0].strip()
    elif folder == 'Bunker':
        # Typically: Header '@BUNKER', middle description, bottom card title
        sub = [l for l in lines if not re.search(r'[@\s]*BUNKER', l, re.IGNORECASE)]
        if len(sub) > 1:
            title = sub[-1].strip()
            description = " ".join(sub[:-1]).strip()
        elif len(sub) == 1:
            title = sub[0].strip()
    elif folder == 'Catastrofe':
        # Typically: Header 'CATASTROFA', middle description, bottom card title
        sub = [l for l in lines if not re.search(r'CATASTROF[AĂ]', l, re.IGNORECASE)]
        if len(sub) > 1:
            title = sub[-1].strip()
            description = " ".join(sub[:-1]).strip()
        elif len(sub) == 1:
            title = sub[0].strip()
            
    processed.append({
        'id': f"card_{idx+1:03d}",
        'category': cat_info['slug'],
        'categoryRo': cat_info['ro'],
        'categoryOrder': cat_info['order'],
        'folder': folder,
        'filename': filename,
        'image': f"/cards/{folder}/{filename}",
        'title': title,
        'description': description,
        'rawLines': lines
    })

print(f"Processed {len(processed)} cards.")
with open('cards_initial.json', 'w', encoding='utf-8') as f:
    json.dump(processed, f, ensure_ascii=False, indent=2)

# Check cards with empty or short titles
issues = [c for c in processed if len(c['title']) < 3]
print(f"Cards with title length < 3: {len(issues)}")
for iss in issues:
    print(f"  Issue: {iss['folder']} - {iss['filename']} -> lines: {iss['rawLines']}")
