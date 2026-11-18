# BUNKER — suport pentru jocul fizic

Platformă locală în limba română pentru moderator și televizor, sincronizată prin Socket.IO. Cărțile și votarea secretă rămân fizice; moderatorul introduce dezvăluirile și rezultatele în aplicație.

## Pornire

Necesită Node.js 22 sau mai nou. Pe Windows, deschide `start.bat`: acesta pornește serverul și apoi browserul. Alternativ:

```powershell
npm install
npm start
```

- Moderator: `http://localhost:3000/`
- TV: `http://localhost:3000/tv`
- Regulament: `http://localhost:3000/rules`

Pentru un televizor sau o tabletă din aceeași rețea, folosește IP-ul afișat în terminal sau în fila de conectare TV. Codul QR deschide direct ecranul TV.

Moderatorul se conectează automat pe calculatorul gazdă prin `localhost` sau `127.0.0.1`. Pentru acces de moderator din rețea, folosește PIN-ul generat la pornire și afișat în terminal. Ecranele TV au acces doar pentru vizualizare. Fiecare sesiune de moderator expiră după 12 ore. Pe gazdă, fila **Conectare TV** permite revocarea celorlalte sesiuni.

Poți configura portul și un PIN propriu înainte de pornire:

```powershell
$env:PORT = '3000'
$env:BUNKER_MODERATOR_PIN = '654321'
npm start
```

## Desfășurarea partidei

1. **Configurare:** alege 4–22 de jucători, numele, scopul, modul și planul exilărilor. Configurarea unei partide începute păstrează cărțile, runda și progresul. Adaugă sau șterge jucători prin butoanele listei; identitatea lor rămâne stabilă chiar dacă numerotarea locurilor se schimbă.
2. **Dezvăluire:** selectează cartea fizică din categoria potrivită. Căutarea funcționează și fără diacritice. Dacă lipsește un cartonaș din catalog, folosește **Creează cartonaș**, completează titlul și, opțional, descrierea, apoi apasă **Salvează și folosește**. Cartonașul este aplicat imediat și rămâne în catalog pentru alte partide. Cărțile de buncăr ascunse nu sunt trimise televizorului.
3. **Discurs și discuție:** pornește cronometrul, pune pauză sau adaugă timp. Discuția de grup apare pe TV chiar fără un vorbitor selectat. Cronometrul folosește un termen-limită pentru a rezista întârzierilor și repornirii serverului.
4. **Votare:** pornește un vot, introdu numărul de voturi cu `+` și `−`, apoi apasă **Închide votarea**. TV-ul afișează în direct numele candidaților și totalurile. Butonul **Arată votul pe TV** deschide o vedere dedicată, iar ștergerea voturilor deja introduse cere confirmare. Exilarea se confirmă numai după închiderea rezultatului.
5. **Balotaj:** la egalitate, apasă butonul de balotaj. După apărare, pornește votul de departajare; participă doar candidații aflați la egalitate. Fiecare exilare golește voturile, inclusiv în rundele cu mai multe exilări.
6. **Epilog:** aplicația verifică numărul supraviețuitorilor față de capacitatea buncărului. Aptitudinea pentru reproducere necesită metadate explicite ale cărților; catalogul actual nu le conține, deci moderatorul verifică această condiție pe cărțile fizice. Amenințările sunt disponibile în epilogul modului Istoria Supraviețuirii.

Avansarea cu un plan de exilări incomplet și exilările suplimentare cer confirmarea moderatorului. Acest lucru permite aplicarea condițiilor speciale și a regulilor de casă. Pentru 17–22 de jucători, planul automat este o extensie a tabelului pentru 4–16, nu un tabel oficial suplimentar.

**Anulează** restaurează ultima dintre cel mult 30 de acțiuni păstrate în memorie și pune cronometrul pe pauză. **Joc Nou / Reset** arhivează partida înainte de a crea una nouă, cu același număr de jucători. Resetarea se oprește dacă arhivarea nu reușește.

## Televizor și conexiune

Catastrofa și modulele de buncăr afișate pe tot ecranul rămân pe TV până când moderatorul apasă **Oprește afișarea TV**, în bara de sus a consolei. Nu se închid automat, prin click sau Escape și sunt restaurate după reîncărcarea TV-ului. Afișarea unei alte cărți le înlocuiește; animația de exilare poate apărea temporar deasupra lor. Celelalte cartonașe păstrează afișarea temporară de 12 secunde.

Selectorul TV oferă afișare **Automată**, **Toți jucătorii** și pagini de 2, 4, 6, 8 sau 12 dosare. Numărul se reduce în funcție de spațiul disponibil numai în modul automat; alegerea manuală este respectată și păstrată după reîncărcare. Modul „Toți jucătorii” încadrează toate dosarele pe ecran, cu titluri compacte și fără schimbarea paginii. Pentru citirea titlurilor lungi de la distanță, folosește pagini cu mai puține dosare. Schimbarea automată a paginilor are loc la 12 secunde și se oprește când este selectat un vorbitor.

Butonul **Toate dosarele pe tot ecranul** afișează pe aceeași pagină dosarele tuturor jucătorilor, cu toate categoriile și titlurile dezvăluite. Vederea se poate derula când textul ocupă mai mult decât încape pe ecran. Folosește **Revino la afișarea normală** pentru a reveni la paginarea anterioară.

Din consola moderatorului, în fila **Conectare TV**, poți afișa toate dosarele sau pagini de 4 ori 6 dosare și poți schimba pagina pe televizoarele conectate. **Control de la TV** revine la preferințele fiecărui televizor. În timpul numărătorii și al rezultatului, voturile au prioritate peste cartonașele mărite.

TV-ul are secvențe cinematice pentru runde, votare, rezultate, revenirea în joc, dezvăluirea buncărului, catastrofe, amenințări și epilog. Click pe secvență sau Escape o închide. Animația de exilare are prioritate. Butonul **Activați sunetul** permite efectele în browser; controlul **Volum** păstrează preferința local. Efectele industriale durează până la 8 secunde și combină sirene, impacturi metalice, comunicații radio și porți hidraulice. Dezactivarea sunetului oprește imediat toate straturile, inclusiv cele programate; un nou efect major îl înlocuiește pe cel precedent.

Consola indică numărul real de televizoare conectate. La deconectare, comenzile nu sunt puse în așteptare pentru a fi executate mai târziu: interfața anunță că trebuie retrimise după reconectare. Starea se reîncarcă automat când conexiunea revine.

## Salvare și istoric

Starea se salvează în `local-data/gamestate.json` printr-un fișier temporar și înlocuire atomică. Copia `.bak` se rotește după validarea stării anterioare. Serverul încearcă recuperarea din backup dacă fișierul principal nu poate fi citit sau validat. Dacă ambele copii sunt invalide, serverul păstrează fișierele pentru recuperare și oprește pornirea.

Arhivele se află în `local-data/history/`, cu index în `local-data/games_history.json`. **Istoric** permite consultarea listei și descărcarea fiecărei partide în JSON. Istoricul și resetarea prin API necesită acces de moderator. La prima pornire cu setările implicite, serverul copiază starea, arhivele și catalogul personalizat din vechiul director `data/` în `local-data/`. Git ignoră datele partidelor din ambele directoare.

La migrarea unei stări vechi, un cronometru pornit fără termen-limită este restaurat pe pauză. Un mesaj în consolă semnalează erorile de salvare pe disc.

## Dezvoltare și verificare

```powershell
npm run dev
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

Testele serverului și browserului folosesc directoare temporare, partide sintetice și porturi separate.

- `lib/game.js`: validarea și aplicarea comenzilor, migrarea stării, cronometrul.
- `lib/storage.js`: salvare atomică și recuperare.
- `public/js/game-rules.js`: reguli partajate între server și browser.
- `public/js/client.js`: autentificare, reconectare și confirmarea comenzilor.
- `public/js/moderator.js` și `public/js/tv.js`: interfețele.
- `data/cards.json`: 300 de cărți și 11 amenințări; imaginile provin din `Jocul_Bunker/Bunker_ro` și `public/cards_threats`.

Pentru reindexarea catalogului: `python scripts/build_cards_db.py`. Proprietățile opționale `gameTraits.sex`, `gameTraits.fertile` și `gameTraits.preventsReproduction` trebuie completate numai pe baza regulilor și a textului verificat al cărților.

`BUNKER_DATA_DIR` permite selectarea unui alt director pentru stări, arhive și catalogul personalizat `custom_cards.json`. Catalogul de bază este citit din proiect.
