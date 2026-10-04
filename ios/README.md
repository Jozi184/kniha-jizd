# Kniha jízd pro iPhone — první prototyp

Nativní SwiftUI / Core Location záznam GPS s podporou běhu na pozadí. Minimum iOS 16. Bez externích Swift balíčků, placených služeb a vložených API klíčů.

## Spuštění na Macu

1. Stáhni tento GitHub repozitář (Code → Download ZIP), rozbal a otevři `ios/KnihaJizd.xcodeproj`.
2. Xcode → Settings → Accounts → přidej vlastní Apple účet.
3. V projektu vyber target KnihaJizd → Signing & Capabilities → Team → svůj Personal Team. Případně uprav Bundle Identifier na jedinečný.
4. Připoj iPhone kabelem, potvrď důvěru počítači a zapni na telefonu Developer Mode, pokud si ho Xcode vyžádá.
5. Vyber iPhone jako cílové zařízení a spusť Run. Povol polohu a zapni Přesnou polohu.
6. Zahaj jízdu nativním tlačítkem. Po ukončení otevři kontrolu a uložení; v historii se přihlas svým ChatGPT účtem, pokud bude požadováno.

Personal Team je bezplatný; instalace má omezenou platnost a je potřeba ji obnovovat přes Xcode. GPS testuj jako spolujezdec nebo ovládej jen při stání.

## Co prototyp dělá

- Core Location běží mimo webovou stránku, s background location capability a viditelným indikátorem.
- Přijímá polohy s přesností do 60 m, ignoruje kroky pod 3 m a rychlost nad 220 km/h. Mezery delší než 30 s nespojuje do naměřené vzdálenosti.
- Rozpracovanou trasu ukládá atomicky do zařízení po každé použitelné poloze. Po pádu či novém spuštění nabídne zachráněnou jízdu ke kontrole; nedopočítává chybějící pohyb.
- Po ukončení nabídne uložení nebo potvrzené zahození. Webový formulář přebírá trasu, kilometry a čas; mapy, místa, tachometr a export zůstávají v současné webové aplikaci.
- Lokální záznam smaže až po potvrzeném úspěchu serverového uložení. `nativeRideId` omezuje opakované vložení po obnově stránky.

## Otevřené ověření

Projekt zatím nebyl zkompilován v Xcode ani otestován na iPhonu. Přihlášení přes ChatGPT ve WKWebView není ověřené: Safari a aplikace mají oddělené cookies a poskytovatel může vložený prohlížeč odmítnout. Pokud se přihlášení nezdaří, lokální GPS jízda zůstává zachována; bude potřeba doplnit podporovaný nativní přihlašovací tok. Není použit žádný servisní token ani náhrada identity uživatele.

Webový most je prototyp navázaný na současné funkce webu. Při změně formuláře jej uprav společně s webem. Zahození ve webu ponechá nativní kopii; pro úplné odstranění použij nativní tlačítko Zahodit.

Po násilném ukončení aplikace uživatelem nebo po restartu telefonu iOS nezaručuje pokračování měření. Background test musí ověřit zamčení telefonu, návrat do aplikace, výpadek sítě, zamítnutí oprávnění a opakované uložení.
