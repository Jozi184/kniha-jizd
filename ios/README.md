# Kniha jízd pro iPhone

Nativní Core Location záznam GPS pod posledním původním PWA rozhraním. Stejné barvy, formuláře, historie, mapy, export a grafitová/limetková ikona auta. Minimum iOS 16, bez externích Swift balíčků a vložených API klíčů.

## První spuštění

1. Stáhni repozitář nebo jej naklonuj v Xcode a otevři `ios/KnihaJizd.xcodeproj`.
2. Xcode → Settings → Accounts → přidej vlastní Apple účet.
3. Target KnihaJizd → Signing & Capabilities → Team → svůj Personal Team. Případně uprav Bundle Identifier na jedinečný.
4. Připoj a odemkni iPhone, potvrď důvěru počítači, zapni Developer Mode podle výzvy Xcode.
5. Vyber iPhone jako cílové zařízení a spusť Run. Na iPhonu případně důvěřuj svému vývojářskému účtu v Nastavení → Obecné → VPN a správa zařízení.
6. Aplikace otevře současné PWA rozhraní. Přihlas se svým ChatGPT účtem, pokud bude požadováno.
7. Zahaj jízdu původním tlačítkem Zahájit GPS záznam; povol polohu a Přesnou polohu. Po ukončení zkontroluj kilometry a ulož, nebo potvrď zahození.

## Aktualizace již naklonované verze

V Xcode použij Integrate → Pull (ve starších verzích Source Control → Pull), ponech svou hodnotu Team a Bundle Identifier a znovu spusť Run na připojeném iPhonu. Aktualizuj aplikaci přes Xcode; nemaž ji, pokud v ní máš neuloženou jízdu.

## Rozhraní a záznam

- Celé rozhraní se načítá z existující privátní webové aplikace; změny designu a běžných webových funkcí se projeví bez nové instalace.
- Bundlovaný NativeBridge.js propojuje původní tlačítka s Core Location. Start/stop nepoužívá browserovou GPS.
- Core Location ukládá celou rozpracovanou trasu atomicky do zařízení po každé použitelné poloze. Při návratu ze zamčené obrazovky předává úplný stav, nespoléhá na běh JavaScriptu na pozadí.
- Záznam čeká po ukončení na uložení nebo zahození ve stejném formuláři jako PWA. Lokální kopie se odstraní až po potvrzeném serverovém uložení nebo explicitním zahození. NativeRideId brání opakovanému vložení při obnovení stránky.
- Ruční zadání včetně fotografií, tachometr s desetinnou čárkou, historie, mazání, mapy a automatické názvy míst používají původní webový kód. CSV export otevírá systémovou nabídku sdílení iOS.
- Ikona AppIcon je převzata z PWA icon-graphite-512.png, převedena na požadovaných 1024 × 1024 bez průhlednosti. Ikona je přiřazena v obou konfiguracích sestavení.

## GPS a omezení

Location updates je jediný potřebný Background Mode. Core Location přijímá polohy s přesností do 60 m, ignoruje kroky pod 3 m a rychlost nad 220 km/h. Mezery delší než 30 s nespojuje do naměřené vzdálenosti. Po pádu nebo novém spuštění nabídne zachráněnou jízdu ke kontrole; chybějící pohyb nedopočítává.

Bezplatný Personal Team vyžaduje pravidelné obnovení instalace přes Xcode. Po násilném ukončení aplikace uživatelem nebo restartu telefonu iOS nezaručuje pokračování záznamu. Testuj zamčení, návrat do aplikace, výpadek sítě, oprávnění, uložení a zahození. Aplikaci při řízení neovládej.

## Stav ověření

JavaScriptový most má testy pro start/stop, předání úplné trasy, zachování oprav, neúspěšné a úspěšné uložení, potvrzené zahození, zabránění duplicitám, CSV a kontrolu původu stránky. Plist a odkazy/resources v Xcode projektu jsou kontrolované. Aktualizovanou Swift část nelze v Linuxovém prostředí zkompilovat; sestavení a test na telefonu je potřeba dokončit v Xcode.

Přihlášení přes ChatGPT ve WKWebView zůstává k ověření na telefonu. Safari a nativní aplikace mají oddělené cookies a poskytovatel může vložený prohlížeč odmítnout. Nepoužíváme servisní token jako náhradu identity. Pro načtení historie je potřeba síť a přihlášení; během již zahájené jízdy ukládá nativní GPS lokálně i bez sítě. Úpravy interních funkcí formuláře vyžadují kontrolu mostu a případně aktualizaci aplikace.
