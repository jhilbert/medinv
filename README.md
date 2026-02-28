# MedInv

Mobile-first Medikamenten-Inventur mit Cloudflare:

- Felder: `name`, `manufacturer`, `activeIngredient`, `expiryDate`
- 2 Erfassungswege:
  - Barcode-Scan per Kamera (empfohlen, iPhone)
  - manuelle Eingabe und Foto/OCR als Fallback
- Loeschen von Eintraegen
- Kein Login (jeder mit Link kann zugreifen)
- PWA faehig (installierbar auf Mobilgeraeten)

## Stack

- Frontend: Vanilla HTML/CSS/JS (PWA + Service Worker)
- OCR: Tesseract.js im Browser
- Barcode-Scan: html5-qrcode (DataMatrix, EAN, UPC, Code128)
- Backend: Cloudflare Worker (`src/worker.js`)
- Datenbank: Cloudflare D1 (`medications` Tabelle)

## 1) Voraussetzungen

- Node.js 20+
- Cloudflare Account
- Wrangler CLI (wird ueber `npm install` installiert)

## 2) Lokales Setup

```bash
npm install
```

## 3) D1 Datenbank erstellen

```bash
npx wrangler d1 create medinv
```

Die Ausgabe enthaelt `database_id`. Diese ID in `wrangler.toml` eintragen:

```toml
[[d1_databases]]
binding = "medinv"
database_name = "medinv"
database_id = "HIER_DEINE_D1_ID"
migrations_dir = "migrations"
```

## 4) Migration anwenden

Lokal:

```bash
npm run db:migrate
```

Remote (Cloudflare):

```bash
npm run db:migrate:remote
```

Hinweis: Fuer Barcode-Unterstuetzung wird auch `0002_barcode_support.sql` ausgefuehrt.

## 5) Lokal starten

```bash
npm run dev
```

Dann im Browser oeffnen. Auf Mobilgeraeten kann das Kamera-Input direkt genutzt werden.

## 6) Deploy

```bash
npm run deploy
```

Nach dem Deploy ist die App ohne Login oeffentlich ueber die Worker-URL erreichbar.

## API Endpunkte

- `GET /api/medications` - Liste
- `POST /api/medications` - Eintrag erstellen
- `DELETE /api/medications/:id` - Eintrag loeschen
- `GET /api/barcode-lookup?code=...` - Produktdaten fuer Barcode finden
