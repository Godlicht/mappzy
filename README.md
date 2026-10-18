# mappzy

Interaktywne mapy znajdziek z gier. Pierwsza obsługiwana gra: **Elden Ring** (Ziemie Pomiędzy, Podziemia, Królestwo Cienia).

To w pełni statyczna strona — bez serwera i bazy danych — więc można ją opublikować na darmowym hostingu (GitHub Pages, Netlify, Cloudflare Pages, Vercel…).

## Funkcje

- Mapa z płynnym przybliżaniem i przesuwaniem (Leaflet, znaczniki rysowane na canvasie — tysiące punktów bez spadku płynności; test: `?stress=20000` w adresie).
- Znaczniki z kształtem i kolorem kategorii, panel szczegółów (nazwa, kategoria, region, opis, wskazówki, źródło, link bezpośredni).
- Oznaczanie znalezionych obiektów: przycisk, klawisz `F` albo prawy klik na znaczniku. Znalezione są wyszarzone z ptaszkiem.
- Filtry kategorii (pojedynczo i grupami), widok „wszystkie / do zdobycia / znalezione”.
- Wyszukiwarka (`/`) po nazwie, regionie, opisie, kategorii i tagach — bez znaczenia, czy wpiszesz polskie znaki.
- Liczniki postępu: kategorie, bieżąca mapa, cała gra.
- Postęp zapisywany w `localStorage` (osobno dla każdej gry). Na inne urządzenie przenosisz go eksportem/importem pliku — wpisy mają znaczniki czasu, więc import łączy stany zamiast nadpisywać.
- Import danych w przeglądarce (JSON / GeoJSON / CSV) z raportem błędów, edytor znaczników (dodawanie, poprawianie, przenoszenie) i eksport.
- Ciemny interfejs, responsywny (wysuwany panel i panel szczegółów od dołu na telefonie), obsługa klawiatury i czytników ekranu.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testy jednostkowe
npm run build      # statyczna strona w dist/
npm run preview    # podgląd zbudowanej wersji
```

## Publikacja

`dist/` to zwykłe pliki statyczne (ścieżki względne, routing w `#` adresu), więc działają z dowolnego katalogu.

- **GitHub Pages**: w ustawieniach repozytorium wybierz *Settings → Pages → Source: GitHub Actions*. Workflow `.github/workflows/deploy.yml` buduje i publikuje stronę po każdym pushu na `main`.
- **Netlify / Cloudflare Pages / Vercel**: polecenie budowania `npm run build`, katalog publikacji `dist`.

## Dodawanie gry

Każda gra to katalog w `public/games/<id>/`:

```
public/games/index.json            lista gier
public/games/<id>/game.json        manifest: kategorie, mapy, nota prawna
public/games/<id>/data/*.json      lokalizacje
public/games/<id>/maps/<map>/tiles kafelki mapy (opcjonalnie)
```

Wystarczy dopisać grę do `index.json` i utworzyć jej `game.json` — kod aplikacji się nie zmienia. Mapa w manifeście:

```json
{
  "id": "lands-between",
  "name": "Ziemie Pomiędzy",
  "width": 8192,
  "height": 8192,
  "tiles": { "url": "maps/lands-between/tiles/{z}/{y}/{x}.webp", "maxNativeZoom": 5 },
  "locations": ["data/lands-between.json"],
  "demoLocations": ["data/demo/lands-between.json"],
  "labels": [{ "name": "Limgrave", "x": 3650, "y": 6150, "level": 1 }]
}
```

Bez `tiles` i `image` wyświetlana jest zastępcza mapa z siatką współrzędnych. Dane z `demoLocations` pokazują się tylko wtedy, gdy dla mapy nie ma prawdziwych danych.

## Format danych

Współrzędne to **piksele pełnego obrazu mapy** (x w prawo, y w dół, 0,0 = lewy górny róg), niezależne od kafelków i poziomu przybliżenia.

```json
{
  "format": "mappzy-locations@1",
  "gameId": "elden-ring",
  "mapId": "lands-between",
  "meta": { "source": "https://…", "license": "CC BY-SA 4.0" },
  "locations": [
    {
      "id": "lb-boss-margit",
      "category": "boss",
      "name": "Margit, Upadły Omen",
      "x": 3350, "y": 5600,
      "region": "Stormhill",
      "description": "…",
      "hints": "…",
      "tags": ["remembrance"],
      "source": "https://…"
    }
  ]
}
```

`id` musi być stałe — postęp graczy jest zapisywany właśnie pod nim.

Importowane mogą być też: zwykła tablica JSON, GeoJSON (punkty, `coordinates: [x, y]`) i CSV z nagłówkiem (`id, map, category, name, x, y, description, hints, region, tags, source`; separator `,` lub `;`).

### Narzędzia

```bash
# CSV/GeoJSON/JSON → format mappzy, walidacja i dopisanie pliku do manifestu
npm run convert -- --game elden-ring --map lands-between --input dane.csv --register \
  --license "CC BY-SA 4.0" --source "https://…" [--flip-y] [--scale 0.5] [--aliases aliasy.json]

# sprawdzenie wszystkich manifestów i plików danych (uruchamiane też w CI)
npm run validate

# pocięcie dużego obrazu mapy na kafelki i wpisanie ich do manifestu
npm run tiles -- --game elden-ring --map lands-between --input mapa.png
```

`--aliases` to plik JSON mapujący obce nazwy kategorii na id z manifestu, np. `{ "Site of Grace": "grace" }`.

## Prawa do materiałów

- Repozytorium **nie zawiera** oryginalnych grafik ani danych z gry. Dołączone dane demonstracyjne mają przybliżone pozycje i są wyraźnie oznaczone.
- Wszystko w `public/` jest publikowane razem ze stroną. Kafelki z `npm run tiles` i pliki danych dodawaj tylko wtedy, gdy masz prawo je rozpowszechniać (własna grafika, licencja zgodna z użyciem). Pole `meta.license` dokumentuje licencję źródła.
- Do prywatnego użytku możesz wczytać obraz mapy (np. złożony ze zrzutów ekranu z własnej kopii gry) bezpośrednio w przeglądarce: *Dane → Obraz mapy*. Zostaje on tylko na Twoim urządzeniu (IndexedDB) i nie trafia na serwer.
- ELDEN RING™ & © BANDAI NAMCO Entertainment Inc. / FromSoftware, Inc. To projekt fanowski, niezwiązany z wydawcą.
