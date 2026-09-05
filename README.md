# Per Gram

**The carbon cost of your protein.**

Scan a barcode, get kilograms of CO₂e per 100 grams of protein — per gram
of protein delivered, not per kilogram of food. That distinction matters:
per kilogram of food flatters anything watery, and it is the wrong
comparison for somebody buying protein.

Live: **https://pergram.vercel.app**

---

## Why per gram of protein

| Source | kg CO₂e / 100g protein | Rate |
|---|---|---|
| Pea protein | 0.4 | 1.00× |
| Nuts and seeds | 1.2 | 1.00× |
| Soy or tofu | 2.0 | 1.00× |
| Whey or casein | 3.6 | 0.56× |
| Chicken | 5.7 | 0.35× |
| Milk protein | 9.5 | 0.21× |
| Cheese | 21 | 0.10× |
| Beef or lamb | 50 | 0.04× |

Beef is roughly 100× pea protein per gram of protein delivered. Not
slightly worse — two orders of magnitude.

The rate is a continuous function of the footprint: `2.0 ÷ intensity`,
capped at 1.00. Not a set of bands. Bands were the first version and they
were wrong — cheese at 21 shared a tier with pork at 7.6, so a 5.8×
difference in footprint collapsed into a 1.8× difference in reward.
Deriving the rate from the number removes the boundary, and with it a
whole class of bug.

## How a claim is made

Two independent inputs, because neither is sufficient alone.

**The barcode says what it is.** A receipt line reading `BAREBELLS
PROTEIN` cannot tell you the protein source or the grams per 100g. The
scan resolves that against Open Food Facts.

**The receipt says you bought it, and how much.** Never a typed number —
a number a user types is a number they would inflate. The quantity comes
off the receipt or not at all.

Receipt line items are matched to scanned products by weighting words
against how often they appear *on that receipt*. A brand name identifies
a line; `PROT` and `BARS` do not, because half the protein products in a
shop contain both. A line carrying only generic agreement is dropped from
the running rather than left to win on score — which is how an earlier
version confidently credited a Barebells bar to the Gatorade line. Where
nothing distinctive matches, the answer is no match: unpaid beats paid
against the wrong line.

Pack sizes come from the product record where it states one (`6 x 142 g`)
and from the receipt where the receipt states a count. The two are never
multiplied together — whichever source said "pack" has already absorbed
the multiplier. Where a multipack reading is uncorroborated, the app
asks; the answer can only ever lower the claim, never raise it.

## The classifier

`classifier.js` resolves a product's protein source from its ingredients.
It is regex over text, and every rule in it exists because something real
broke:

- **Allergen statements are stripped first.** "May contain peanuts, tree
  nuts" made whey powders classify as nuts.
- **Dominance by position.** First-rule-wins put a whey bar in the beef
  tier because gelatin appeared far down its ingredient list.
- **Refinements beat their input.** Cheese and whey both list milk first,
  because milk is what they are made from.
- **Flavourings are not protein.** Yeast extract in seasoning made roast
  chicken classify as yeast; breading made fried chicken read as wheat.
- **Brand names lose to ingredients.** "Chicken of the Sea" is tuna.
- **A vegan label vetoes an animal result** — unless the product names its
  animal protein in the title, since database labels are user-contributed
  and sometimes wrong.
- **Six languages**, because the database is largely European.
- **Below 10g protein per 100g, nothing is classified.** Green beans are
  not a protein source, and scoring them was both wrong and the cheapest
  thing in the app to farm.
- **Unresolved defaults to a low rate, never a high one.** An unknown that
  pays maximum is the first thing anyone exploits.

Tested against ~1,500 real products via the Open Food Facts API at a 1.2%
unresolved rate, with no vegan/animal contradictions.

## Sources

- **Product data** — [Open Food Facts](https://world.openfoodfacts.org),
  a free community database of ~4M products.
- **Footprints** — Poore & Nemecek (2018), *Science*: global medians
  across ~38,000 farms in 119 countries.
- **Receipt reading** — AWS Textract AnalyzeExpense.

Whey is costed by **economic allocation**: it is a by-product of cheese
making, so the herd's emissions are apportioned by the value of what the
process yields. Cheese carries the share whey is discounted for.
Mass-balance accounting would put whey nearer 8–9. Both methods appear in
published work; this uses the former, consistently, for both the figure
and the rate. Applying an allocation at one end only would flatter both.

## Files

    index.html      the scanner and receipt flow
    classifier.js   protein source classification and footprints
    api.js          wallet sign-in and API client
    api-bridge.js   connects the page to the claims backend

The app loads `classifier.js` rather than keeping its own copy, so the
tests and the app cannot drift apart.

The claims backend is a separate service: wallet authentication by
VeChain certificate, VeBetterPassport personhood checks, receipt hashing
for anti-replay, weekly caps and round settlement.

## Status

Live: the scanner, the classifier, wallet sign-in, personhood checks,
receipt capture and line matching, weekly caps and duplicate refusal.

Not yet: B3TR distribution. Rounds settle and compute what is owed;
nothing transfers.
