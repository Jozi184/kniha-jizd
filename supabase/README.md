# Kniha jízd – vlastní účty

Web: https://jozi184.github.io/kniha-jizd/
Databáze: projekt kniha-jizd (njohgxfvntmjzivkwfyv), Free, Frankfurt.

## Nasazení

`schema.sql` popisuje nasazenou databázi a RPC. Každý uživatel čte a mění pouze vlastní řádek; anonymní klient nemá přístup. Revize zabrání přepsání změn z druhého zařízení. Web obsahuje pouze veřejný publishable klíč.

`ride-maps.ts` je šablona nasazené Edge Function. Nastav MAPY_API_KEY jako serverové tajemství před novým nasazením; placeholder není skutečný klíč. Funkce ověřuje uživatele, omezuje parametry a nezpřístupňuje klíč prohlížeči. Aktuální nasazená funkce má stávající klíč na serveru.

Supabase JS 2.102.0 je bundlovaný v `vendor/`; původní npm lockfile je přiložen.

## E-mail

Potvrzení e-mailu je zapnuté. Výchozí e-mailová služba Supabase je určena pro testování a dovoluje odesílání členům organizace. Pro osobní test použij e-mail vlastníka projektu. Pro jiné adresy nastav vlastní SMTP.

V Supabase → Authentication → URL Configuration nastav Site URL na https://jozi184.github.io/kniha-jizd/ a povolené redirecty na tuto adresu a https://jozi184.github.io/kniha-jizd/index.html. Tato konfigurace nemohla být změněna dostupným konektorem. Do té doby lze potvrzovací či obnovovací odkaz z e-mailu zkopírovat do pole v přihlášení; aplikace ověří token bez přesměrování.

Neukládej service-role klíč ani Mapy klíč do webu nebo GitHubu.

## Ověření

SQL test v rollback transakci ověřil uložení, revize, validaci tras a izolaci dvou účtů. Bezpečnostní poradce nehlásí problémy. JavaScript a nativní most mají lokální kontroly. Kompletní přihlášení s doručením e-mailu a sestavení v Xcode je potřeba ověřit na účtu vlastníka a telefonu.
