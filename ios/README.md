# Kniha jízd pro iPhone

Nativní Core Location záznam GPS pod posledním původním PWA rozhraním. Stejné barvy, formuláře, historie, mapy, export a grafitová/limetková ikona auta. Minimum iOS 17, bez externích Swift balíčků a vložených API klíčů.

## První spuštění

1. Stáhni repozitář nebo jej naklonuj v Xcode a otevři `ios/KnihaJizd.xcodeproj`.
2. Xcode → Settings → Accounts → přidej vlastní Apple účet.
3. U obou targetů KnihaJizd a RideWidgets → Signing & Capabilities → Team → svůj Personal Team. Pokud měníš Bundle Identifier aplikace, změň i identifikátor widgetu na stejný základ + `.widgets`.
4. Připoj a odemkni iPhone, potvrď důvěru počítači, zapni Developer Mode podle výzvy Xcode.
5. Vyber iPhone jako cílové zařízení a spusť Run. Na iPhonu případně důvěřuj svému vývojářskému účtu v Nastavení → Obecné → VPN a správa zařízení.
6. Aplikace otevře současné PWA rozhraní. Vytvoř účet e-mailem a heslem a potvrď e-mail. Stejný účet použij na PC na https://jozi184.github.io/kniha-jizd/. Přihlášení přes ChatGPT není potřeba.
7. Zahaj jízdu původním tlačítkem Zahájit GPS záznam; povol polohu a Přesnou polohu. Po ukončení zkontroluj kilometry a ulož, nebo potvrď zahození. Tlačítko Zpět na seznam ponechá záznam ke kontrole a dovolí zahájit další jízdu.

## Aktualizace již naklonované verze

V Xcode použij Integrate → Pull (ve starších verzích Source Control → Pull), ponech svou hodnotu Team a Bundle Identifier a znovu spusť Run na připojeném iPhonu. Aktualizuj aplikaci přes Xcode; nemaž ji, pokud v ní máš neuloženou jízdu.

## Rozhraní a záznam

- Celé rozhraní se načítá z webové aplikace s vlastními účty a databází Supabase; změny designu a běžných webových funkcí se projeví bez nové instalace.
- Bundlovaný NativeBridge.js propojuje původní tlačítka s Core Location. Start/stop nepoužívá browserovou GPS.
- Core Location ukládá celou rozpracovanou trasu atomicky do zařízení po každé použitelné poloze. Při návratu ze zamčené obrazovky předává úplný stav, nespoléhá na běh JavaScriptu na pozadí.
- Každý ukončený záznam se přidá do trvalé místní fronty „Čeká na kontrolu“. Další jízda předchozí záznamy nepřepisuje. Zkontrolovat lze každý záznam zvlášť ve stejném formuláři jako PWA. Lokální kopie se odstraní až po potvrzeném serverovém uložení nebo explicitním zahození. NativeRideId brání opakovanému vložení při obnovení stránky.
- Ruční zadání včetně fotografií, tachometr s desetinnou čárkou, historie, mazání, mapy a automatické názvy míst používají původní webový kód. CSV export otevírá systémovou nabídku sdílení iOS.
- Ikona AppIcon používá plné limetkové auto z prvního nativního návrhu na grafitovém pozadí, ve velikosti 1024 × 1024 bez průhlednosti. Zdroj je Design/AppIcon.svg. Ikona je přiřazena v obou konfiguracích sestavení.

## GPS a omezení

Nativní most předává přesnost polohy a čas poslední přijaté polohy. Slabý signál a výpadek nových poloh se zobrazí ve stavu GPS. Rychlost z Core Location se převádí z m/s na km/h; nedostupná rychlost nebo poloha starší než 30 sekund se zobrazuje jako pomlčka. Skutečná naměřená nula zůstává nulou.


Location updates je jediný potřebný Background Mode. Core Location přijímá polohy s přesností do 60 m, skládá drobné posuny až do vzdálenosti alespoň 3 m od posledního započteného bodu a odmítá skoky odpovídající rychlosti 220 km/h nebo vyšší. Mezery delší než 30 s nespojuje do naměřené vzdálenosti. Po ukončení procesu převede zachráněnou rozpracovanou jízdu do fronty ke kontrole; chybějící pohyb nedopočítává.

Bezplatný Personal Team vyžaduje pravidelné obnovení instalace přes Xcode. Po násilném ukončení aplikace uživatelem nebo restartu telefonu iOS nezaručuje pokračování záznamu. Testuj zamčení, návrat do aplikace, výpadek sítě, oprávnění, uložení a zahození. Aplikaci při řízení neovládej.

## Upozornění Xcode

Recorder nepoužívá blokující `locationServicesEnabled()` na hlavním vlákně; oprávnění sleduje přes `authorizationStatus` a delegate callback. Správce GPS vzniká na MainActor a Core Location volá jeho delegate na stejném hlavním run loopu. Conformance `@preconcurrency` proto používá runtime kontrolu izolace pro Objective-C protokol. Xcode s kompilátorem Swift 6 nebo novějším podporuje tuto anotaci i v režimu Swift 5.

Zapnuté jsou weak references a doporučené základní compiler warnings pro Debug i Release. Minimum iOS 17 je úmyslné; doporučení Xcode zvýšit deployment target se nemusí přijmout.

## Stav ověření

JavaScriptový most má testy pro start/stop, předání úplné trasy, zachování oprav, neúspěšné a úspěšné uložení, potvrzené zahození, zabránění duplicitám, CSV a kontrolu původu stránky. Plist a odkazy/resources v Xcode projektu jsou kontrolované. Workflow iOS build ověřuje nesignované sestavení aplikace i widgetu na macOS a JavaScriptové regrese. Oprávnění, podpis Personal Team a skutečné spuštění GPS ze zamčeného iPhonu vyžadují test na telefonu v Xcode.

Přihlášení e-mailem a heslem ukládá relaci do WKWebView. Safari a nativní aplikace mají vlastní relace; přihlas se v nich stejným účtem. Databáze chrání jízdy podle uživatele pomocí RLS. Souběžné změny mají kontrolu revize, aby druhé zařízení nepřepsalo novější historii. Pro načtení historie a uložení je potřeba síť; během již zahájené jízdy ukládá nativní GPS lokálně i bez sítě. Při neúspěšném uložení zůstává jízda v zařízení.

## Spuštění ze zamčené obrazovky (build 6)

1. Po aktualizaci přes Pull vyber Personal Team u **obou** targetů KnihaJizd a RideWidgets. Spouštěj schéma KnihaJizd na svém iPhonu. Vyžaduje Xcode 26 nebo novější; ovládací prvky a widget v této verzi vyžadují iOS 18 nebo novější.
2. Otevři aplikaci a přihlas se. Rozbal „Spouštění ze zamčené obrazovky“ a stiskni „Povolit spouštění“. Povol polohu **Vždy** a **Přesnou polohu**. Když iOS nenabídne Vždy, nastav to v Nastavení → Aplikace → Kniha jízd → Poloha. Povol také Živé aktivity.
3. Podrž zamčenou obrazovku → Přizpůsobit → Zamčená obrazovka → Přidat widgety → Kniha jízd → Zahájit GPS jízdu. Alternativně nahraď jeden spodní ovládací prvek tlačítkem Zahájit jízdu, nebo jej přidej do Ovládacího centra.
4. Tlačítko používá LiveActivityIntent v procesu aplikace s explicitním režimem na pozadí a povoleným spuštěním při zamčení. Rozhraní se při akci úmyslně neotevírá. GPS vlastní stále stejný Recorder, ne widgetová extension. Neočekávané provedení v extension vrací chybu a nezahajuje neviditelný záznam.
5. Na lockscreen a v Dynamic Island se objeví měřená vzdálenost, doba a tlačítko Ukončit jízdu. Ukončení zapíše jízdu do fronty v telefonu. Další jízdu lze spustit bez předchozího schvalování.
6. Po otevření aplikace je každá jízda samostatně v „Čeká na kontrolu“. Po uložení do účtu se odstraní místní kopie; při chybě sítě nebo revize zůstane. Zahození vyžaduje potvrzení. Zpět na seznam zachová původní GPS záznam, nikoliv dosud neuložené úpravy formuláře.

Fronta čekajících jízd je pouze v telefonu. Na PC se synchronizuje schválená historie. Tachometr roste až po schválení; při každé kontrole se počáteční stav naváže na právě schválený tachometr, takže zahozený záznam nevytvoří mezeru. Starý soubor active-ride.json se migruje až po bezpečném zapsání nové fronty. Místní soubor obsahuje ID účtu a poslední tachometr, žádné heslo ani přístupový token. Odhlášení zablokuje systémové spouštění do dalšího přihlášení; jízdy ostatních účtů se při kontrole nezobrazují.

Ve Zkratkách jsou akce **Zahájit GPS jízdu** a **Ukončit GPS jízdu**. Lze je vybrat v osobní automatizaci pro Bluetooth/CarPlay, kterou si nastavíš na iPhonu. Tato verze sama nerozpoznává pohyb auta ani konkrétní Bluetooth zařízení. Reálný test musí ověřit také zahájení po delší nečinnosti a zamčení; úspěšné sestavení samo nepotvrzuje chování iOS na pozadí.

Používá se lokální ActivityKit bez APNs, App Groups nebo nových placených služeb. Běžné omezení sedmidenního podpisu Personal Team zůstává. Nezapínej další Background Modes.

## Přesnost vzdálenosti (build 7)

Filtr již nezahazuje jednotlivé posuny kratší než 3 m: ponechává poslední započtený bod jako kotvu a započte souhrnný posun po dosažení prahu. Čas posledního vzorku sleduje zvlášť, aby souvislé pomalé popojíždění nebylo považováno za výpadek. Slabá nebo stará poloha, výpadek delší než 30 s a nemožný rychlostní skok přeruší úsek. Chybějící vzdálenost se nedopočítává. Swift regresní testy na macOS ověřují pomalý pohyb, běžnou jízdu, zastavení, výpadky, starší body a odmítnutí skoků. Výsledek GPS se může dále lišit od tachometru; není použit plošný korekční koeficient.
