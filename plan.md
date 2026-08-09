# Aplikacja do planowania przepływów pieniężnych — wymagania biznesowe

Dokument opisuje wymagania funkcjonalne, ścieżkę użytkownika (customer journey) oraz model danych (entities) dla aplikacji będącej rozwinięciem arkusza planowania przepływów pieniężnych z podziałem na prognozę i wykonanie.

Poza zakresem (świadomie pominięte): uwierzytelnianie i autoryzacja, logowanie zdarzeń, wdrożenie/hosting, kopie zapasowe, wielojęzyczność, powiadomienia. Dokument skupia się wyłącznie na głównej funkcjonalności domenowej.

Decyzje projektowe przyjęte na wejściu:
- Aplikacja obsługuje **wiele niezależnych planów** (np. różne scenariusze albo różne okresy życia).
- Horyzont czasowy planu jest **dowolnym zakresem miesięcy** definiowanym przez użytkownika (nie sztywne 6 miesięcy).
- Algorytm alokacji inwestycji (minimum na miesiąc + proporcjonalny podział nadwyżki) jest **zaszyty na stałe w kodzie**. Konfigurowalne pozostają jedynie jego parametry wejściowe: łączny cel inwestycyjny, kwota minimalna na miesiąc oraz zakres miesięcy objętych celem.

---

## 1. Słownik pojęć domenowych

Zanim przejdziemy do wymagań, ustalmy język, bo terminy powtarzają się w całym dokumencie.

- **Plan** — pojedynczy scenariusz finansowy obejmujący zakres miesięcy, założenia, listę wpływów i wydatków oraz konfigurację inwestycji. Użytkownik może mieć wiele planów.
- **Prognoza (forecast)** — pierwotnie zaplanowana wartość danej pozycji. Nie zmienia się w trakcie realizacji; służy jako punkt odniesienia.
- **Wykonanie (actual)** — rzeczywista wartość danej pozycji, wprowadzana po fakcie. Może nie istnieć (miesiąc jeszcze nie nastąpił lub użytkownik jeszcze nie zaktualizował danych).
- **Wartość efektywna (effective value)** — wartość używana do bieżących obliczeń: wykonanie, jeśli istnieje; w przeciwnym razie prognoza. To kluczowy mechanizm łączący plan z rzeczywistością.
- **Wydatek stały (recurring expense)** — pozycja powtarzająca się co miesiąc przez cały (lub część) horyzont planu, np. czynsz, jedzenie, fizjoterapia.
- **Wydatek jednorazowy (one-time expense)** — pojedyncze zdarzenie przypisane do konkretnej daty, np. ubezpieczenie auta, wyjazd.
- **Wpływ (income)** — pojedyncze wpłynięcie środków przypisane do daty, np. wypłata.
- **Nadwyżka (surplus)** — wpływy pomniejszone o sumę wydatków w danym miesiącu, przed odłożeniem na inwestycje.
- **Wpłata inwestycyjna (investment contribution)** — kwota odkładana na konto inwestycyjne w danym miesiącu, wyliczana przez algorytm alokacji.
- **Saldo miesiąca (monthly balance)** — wpływy minus wydatki minus wpłata inwestycyjna w danym miesiącu.
- **Saldo skumulowane (cumulative balance)** — narastające saldo na koncie bieżącym: saldo początkowe plus suma sald miesięcznych do danego miesiąca włącznie.
- **Korekta ręczna (manual override)** — możliwość nadpisania salda danego miesiąca jedną kwotą (np. znaną z wyciągu bankowego), z pominięciem szczegółowych obliczeń.
- **Odchylenie (variance)** — różnica między wykonaniem a prognozą; pokazuje, czy dany miesiąc wyszedł lepiej czy gorzej niż zakładano.

---

## 2. Wymagania funkcjonalne

### 2.1. Zarządzanie planami

- Użytkownik może utworzyć nowy plan, podając nazwę, zakres miesięcy (miesiąc początkowy i końcowy) oraz saldo początkowe na pierwszy dzień pierwszego miesiąca.
- Użytkownik może przeglądać listę wszystkich swoich planów wraz z podstawowymi metrykami (np. zakres dat, saldo końcowe prognozowane, saldo końcowe efektywne).
- Użytkownik może edytować, duplikować i usuwać plany. Duplikacja jest istotna dla scenariuszy „co, jeśli" — pozwala rozgałęzić istniejący plan bez utraty oryginału.
- Każdy plan jest w pełni niezależny: zmiana w jednym planie nie wpływa na pozostałe.

### 2.2. Definiowanie założeń

- Użytkownik definiuje wydatki stałe (nazwa, kwota miesięczna, opcjonalnie zakres miesięcy obowiązywania, jeśli węższy niż cały plan).
- Użytkownik definiuje wydatki jednorazowe (nazwa, data, kwota prognozowana).
- Użytkownik definiuje wpływy (nazwa, data, kwota prognozowana).
- Użytkownik definiuje konfigurację inwestycji: łączny cel kwotowy, minimalną wpłatę miesięczną oraz zakres miesięcy objętych celem (np. „inwestuj tylko do końca bieżącego roku").
- Kwoty widełkowe (np. fizjoterapia 600–900) rozwiązywane są przez podanie jednej wartości prognozowanej; aplikacja nie musi modelować przedziałów, choć może to być rozszerzenie.

### 2.3. Obliczenia miesięczne (silnik planu)

Dla każdego miesiąca w zakresie planu aplikacja wylicza:

- **Wpływy** — suma wpływów, których data przypada na dany miesiąc.
- **Suma wydatków stałych** — suma pozycji stałych obowiązujących w danym miesiącu.
- **Suma wydatków jednorazowych** — suma wydatków jednorazowych, których data przypada na dany miesiąc.
- **Suma wydatków** — suma wydatków stałych i jednorazowych.
- **Nadwyżka przed inwestycją** — wpływy minus suma wydatków.
- **Wpłata inwestycyjna** — wynik algorytmu alokacji (opis niżej).
- **Saldo miesiąca** — nadwyżka minus wpłata inwestycyjna.
- **Saldo skumulowane** — narastająco od salda początkowego.
- **Zainwestowane skumulowane** — narastająca suma wpłat inwestycyjnych.

Każda z tych wartości istnieje w trzech wariantach: prognozowana, efektywna (uwzględniająca wykonanie) oraz odchylenie między nimi.

### 2.4. Algorytm alokacji inwestycji (zaszyty na stałe)

Algorytm działa na poziomie prognozy i przydziela łączny cel inwestycyjny na miesiące objęte celem:

1. Każdy miesiąc objęty celem otrzymuje najpierw kwotę minimalną.
2. Pozostała część celu (cel łączny minus suma minimów) stanowi pulę do podziału.
3. Pula jest dzielona **proporcjonalnie do dodatniej nadwyżki finansowej** danego miesiąca (wpływy minus wydatki), a nie proporcjonalnie do samych wpływów.
4. Miesiąc z nadwyżką ujemną lub zerową otrzymuje wyłącznie kwotę minimalną (nie uczestniczy w podziale puli).
5. Suma wpłat inwestycyjnych po podziale równa się dokładnie łącznemu celowi.

Uwaga domenowa: algorytm może wygenerować wpłatę minimalną w miesiącu, w którym nadwyżka jest ujemna — powstający deficyt miesięczny jest wtedy pokrywany z zapasu zgromadzonego w saldzie skumulowanym z wcześniejszych miesięcy. To celowe zachowanie, nie błąd.

### 2.5. Wprowadzanie wykonania

- Dla każdego miesiąca i każdej kategorii (wpływy, poszczególne wydatki stałe, wydatki jednorazowe, wpłata inwestycyjna) użytkownik może wprowadzić wartość wykonania.
- Wprowadzenie wykonania jest opcjonalne i ziarniste: użytkownik uzupełnia tylko te pozycje, które różnią się od prognozy; reszta pozostaje liczona według prognozy.
- Wartości efektywne i salda przeliczają się natychmiast po wprowadzeniu wykonania.

### 2.6. Korekta ręczna salda

- Dla każdego miesiąca użytkownik może wprowadzić jedną kwotę korekty ręcznej salda miesiąca.
- Korekta ręczna ma **najwyższy priorytet**: jeśli istnieje, saldo miesiąca przyjmuje tę wartość, ignorując szczegółowe obliczenia z wykonania i prognozy.
- Hierarchia rozstrzygania wartości salda miesiąca: korekta ręczna → (jeśli brak) saldo wyliczone z wykonania → (jeśli brak wykonania) saldo prognozowane.

### 2.7. Analiza prognoza vs wykonanie

- Aplikacja prezentuje dla każdego miesiąca odchylenie salda (wykonanie minus prognoza), z czytelnym rozróżnieniem wyniku dodatniego (lepiej niż plan) i ujemnego (gorzej niż plan).
- Odchylenia są widoczne historycznie dla wszystkich miesięcy, co pozwala śledzić skuteczność planowania w czasie.
- Aplikacja sygnalizuje ryzyka: miesiące z ujemnym saldem miesięcznym oraz momenty, w których saldo skumulowane spada poniżej zera lub poniżej progu bezpieczeństwa (jeśli taki próg zostanie wprowadzony jako rozszerzenie).

---

## 3. Customer journey

Ścieżka opisuje typowego użytkownika przechodzącego przez aplikację od pierwszego kontaktu do rutynowego, comiesięcznego użytkowania. Podzielona jest na fazy odpowiadające cyklowi życia planu.

### Faza 1 — Utworzenie planu

Użytkownik trafia na listę planów (pustą przy pierwszym uruchomieniu). Wybiera „nowy plan", nadaje mu nazwę (np. „Budżet sierpień–styczeń"), ustala zakres miesięcy i wpisuje saldo początkowe. Powstaje pusty plan gotowy do wypełnienia założeniami.

### Faza 2 — Wprowadzenie założeń (budowa prognozy)

Użytkownik wypełnia trzy obszary danych wejściowych:

- **Wydatki stałe** — dodaje pozycje powtarzalne (czynsz, jedzenie i paliwo, fizjoterapia) z kwotą miesięczną.
- **Wydatki jednorazowe** — dodaje zdarzenia z datami (ubezpieczenie, wyjazdy, wizyty).
- **Wpływy** — dodaje spodziewane wypłaty z datami i kwotami.

Następnie konfiguruje inwestycje: podaje łączny cel, kwotę minimalną na miesiąc i zakres miesięcy objętych celem. Po zapisaniu założeń aplikacja natychmiast wylicza pełną prognozę: wpłaty inwestycyjne dla każdego miesiąca, salda miesięczne i saldo skumulowane.

### Faza 3 — Przegląd i iteracja prognozy

Użytkownik ogląda wyliczoną prognozę miesiąc po miesiącu. Widzi, które miesiące są napięte (ujemne saldo miesięczne) i jak zachowuje się saldo skumulowane. Może wracać do założeń i korygować je (np. obniżyć cel inwestycyjny, przesunąć datę wydatku), obserwując, jak zmienia się cała ścieżka. Gdy jest zadowolony, prognoza staje się jego punktem odniesienia. W razie potrzeby duplikuje plan, aby porównać alternatywne scenariusze obok siebie.

### Faza 4 — Realizacja i comiesięczna aktualizacja (rdzeń użytkowania)

To faza, w której użytkownik spędza najwięcej czasu w dłuższej perspektywie. Po zakończeniu każdego miesiąca:

1. Otwiera plan i przechodzi do bieżącego miesiąca.
2. Wprowadza rzeczywiste wartości wykonania — tylko te pozycje, które odbiegły od prognozy (np. czynsz wyszedł niżej, jeden wyjazd był tańszy, wpłynęła premia).
3. Alternatywnie, jeśli nie chce rozbijać na pozycje, wpisuje jedną kwotę korekty ręcznej salda znaną z wyciągu bankowego.
4. Aplikacja natychmiast przelicza saldo efektywne tego miesiąca i **kaskadowo aktualizuje saldo skumulowane we wszystkich kolejnych miesiącach** — nadwyżka lub niedobór z zamkniętego miesiąca przesuwa całą dalszą ścieżkę.

### Faza 5 — Analiza wyników w czasie

Na bieżąco użytkownik śledzi odchylenia: dla każdego zamkniętego miesiąca widzi, czy wynik był lepszy czy gorszy od prognozy, i o ile. Buduje w ten sposób historyczny obraz skuteczności swojego planowania. Obserwuje, jak zamknięte miesiące wpływają na projekcję pozostałych — np. dobry sierpień może podnieść najbardziej napięty punkt roku (listopad) ponad próg bezpieczeństwa. Na tej podstawie podejmuje decyzje korygujące na przyszłość (np. czy stać go na dodatkowy wydatek, czy utrzymać tempo inwestycji).

---

## 4. Model danych — objaśnienie entities

Poniżej opis encji domenowych z angielskimi nazwami, gotowy jako punkt wyjścia do schematu danych. Dla każdej encji podano jej rolę, kluczowe atrybuty (opisowo, bez wiązania się z konkretnym typem bazy) oraz relacje.

### `Plan`

Korzeń całej struktury. Reprezentuje pojedynczy, niezależny scenariusz finansowy.

- **Rola:** kontener na wszystkie założenia, pozycje i konfigurację jednego planu; jednostka, którą użytkownik tworzy, duplikuje i usuwa.
- **Kluczowe atrybuty:** identyfikator, nazwa, miesiąc początkowy, miesiąc końcowy (lub liczba miesięcy), saldo początkowe (opening balance) na pierwszy dzień zakresu, znaczniki utworzenia/modyfikacji.
- **Relacje:** posiada wiele `IncomeItem`, wiele `RecurringExpense`, wiele `OneTimeExpense`; posiada jeden `InvestmentConfig`; posiada wiele `MonthlyActual` i wiele `MonthlyOverride`.

### `IncomeItem`

Pojedynczy prognozowany wpływ przypisany do daty.

- **Rola:** źródło środków w konkretnym momencie (np. wypłata).
- **Kluczowe atrybuty:** identyfikator, odniesienie do planu, nazwa/opis, data, kwota prognozowana (forecast amount).
- **Relacje:** należy do jednego `Plan`. Przypisanie do miesiąca wynika z daty (data mieszcząca się w danym miesiącu kalendarzowym).
- **Uwaga:** wykonanie wpływów modelowane jest zbiorczo na poziomie miesiąca (patrz `MonthlyActual`), a nie per pojedynczy wpływ — zgodnie z logiką arkusza, gdzie użytkownik wpisuje łączne rzeczywiste wpływy miesiąca. Jeśli pożądana jest ziarnistość per pozycja, można dodać pole kwoty wykonania bezpośrednio tutaj (rozszerzenie).

### `RecurringExpense`

Wydatek powtarzający się co miesiąc.

- **Rola:** stały koszt obciążający każdy miesiąc w zakresie obowiązywania (czynsz, jedzenie, fizjoterapia).
- **Kluczowe atrybuty:** identyfikator, odniesienie do planu, nazwa, kwota miesięczna prognozowana, opcjonalny miesiąc początkowy i końcowy obowiązywania (gdy węższy niż cały plan).
- **Relacje:** należy do jednego `Plan`. Generuje obciążenie w każdym objętym miesiącu.
- **Uwaga:** kwoty widełkowe (600–900) reprezentowane są jedną wartością prognozowaną. Wykonanie tej pozycji per miesiąc trafia do `MonthlyActual`.

### `OneTimeExpense`

Pojedynczy wydatek przypisany do daty.

- **Rola:** jednorazowe zdarzenie kosztowe (ubezpieczenie, wyjazd, wizyta).
- **Kluczowe atrybuty:** identyfikator, odniesienie do planu, nazwa, data, kwota prognozowana.
- **Relacje:** należy do jednego `Plan`. Przypisanie do miesiąca wynika z daty.

### `InvestmentConfig`

Parametry wejściowe algorytmu alokacji inwestycji dla planu.

- **Rola:** przechowuje konfigurowalne parametry, na których operuje zaszyty na stałe algorytm; jeden zestaw na plan.
- **Kluczowe atrybuty:** identyfikator, odniesienie do planu, łączny cel inwestycyjny (total target), minimalna wpłata miesięczna (monthly minimum), zakres miesięcy objętych celem (pierwszy i ostatni miesiąc objęty).
- **Relacje:** należy do jednego `Plan` (relacja jeden-do-jednego).
- **Uwaga:** sam algorytm podziału nie jest danymi — żyje w kodzie. Ta encja dostarcza mu wyłącznie parametry.

### `MonthlyActual`

Rzeczywiste wartości wykonania dla pojedynczego miesiąca danego planu.

- **Rola:** nośnik danych „co się naprawdę wydarzyło" w danym miesiącu; sercem mechanizmu prognoza vs wykonanie.
- **Kluczowe atrybuty:** identyfikator, odniesienie do planu, oznaczenie miesiąca (rok-miesiąc), opcjonalne pola wykonania: rzeczywiste łączne wpływy, rzeczywista wpłata inwestycyjna, oraz zestaw rzeczywistych kwot wydatków stałych (per pozycja stała) i — zależnie od przyjętej ziarnistości — rzeczywiste wydatki jednorazowe. Każde pole jest opcjonalne (brak = użyj prognozy).
- **Relacje:** należy do jednego `Plan`; odnosi się do konkretnego miesiąca w zakresie planu. Może odnosić rzeczywiste kwoty do konkretnych `RecurringExpense` (jeśli modelujemy wykonanie per pozycja stała).
- **Uwaga modelowa:** to jest miejsce, gdzie „efektywność" (effective value) bierze początek — logika aplikacji dla każdego pola liczy: jeśli tu jest wartość, użyj jej; w przeciwnym razie sięgnij po prognozę z odpowiedniej encji założeń. Alternatywny model: rozbić wykonanie na osobne rekordy per (miesiąc, kategoria) zamiast jednego rekordu miesięcznego z wieloma polami — patrz warianty niżej.

### `MonthlyOverride`

Ręczna korekta salda dla pojedynczego miesiąca.

- **Rola:** pozwala nadpisać wyliczone saldo miesiąca jedną kwotą (np. z wyciągu), z pominięciem szczegółów.
- **Kluczowe atrybuty:** identyfikator, odniesienie do planu, oznaczenie miesiąca, kwota korekty salda (override balance).
- **Relacje:** należy do jednego `Plan`; co najwyżej jeden rekord na (plan, miesiąc).
- **Uwaga:** ma najwyższy priorytet w hierarchii rozstrzygania salda miesiąca. Można ją modelować jako osobną encję (jak wyżej) albo jako dodatkowe opcjonalne pole w `MonthlyActual`; wydzielenie jest czystsze semantycznie, bo korekta i wykonanie to dwa różne mechanizmy.

### `MonthlyResult` (encja wyliczana, nie przechowywana)

Reprezentuje komplet wskaźników policzonych dla jednego miesiąca. Nie musi być trwale zapisywana — to wynik działania silnika obliczeniowego na danych wejściowych. Warto ją nazwać, bo jest naturalnym obiektem prezentowanym w interfejsie i zwracanym przez logikę.

- **Rola:** widok/DTO z policzonymi wartościami miesiąca w trzech wariantach (prognoza, efektywne, odchylenie).
- **Kluczowe atrybuty (wyliczane):** oznaczenie miesiąca; wpływy (prognoza/efektywne); suma wydatków stałych; suma wydatków jednorazowych; suma wydatków; nadwyżka; wpłata inwestycyjna; saldo miesiąca; saldo skumulowane; zainwestowane skumulowane; odchylenie salda (wykonanie minus prognoza); flagi ryzyka (ujemne saldo miesiąca, saldo skumulowane poniżej zera).
- **Relacje:** pochodna od `Plan` i jego encji podrzędnych; liczona dla każdego miesiąca w zakresie. Nie ma własnej trwałości.

---

## 5. Reguły i zależności obliczeniowe (dla implementacji silnika)

Zebrane w jednym miejscu, bo to serce logiki i najczęstsze źródło błędów.

- **Wartość efektywna pozycji** = wykonanie, jeśli podane; w przeciwnym razie prognoza. Reguła stosowana konsekwentnie do wpływów, każdego wydatku stałego, wydatków jednorazowych i wpłaty inwestycyjnej.
- **Przypisanie do miesiąca** dla pozycji datowanych (`IncomeItem`, `OneTimeExpense`) następuje po miesiącu kalendarzowym daty. Dla `RecurringExpense` — po zakresie obowiązywania (domyślnie cały plan).
- **Nadwyżka miesiąca** = wpływy − suma wydatków (liczona osobno dla wariantu prognozowanego i efektywnego).
- **Alokacja inwestycji** liczona jest na wariancie **prognozowanym** nadwyżki (bo cel i podział ustala się z góry). Wpłata inwestycyjna wykonania pochodzi z `MonthlyActual`, jeśli podana.
- **Saldo miesiąca (efektywne)** = efektywne wpływy − efektywne wydatki − efektywna wpłata inwestycyjna.
- **Hierarchia salda miesiąca użytego do skumulowania:** `MonthlyOverride` → saldo z wykonania → saldo prognozowane.
- **Saldo skumulowane** miesiąca N = saldo początkowe planu + suma sald (wg hierarchii wyżej) od pierwszego miesiąca do N włącznie. Kaskaduje: zmiana w miesiącu wcześniejszym przesuwa wszystkie kolejne.
- **Suma wpłat inwestycyjnych** (prognozowana) musi po alokacji równać się łącznemu celowi — dobra własność do pokrycia testem.
- **Odchylenie** = wartość efektywna − wartość prognozowana; dodatnie dla salda oznacza wynik lepszy niż plan.

---

## 6. Sugerowane warianty i decyzje do podjęcia

Kwestie, które warto rozstrzygnąć przy projektowaniu schematu — każda ma wpływ na kształt encji.

- **Ziarnistość wykonania.** Model wyżej zakłada jeden rekord `MonthlyActual` na miesiąc z wieloma opcjonalnymi polami (blisko układu arkusza). Alternatywa: osobne rekordy `ActualEntry` per (miesiąc, kategoria/pozycja), co jest bardziej znormalizowane i elastyczne, ale wymaga więcej łączeń. Wybór zależy od tego, czy przewidujesz rozbudowę kategorii.
- **Wykonanie per pozycja vs zbiorczo.** Czy rzeczywiste wpływy i wydatki jednorazowe śledzisz łącznie na miesiąc (jak w arkuszu), czy per konkretna pozycja (`IncomeItem`/`OneTimeExpense` z własnym polem wykonania). To drugie daje dokładniejszą analizę odchyleń, ale komplikuje wprowadzanie danych.
- **Reprezentacja miesiąca.** Ujednolić klucz miesiąca (np. pierwszy dzień miesiąca albo para rok+miesiąc) i używać go spójnie we wszystkich encjach miesięcznych oraz w silniku.
- **Widełki kwotowe.** Czy `RecurringExpense` ma wspierać zakres (min–max) z wartością domyślną, czy wystarczy pojedyncza kwota prognozowana. Arkusz używał pojedynczej wartości (górnej granicy).
- **Próg bezpieczeństwa salda.** Opcjonalny parametr planu (np. minimalne saldo skumulowane), poniżej którego aplikacja sygnalizuje ryzyko — naturalne rozszerzenie flag ryzyka w `MonthlyResult`.