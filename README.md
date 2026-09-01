[README.md](https://github.com/user-attachments/files/31671505/README.md)
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
capped at 1.00. Not a set of bands. Bands were the first version, and
they were wrong — cheese at 21 shared a tier with pork at 7.6, so a 5.8×
difference in footprint collapsed into a 1.8× difference in reward.
Deriving the rate from the number removes the boundary, and with it a
whole class of bug.

## Sources

- **Product data** — [Open Food Facts](https://world.openfoodfacts.org),
  a free community database of ~4M products. No key required.
- **Footprints** — Poore & Nemecek (2018), *Science*: global medians
  across ~38,000 farms in 119 countries.

Whey is costed by **economic allocation**: it is a by-product of cheese
making, so the herd's emissions are apportioned by the value of what the
process yields. Cheese carries the share whey is discounted for.
Mass-balance accounting would put whey nearer 8–9. Both methods appear in
published work; this uses the former, consistently, for both the figure
and the rate. Applying an allocation at one end only would flatter both.

## The classifier

`classifier.js` resolves a product's protein source from its ingredients.
It is regex over text, and every rule in it exists because something real
broke:

- **Allergen statements are stripped first.** "May contain peanuts, tree
  nuts" made whey powders classify as nuts.
- **Dominance by position.** First-rule-wins put a whey bar in the beef
  tier because gelatin appeared far down its ingredient list. The
  dominant ingredient is the one nearest the start.
- **Refinements beat their input.** Cheese and whey both list milk first,
  because milk is what they are made from.
- **Flavourings are not protein.** Yeast extract in seasoning made roast
  chicken classify as yeast; breading made fried chicken read as wheat.
- **Brand names lose to ingredients.** "Chicken of the Sea" is tuna.
- **A vegan label vetoes an animal result** — unless the product names its
  animal protein in the title, since database labels are user-contributed
  and sometimes wrong.
- **Six languages**, because the database is largely European.
- **Below 10g protein per 100g, nothing is classified at all.** Green
  beans are not a protein source, and scoring them was both wrong and the
  cheapest thing in the app to farm.
- **Unresolved products default to a low rate, never a high one.** An
  unknown that pays maximum is the first thing anyone exploits.

Tested against ~1,500 real products via the Open Food Facts API at a 1.2%
unresolved rate, with no vegan/animal contradictions.

## Files

    index.html      the scanner
    classifier.js   protein source classification and footprints

The app loads `classifier.js` rather than keeping its own copy, so the
tests and the app cannot drift apart.

## Status

The scanner is live. Reward distribution and receipt verification are in
development and not part of this repository.
