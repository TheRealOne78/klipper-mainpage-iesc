# Ghid

![Creality Ender-3 Pro](/ender3_cover.png)

## Proceduri Standard

### Cum se încarcă corect filamentul:
1. Preîncălziți hotend-ul la **200°C** (pentru PLA).
2. Tăiați capătul filamentului la un unghi de 45 de grade.
3. Apăsați clapeta extruderului (lângă motorul pas-cu-pas) și împingeți manual filamentul prin tubul albastru/alb Bowden până când curge plastic curat din duză.

### Cum se face nivelarea manuală (Bed Leveling):
1. Din meniul imprimantei (sau comenzi), trimiteți axele în poziția de Home (**G28**).
2. Dezactivați motoarele (Steppers Off).
3. Mișcați manual capul de printare deasupra celor 4 șuruburi ale patului.
4. Folosiți o foaie de hârtie A4 sub duză: rotiți rotițele de sub pat până când simțiți o ușoară rezistență (frecare) când mișcați hârtia. Repetați testul de 2 ori pentru fiecare colț.

# Depanare

## Ce fac în caz de...

* **Filamentul nu se lipește de pat (Aderanță slabă):**
  - Patul este prea departe de duză. Reglați rotițele de sub pat în timp ce se printează fusta (skirt) pentru a apropia patul de duză.
  - Curățați patul rece cu alcool izopropilic pentru a îndepărta grăsimea de pe degete.
* **Extruderul scoate un zgomot de "clic" (sare pași):**
  - Duza este prea aproape de pat, blocând curgerea filamentului. Coborâți puțin patul din rotițe.
  - Duza este înfundată. Preîncălziți la 230°C și folosiți acul de curățare din kit.
* **Imprimanta este deconectată / offline:**
  - Verificați dacă cablul USB dintre imprimantă și serverul Raspberry Pi este conectat stabil.
  - Verificați dacă alimentarea principală a imprimantei Ender 3 Pro este pornită (comutatorul roșu din spate).
