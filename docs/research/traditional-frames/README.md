# Traditional timber frames and roofs of north-west Germany

> **Where the code is.** The rule base (`shared/timber.js`), the *Traditional frame / Fachwerk* tab and the engine's
> roof-post support live on the [`roof` branch](../../../../../tree/roof). Links to those files below resolve there.

Research notes behind the **Traditional frame** tab (`client/src/components/FrameView.jsx`) and the rule base in
[`shared/timber.js`](../../../shared/timber.js). Compiled 2026-10-14 from the sources listed at the end.

> **Status.** Desk research from public sources. Every number in the app is tagged with a source key or flagged
> `assumed`. Rules of thumb from textbooks and trade sites are *guidance, not code*; load-bearing design belongs to
> DIN EN 1995-1-1 (timber) and DIN EN 1991 (actions) with a structural engineer.

## 1. What the question was

Different landscapes show different houses and roofs (visible in the LWL open-air museum at Detmold and similar
museums): which frame types dominate where, what roof angles go with them, what they are covered with, and what
rules constrain the roof framing. The tool should be able to *apply* such a frame to the roof storey model and
show what it does to the usable space.

## 2. Roof framing systems (Dachwerke)

| System | Key rules found | Source quality |
|---|---|---|
| **Sparrendach** (rafter roof) | from ≈ 30° pitch (rarely below: thrust grows); simple form for building depths ≈ 7–8 m; tie beam takes the thrust; spacing today 70–80 cm, max 90 cm (traditionally up to ≈ 1 m); free rafter length traditionally ≤ ≈ 4 m, binder about every 4th pair, ≤ 5 m apart; column-free attic; knee walls and large dormers are awkward | encyclopedic (Wikipedia *Sparrendach*), trade sites |
| **Kehlbalkendach** (collar-beam roof) | needed / economical above ≈ 8 m depth and from 45° pitch; collar beam works best at half the rafter length, rafter part above it ≤ ≈ 3.5 m; tension in the collar beam when the attic is used; combinable with single / double / triple standing frame (double usual) | trade sites (textbook questions) – rules of thumb |
| **Pfettendach** (purlin roof) | purlins parallel to the eaves carry the rafters; flatter pitches and larger depths than Sparrendach; single / double / triple standing frame or raking frame; low thrust → knee wall, big dormers and hips easy; posts stand in the attic; braces above ≈ 40° or rafter > 7 m; rafter notches 2–4 cm; dominant in 19th-century Germany | Baunetz Wissen, Wikipedia *Pfettendach*, trade sites |
| **Ständerbau / Hallenhaus** | roof sits on rows of posts, not on the outer walls; post pair + beam + rafters = rigid triangle; bay ("Fach") ≈ 2.5 m; two-post (oldest), three-post (asymmetric transitional), four-post (widespread in Westphalia); two-slope roof between two full gables so the loft can store the harvest | Wolf 1950, Museumsdorf Volksdorf, Wikipedia *Niederdeutsches Hallenhaus* |

### Wolf's carpenter rule (primary historical source)

Gustav Wolf (*Baufibel für das nördliche Westfalen*, 1950) gives a Pythagorean shortcut: divide the half width
into three equal parts, set four of them upright for the ridge height; the rafter is then five parts long. Ridge
height = 2/3 of the building width, i.e. a **3-4-5 triangle, pitch ≈ 53.13°**. The same chapter says the pitch
"can no longer be as steep as a soft roof had to be, but must not be so flat that the winter snow stays".

## 3. Coverings and minimum pitch

| Covering | Pitch rule | Note |
|---|---|---|
| Reed / straw (*Weichdach*) | **≥ 45°, 50° in windy areas** | original covering of rural Lower Germany; remnants in the districts of Tecklenburg, Lübbecke, Minden (north) and Siegen, Altena (south) |
| Hohlpfanne (clay pantile) | not documented specifically; clay tiles generally 22°–40° standard pitch by type | rigid → simple roof shape, no valleys or curves (Wolf) |
| Plain tiles / concrete tiles | standard pitch (Regeldachneigung) 22°, 25°, 30°, 35°, 40° by type; lower pitches need additional measures (ZVDH classes) | Biberschwanz allows valleys and curved surfaces |
| Solling sandstone slabs | **minimum not documented** – heavy; the 2:3 rule (≈ 53°) is used in the app | east edge along the Weser (Höxter / Holzminden); in the Paderborner Dorf since the 18th century |
| Natural slate | standard pitch 22° (rect. double), 25° (old-German), 30° (pointed); minimum = standard − 10° | south Westphalia; also on walls (Siegerland) |

Transition (Wolf 1950): about 200 years before 1950 the rural landscape was uniformly soft-roofed; northern
Westphalia then moved to the natural-red **Hohlpfanne**, the south to **natural slate**, the Weser edge to
**Solling slabs**.

## 4. Regions (as shown in the LWL museum Detmold)

| Group in the museum | Region | Frame / house | Roof form & covering |
|---|---|---|---|
| Paderborner Dorf (≈ 70 buildings, c. 1900) | Paderborn / Höxter | through-hall house, four-post frame (1730, 1731) | gable roof; thatch originally, tiles or Solling slabs since the 18th c. |
| Lippischer Meierhof | Lippe | two-post frame, 43 m main house (1570/1707) | not described in the source text |
| Mindener Hof | Minden-Lübbecke, Hoya | two-post hall house (1673/1780) | semicircular projecting hipped end, horse-head gables; thatch lasted longest here |
| Münsterländer Gräftenhof / Westmünsterländer Hof | Münsterland | low German hall house, four-post, 42 × 15 m (1787) | gable roof; Hohlpfanne preferred in the north |
| Osnabrücker Hof | Osnabrück / Wiehengebirge | hall house, 1609 (rebuilt 1790) | deep-drawn roof; half-hips on small farms (secondary source) |
| Westhellweg-Hof | Dortmund-Brackel | hall house 1793 | gable roof |
| Sauerländer Dorf | Sauerland | main house 1623/1722/1764 | half-hips occur in the Sauerland; slate in the south |

Westphalia overall: almost all houses have a **gable roof** (*Satteldach*); the four-post frame is typical; a pure
hipped roof is rare (Wikipedia *Niederdeutsches Hallenhaus*). Wolf calls northern Westphalia a "roof-building
landscape": long ridge between two unbroken full gables, with a pronounced eave (rafter overhang, *Aufschieblinge*,
roof pulled over the gable, stepped overhangs in the gable).

## 5. Actions (snow)

Shape coefficient for a duo-pitch roof, uniform snow load (DIN EN 1991-1-3): **μ1 = 0.8** up to 30°,
**0.8·(60° − α)/30°** between 30° and 60°, **0** from 60°. Steeper frames shed snow; e.g. 45° → 0.40, 53° → 0.19.
The national annex and the ground snow load zone still apply.

## 6. What the app does with it

* `shared/timber.js` – `SYSTEMS`, `COVERINGS`, `REGIONS`, `SOURCES`; `applyFrame()` derives pitch, knee wall,
  collar-beam ceiling height and interior posts; `checkFrame()` tests the roof model against the rules.
* The engine treats **roof posts** (`room.posts`) as obstacles: furniture cannot stand on them, clearance zones
  and circulation stop at them, they reduce the walkable area.
* A **collar beam** becomes the usable ceiling height (`maxHeight`).
* The result is visible in the plan, the 3D view and the Usable-Space Index.

## 7. Assumptions and gaps (not verified)

* Post rows at 30 % / 70 % of the depth, post spacing 3.5 m (purlin roofs), post size 16–25 cm, knee wall
  defaults (0.0–0.9 m): **planning assumptions**, flagged `assumed`.
* The roof system assigned to the Sauerland / Siegerland entries is assumed.
* No source found for: typical pitches by landscape other than Wolf's 53°; Lippe / Weser-Renaissance roof forms;
  minimum pitch of Hohlpfanne and Solling slabs; slab weight; timber species and cross sections (only
  "Hartholz" – hard wood – is mentioned in Wolf; oak is the usual species but not sourced here); clay-staked infill
  is mentioned (*verputzte Lehmstakung*) without dimensions.
* Good next sources: Prehl, *Hölzerne Dachkonstruktionen*; Binding, *Fachterminologie für den historischen Holzbau*;
  Wolf 1950 in full (digitised at the Paderborn University Library); LWL building-research publications;
  DIN EN 1995-1-1 and DIN 68800 for design values.

## 8. Sources

| Key | Source |
|---|---|
| `wolf1950` | Gustav Wolf, *Baufibel für das nördliche Westfalen*, München 1950, chapter "Der Dachbau" – <https://nbn-resolving.org/urn:nbn:de:hbz:466:1-83329> |
| `lwl` | LWL-Freilichtmuseum Detmold (Baugruppen) – <https://de.wikipedia.org/wiki/LWL-Freilichtmuseum_Detmold> |
| `hallenhaus` | Niederdeutsches Hallenhaus – <https://de.wikipedia.org/wiki/Niederdeutsches_Hallenhaus> |
| `sparren` | Sparrendach – <https://de.wikipedia.org/wiki/Sparrendach> |
| `pfetten` | Pfettendach – <https://de.wikipedia.org/wiki/Pfettendach> |
| `dachstuhl` | Dachstuhl – <https://de.wikipedia.org/wiki/Dachstuhl> |
| `baunetzPfetten` | Baunetz Wissen, Pfettendach – <https://www.baunetzwissen.de/geneigtes-dach/fachwissen/dachtragwerke/pfettendach-158389> |
| `baunetzNeigung` | Baunetz Wissen, Mindestdachneigung – <https://www.baunetzwissen.de/glossar/m/mindestdachneigung-2310607> |
| `zvdh` | ZVDH Fachregeln, table of standard / minimum pitches – <https://www.ddh.de/api/media/4451350/master/DOE-0000_Flyer_ZVDH-Fachregeln_Aufl06_RZ2_Export-Tabelle-Rueckseite_screen.pdf> |
| `fachseiten` | sanier.de *Sparrendach*; handwerk-technik.de *Dachstuhl* (textbook rules of thumb) – <https://www.sanier.de/dach/steildach/konstruktion/sparrendach> |
| `volksdorf` | Museumsdorf Volksdorf, *Bauform Fachhallenhaus* – <https://www.museumsdorf-volksdorf.de/.cm4all/uproc.php/0/Museumsdorf/H%C3%A4user/Bauform_Fachhallenhaus.pdf?cdp=a> |
| `snow` | DIN EN 1991-1-3 shape coefficient, as quoted by Forum Verlag / Dlubal – <https://forum-verlag.com/fachwissen/bau-und-gebaeudemanagement/schneelast-berechnen/> |

The notes paraphrase these sources; nothing is copied from them. Wolf (1950) is a historical text, its principles
(roof landscape, carpenter's rule) are used as documented context, not as current regulation.
