![Creality Ender-3 Pro](/ender3_cover.png)

# Ghid Esențial

## Software Slicer
Pentru a printa un obiect la imprimanta 3D, este necesară folosirea slicerului [OrcaSlicer](https://www.orcaslicer.com/download).

La setare, slicerul se va configura cu imprimanta Creality Ender 3 Pro și filamentele pe care le vei folosi. 

Pentru a nu încărca inutil lista, recomandăm selectarea doar a următoarelor filamente:
- Generic PLA (cel mai folosit)
- Generic PETG
- Generic ABS
- Generic TPU

### Profil imprimantă OrcaSlicer
După configurare, se va descărca profilul configurat al imprimantei ([ender3pro-custom-nii3a-v1.3mf](/ender3pro-custom-nii3a-v1.3mf)), se va deschide fișierul în OrcaSlicer și se va salva profilul.

Se va folosi DOAR acest profil pentru imprimantă. Alte profile vor fi respinse în mod automat de interfața web oaspete.

### Conectare imprimantă la rețea
1. Se dă click pe icon-ul wireless
2. Se adaugă adresa URL `http://imprimanta3d.iesc-soft.org/ender3pro/`

### Alegerea setărilor de procesare
Printarea 3D NU este un proces complet automat, sistematic sau universal. Fiecare obiect 3D are propriile caracteristici și poate necesita setări diferite.

Alegerea setărilor potrivite este o competență care se formează în timp. Recomandăm vizionarea tutorialelor realizate de Maker's Muse pe YouTube: [https://www.youtube.com/watch?v=vAA0YSE2r_o&list=PLd7YwDftJv6o](https://www.youtube.com/watch?v=vAA0YSE2r_o&list=PLd7YwDftJv6o)

### Cum se folosește slicerul

După ce ai configurat setările de procesare specifice obiectului 3D:

1. Clic pe `Slice plate`
2. Clic pe `Print`
3. Clic pe `Upload and Print`
4. Autentifică-te cu contul instituțional
5. După ce ai citit regulile și ghidul esențial, clic pe `Printează`

## Cum se încarcă corect filamentul:
![Load filament example video](/load-filament-example.webm)
1. În interfața web oaspete, preîncălzește capul de printare la temperatura de printare a filamentului
2. Scoate capătul filamentului din gaura rolei și NU îi da drumul pe tot parcursul încărcării, pentru a evita încâlcirea filamentului pe rolă.
3. Taie capătul filamentului la un unghi de 45 de grade
4. Apasă clapeta extruderului și inserează capătul tăiat al filamentului în gaura de intrare a extruderului
5. Inserează suficient filament cât să se vadă capătul în tubul bowden (tubul alb)
6. În interfața web oaspete, apasă o singură dată pe macro-ul `LOAD FILAMENT`

## Cum se descarcă corect filamentul:
![Unload filament example video](/unload-filament-example.webm)
1. În interfața web oaspete, preîncălzește capul de printare la temperatura de printare a filamentului
2. După preîncălzire, apasă o singură dată pe macro-ul `UNLOAD FILAMENT`
3. Pune mâna pe filament (nu îi da drumul pe tot parcursul descărcării), apasă clapeta și scoate capătul filamentului din extruder
4. Fără să dai drumul capătului filamentului, introdu-l într-una dintre găurile rolei dedicate fixării capătului de filament.

## Avertisment
![warning-sign-W089](/warning-sign-W089.svg)
Imprimanta 3D poate efectua mișcări bruște, neașteptate și rapide. NU atinge imprimanta în timpul funcționării.

# Ghid General

## Atenție la temperaturi ridicate
Capul de printare, duza și patul încălzit pot atinge temperaturi ridicate. Nu atinge aceste componente în timpul funcționării sau imediat după terminarea printării.

## Modificări și reglaje
Nu modifica mecanic imprimanta și nu schimba setări de calibrare, firmware, conexiuni, cabluri sau componente fără acordul unui supervizor.

Reglajele fine permise din interfața web trebuie făcute cu atenție și doar atunci când sunt necesare.

## Filamente acceptate
Folosește doar filamente aprobate pentru această imprimantă.

Nu folosi filamente necunoscute, fragile, contaminate, umede sau materiale speciale fără acordul unui supervizor.

## După utilizare
După finalizarea printării, lasă zona imprimantei curată.

Îndepărtează resturile de filament, verifică dacă rola este fixată corect și asigură-te că filamentul nu este lăsat liber pe rolă.

## Printări eșuate
Dacă printarea începe să producă filament dezordonat, piesa se desprinde de pe pat sau imprimanta printează în aer, oprește printarea din interfața web.

Nu lăsa imprimanta să continue o printare evident eșuată.

## Obiecte permise
Este interzisă printarea obiectelor periculoase, ilegale, ofensatoare sau care pot deteriora imprimanta.

În caz de dubiu, cere aprobarea unui supervizor înainte de a începe printarea.

## Durata și consumul de material
Înainte de a începe printarea, verifică durata estimată și cantitatea de filament necesară în slicer.

Pentru printări foarte lungi sau consum mare de material, cere aprobarea unui supervizor.

## Disponibilitatea imprimantei
Înainte de a începe o printare, verifică dacă imprimanta este disponibilă și dacă nu există o printare programată sau în desfășurare.

Nu porni o printare nouă peste o lucrare începută de alt utilizator.

## Verificarea modelului 3D
Înainte de printare, verifică în slicer dacă modelul este poziționat corect pe pat, dacă încape în volumul imprimantei și dacă nu apar erori evidente de geometrie.

Nu porni printarea dacă modelul apare incomplet, intersectat greșit cu patul sau în afara zonei de printare.

## Suporturi și adeziune
Pentru modelele cu zone suspendate, verifică dacă sunt necesare suporturi.

Pentru piese cu suprafață mică de contact cu patul, ia în considerare folosirea unei margini de adeziune, precum `brim`, pentru a reduce riscul de desprindere.

## Alimentare și conexiuni
Nu opri PC-ul conectat la imprimantă, nu scoate cablul USB și nu deconecta imprimanta de la rețea în timpul funcționării.

Întreruperea conexiunii poate opri sau compromite printarea.

## Zona din jurul imprimantei
Nu așeza obiecte, unelte, role de filament sau alte materiale în zona de mișcare a imprimantei.

Asigură-te că patul și axele se pot mișca liber înainte de începerea printării.


# Depanare
În cazul în care nu găsești o soluție la problema ta, oprește alimentarea la imprimantă și anunță un supervizor. 

## Filamentul nu se lipește de pat (Aderanță slabă):
![Troubleshooting filament not sticking to bed video](/troubleshooting-filament-not-sticking-to-bed.webm)
- Distanța dintre duză și pat este prea mare. Cu mișcări fine, reglează offsetul axei Z în interfața web, fără ca duza să intre în patul de printare
- Curăță doar patul **rece** cu alcool izopropilic, pentru a îndepărta grăsimea și urmele de pe suprafață.

## Extruderul scoate un zgomot de "clic" (sare pași):
![Troubleshooting extruder click sound video](/troubleshooting-extruder-click-sound.webm)
- Duza este prea aproape de pat, blocând curgerea filamentului. Reglează offsetul axei Z, fără a fi prea departe de pat
- Temperatura de printare este prea mică pentru filamentul folosit. Consultă temperaturile de printare a filamentului folosit și reglează temperatura
- Duza este blocată. Închide imprimanta 3D și anunță un supervizor

## Imprimanta este deconectată / offline:
![Troubleshooting disconnected printer video](/troubleshooting-disconnected-printer.webm)
- Verifică dacă cablul USB dintre imprimantă și PC este conectat stabil
- Verifică dacă imprimanta și PC-ul legat la imprimantă sunt alimentate
- Verifică dacă cablul de internet de la PC-ul imprimantei este conectat stabil
- În cazul în care problema nu s-a rezolvat, închide imprimanta și anunță un supervizor 

## Nu pot printa cu filament TPU sau alte filamente flexibile
În momentul de față, imprimanta nu este capabilă să printeze cu filamente flexibile. Există posibilitatea ca, pe termen lung, imprimanta 3D să fie upgradată cu o configurație direct-drive. Până atunci, printarea cu TPU sau alte filamente flexibile nu este disponibilă.

## Dacă printarea eșuează
Dacă printarea a eșuat de mai multe ori, oprește imprimanta din interfața web și anunță un supervizor. Nu încerca să repari mecanic imprimanta în timpul funcționării.
