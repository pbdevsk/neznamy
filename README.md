# Register neznámych vlastníkov

Lokálna aplikácia na import a vyhľadávanie v CSV súboroch so zoznamami neznámych vlastníkov. Podporuje rýchle vyhľadávanie nad miliónmi záznamov s pokročilým tagovacím systémom a facetovaným vyhľadávaním.

## Vlastnosti

- **Import CSV súborov** s flexibilným mapovaním stĺpcov
- **Rýchle vyhľadávanie** pomocí PostgreSQL trigram indexov a fulltext search
- **Pokročilé tagovanie** s automatickou detekciou pohlaviat, rodných priezvisk, statusu
- **Facetované vyhľadávanie** pre najčastejšie krstné mená, rodné priezviská a status
- **Responsívny dizajn** s dark/light mode
- **Keyset pagination** pre rýchle prechádzanie veľkých výsledkov

## Technológie

- **Frontend**: Next.js 14, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes, PostgreSQL
- **Databáza**: PostgreSQL 15 s pg_trgm extension
- **UI komponenty**: Lucide React ikony, custom komponenty

## Inštalácia a spustenie

### 1. Klónovanie a dependencies

```bash
git clone <repository>
cd neznamy
npm install
```

### 2. Spustenie PostgreSQL databázy

```bash
# Spustenie PostgreSQL cez Docker
npm run db:up

# Počkajte cca 10 sekúnd na inicializáciu databázy
```

### 3. Spustenie aplikácie

```bash
# Development server (port 3001)
npm run dev

# Produkčný build
npm run build
npm start
```

Aplikácia bude dostupná na http://localhost:3001

### 4. Zastavenie databázy

```bash
npm run db:down
```

## Použitie

### 1. Import CSV súborov

1. Kliknite na tlačidlo **"Import CSV"** v hornom paneli
2. Vyberte CSV súbor s údajmi o neznámych vlastníkoch
3. Nastavte oddeľovač stĺpcov (čiarka, bodkočiarka, tabulátor)
4. Mapujte stĺpce z CSV na povinné polia:
   - **Katastrálne územie**
   - **Poradie** 
   - **LV** (číslo listu vlastníctva)
   - **Meno neznámeho vlastníka**
5. Kliknite "Importovať"

### 2. Vyhľadávanie

**Textové vyhľadávanie:**
- Píšte bez diakritiky (automaticky normalizované)
- Príklady: "novotna", "petrilak vasil", "ema r. blaskova"

**Režimy vyhľadávania:**
- **Obsahuje**: Trigram similarity search (tolerantný na preklepy)
- **Presná zhoda**: Tokenová presná zhoda všetkých slov
- **Začína na**: Prefix search

**Filtre:**
- **Katastrálne územie**: Dropdown so všetkými územiami z DB
- **LV**: Číslo listu vlastníctva

### 3. Výsledky a tagy

Každý výsledok zobrazuje:
- **Originálne meno** vlastníka
- **Automatické tagy** s ikonami:
  - 🏷️ **token**: Voľné tokeny z mena (neisté ⚠️)
  - 💜 **rodné**: Rodné priezvisko (r. Nováková)
  - 💍 **manžel/ka**: Manžel/manželka (ž./m. Novák)
  - 👶 **status**: Maloletý/á
  - 👩👨👤 **pohlavie**: Žena/Muž/Neisté (heuristické ⚠️)
  - 📝 **pozn.**: Obsah zátvoriek (neisté ⚠️)

**Interakcia s tagmi:**
- Klik na akýkoľvek tag pridá jeho hodnotu do vyhľadávania

### 4. Facety (pravý panel)

Automaticky generované zoznamy s počtami:
- **Najčastejšie krstné mená** z aktívnych výsledkov
- **Rodné priezviská** (hodnoty po "r.")
- **Status** (maloletý/á)

Klik na facet pridá hodnotu do vyhľadávania.

## Štruktúra databázy

```sql
-- Importované súbory
sources (id, name, imported_at)

-- Vlastníci
owners (
  id, source_id, 
  katastralne_uzemie, poradie, lv,
  meno_raw, meno_clean, tsv,
  gender, has_minor_flag
)

-- Tagy extrahované z mien
owner_tags (owner_id, key, value, uncertain)
```

### Indexy pre výkon

- **Trigram index** na `meno_clean` pre fuzzy search
- **Fulltext index** na `tsv` pre tokenové vyhľadávanie
- **Kompozitné indexy** na katastrálne_uzemie, lv, poradie
- **Trigram index** na `owner_tags.value` pre rýchle facety

## Normalizácia a tagovanie

### Normalizácia textu
1. **Odstránenie diakritiky**: á→a, ž→z, č→c, atď.
2. **Lowercase transformation**
3. **Odstránenie zátvoriek a markerov** r./ž./m.
4. **Odstránenie slov** "maloletý/á"

### Automatické tagovanie
- **Tokeny**: Všetky slová mimo zátvoriek a markerov
- **Rodné priezvisko**: Text po "r."
- **Manžel/ka**: Text po "ž." alebo "m."
- **Status**: Detekcia "maloletý/á"
- **Pohlavie**: Heuristika na základe koncoviek a slov
- **Poznámka**: Obsah zátvoriek

## Výkonnostné ciele

- **Import**: 1M riadkov za 5-10 minút (SSD)
- **Vyhľadávanie**: 
  - Substring (trigram): ≤ 150ms
  - Fulltext: ≤ 80ms
  - Facety: ≤ 120ms
- **Kapacita**: Optimalizované pre 4-5M+ záznamov

## API Endpointy

```
POST /api/import - Import CSV súboru
GET  /api/search - Vyhľadávanie s filtrami a paginatiou
GET  /api/facets - Načítanie facetov pre aktuálne filtre
GET  /api/sources - Zoznam importovaných súborov
GET  /api/territories - Zoznam katastrálnych území
```

## Príklad CSV štruktúry

```csv
"KATASTRÁLNE ÚZEMIE","PORADOVÉ ČÍSLO","LV","MENO NEZNÁMEHO VLASTNÍKA"
"Bratislava","1","1234","Jana Nováková r. Svobodová"
"Košice","2","5678","Ján Novák ž. Mária (maloletý)"
"Prešov","3","9012","Eva Krásna (poznámka v zátvorkách)"
```

## Dark/Light Mode

Aplikácia podporuje prepínanie medzi svetlou a tmavou témou. Nastavenie sa ukladá do localStorage a je dostupné cez ikonu ☀️/🌙 v pravom hornom rohu.

## Troubleshooting

### Databáza sa nespustí
```bash
# Vyčistenie Docker volumes
npm run db:down
docker system prune -f
npm run db:up
```

### Chyby pri importe
- Skontrolujte kódovanie súboru (musí byť UTF-8)
- Overte správnosť oddeľovača stĺpcov
- Uistite sa, že mapovanie stĺpcov je kompletné

### Pomalé vyhľadávanie
- Restart databázy pre aplikovanie indexov
- Pre veľké databázy (>5M) zvážte zvýšenie `shared_buffers` v PostgreSQL

## Licencia

MIT