# Kniha jízd

Jednoduchá PWA kniha jízd.

## Soukromí
Data o jízdách, GPS bodech a fotografie tachometru se ukládají pouze lokálně v prohlížeči zařízení pomocí IndexedDB. Aplikace nemá backend a tato data se neposílají do GitHub repozitáře.

## Funkce
- ruční zadání jízdy
- GPS záznam vzdálenosti
- fotografie tachometru na začátku a konci
- lokální historie jízd
- export dat do JSON
- offline režim přes Service Worker

## GitHub Pages
Po zapnutí GitHub Pages pro větev `main` a kořenovou složku `/` poběží aplikace jako PWA.

> Poznámka: iOS může omezovat geolokaci na pozadí.