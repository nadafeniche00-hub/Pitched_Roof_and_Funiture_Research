// Traditional timber frames and roof carpentry of north-west Germany (Westfalen / Lippe / Minden / Paderborn /
// Osnabrück), as a rule base for the roof model. Every statement carries its source key (see SOURCES);
// values that are planning defaults and not backed by a source are flagged `assumed: true`.
// Background and caveats: docs/TRADITIONAL_FRAMES.md

export const SOURCES = {
  wolf1950: { title: 'Gustav Wolf: Baufibel für das nördliche Westfalen, München 1950 - "Der Dachbau"', url: 'https://nbn-resolving.org/urn:nbn:de:hbz:466:1-83329' },
  lwl: { title: 'LWL-Freilichtmuseum Detmold (Baugruppen, Wikipedia)', url: 'https://de.wikipedia.org/wiki/LWL-Freilichtmuseum_Detmold' },
  hallenhaus: { title: 'Niederdeutsches Hallenhaus (Wikipedia)', url: 'https://de.wikipedia.org/wiki/Niederdeutsches_Hallenhaus' },
  sparren: { title: 'Sparrendach (Wikipedia)', url: 'https://de.wikipedia.org/wiki/Sparrendach' },
  pfetten: { title: 'Pfettendach (Wikipedia)', url: 'https://de.wikipedia.org/wiki/Pfettendach' },
  dachstuhl: { title: 'Dachstuhl (Wikipedia)', url: 'https://de.wikipedia.org/wiki/Dachstuhl' },
  baunetzPfetten: { title: 'Baunetz Wissen: Pfettendach', url: 'https://www.baunetzwissen.de/geneigtes-dach/fachwissen/dachtragwerke/pfettendach-158389' },
  baunetzNeigung: { title: 'Baunetz Wissen: Mindestdachneigung / Dachneigung', url: 'https://www.baunetzwissen.de/glossar/m/mindestdachneigung-2310607' },
  zvdh: { title: 'ZVDH Fachregeln - Tabelle Regel-/Mindestdachneigung', url: 'https://www.ddh.de/api/media/4451350/master/DOE-0000_Flyer_ZVDH-Fachregeln_Aufl06_RZ2_Export-Tabelle-Rueckseite_screen.pdf' },
  fachseiten: { title: 'Fachseiten Dachstuhl (sanier.de, handwerk-technik.de) - Faustregeln, keine Norm', url: 'https://www.sanier.de/dach/steildach/konstruktion/sparrendach' },
  volksdorf: { title: 'Museumsdorf Volksdorf: Bauform Fachhallenhaus', url: 'https://www.museumsdorf-volksdorf.de/.cm4all/uproc.php/0/Museumsdorf/H%C3%A4user/Bauform_Fachhallenhaus.pdf?cdp=a' },
  snow: { title: 'DIN EN 1991-1-3 Formbeiwert μ1 (nach Dlubal / Forum Verlag)', url: 'https://forum-verlag.com/fachwissen/bau-und-gebaeudemanagement/schneelast-berechnen/' },
};

// ---------------------------------------------------------------- roof coverings

export const COVERINGS = {
  reet: {
    de: 'Reet / Stroh (Weichdach)', en: 'Reed / straw thatch', min: 45, minWindy: 50, regel: 53, heavy: false, src: ['baunetzNeigung', 'wolf1950'],
    note_de: 'Ursprüngliche Deckung des ländlichen Niederdeutschlands; mind. 45°, in windreichen Lagen 50°.',
    note_en: 'Original covering of rural Lower Germany; at least 45°, 50° in windy places.',
  },
  hohlpfanne: {
    de: 'Hohlpfanne (Tonziegel)', en: 'Clay pantile (Hohlpfanne)', min: 22, minWindy: 25, regel: 30, heavy: false, assumed: true, src: ['wolf1950', 'zvdh'],
    note_de: 'Bodenständige Deckung des nördlichen Westfalen seit dem 18. Jh.; starr, daher einfache Dachform ohne Kehlen. Neigungswerte nach ZVDH-Spanne für Dachziegel (22–40° Regeldachneigung je Typ) - Wert für die Hohlpfanne selbst nicht belegt.',
    note_en: 'Vernacular covering of northern Westphalia from the 18th century; rigid, so simple roof shapes without valleys. Pitch from the ZVDH range for clay tiles (22–40° by type) - not specific to the Hohlpfanne.',
  },
  dachziegel: {
    de: 'Dachziegel / Dachstein (Biberschwanz u. a.)', en: 'Clay / concrete tiles (plain tiles etc.)', min: 22, minWindy: 25, regel: 30, heavy: false, src: ['zvdh', 'wolf1950'],
    note_de: 'Regeldachneigung 22°–40° je Ziegeltyp; mit Zusatzmaßnahmen darunter bis ca. 10° möglich. Biberschwanz erlaubt Kehlen und Wölbflächen.',
    note_en: 'Standard pitch 22°–40° by tile type; with additional measures down to about 10°. Plain tiles allow valleys and curved surfaces.',
  },
  sollingplatte: {
    de: 'Sollingplatten (Sandstein)', en: 'Solling sandstone slabs', min: 45, minWindy: 45, regel: 53, heavy: true, assumed: true, src: ['wolf1950', 'lwl'],
    note_de: 'Schwere Plattendeckung am Weserostrand (Höxter/Holzminden); im Paderborner Dorf seit dem 18. Jh. neben Ziegeln. Mindestneigung nicht belegt - hier die 2:3-Regel nach Wolf (≈ 53°) angesetzt; Tragwerk muss das hohe Gewicht aufnehmen.',
    note_en: 'Heavy slab covering at the Weser edge (Höxter/Holzminden); in the Paderborner Dorf next to tiles since the 18th century. Minimum pitch not documented - Wolf’s 2:3 rule (≈ 53°) used; the frame must carry the high weight.',
  },
  schiefer: {
    de: 'Naturschiefer', en: 'Natural slate', min: 15, minWindy: 20, regel: 25, heavy: false, src: ['baunetzNeigung', 'wolf1950'],
    note_de: 'Süden Westfalens (Sauer-/Siegerland), auch an Wänden. Altdeutsche Deckung 25° (min. 15°), Rechteck-Doppeldeckung 22° (min. 12°), Spitzwinkeldeckung 30° (min. 20°).',
    note_en: 'South Westphalia (Sauerland/Siegerland), also on walls. Old-German 25° (min 15°), rectangular double 22° (min 12°), pointed 30° (min 20°).',
  },
};

// ---------------------------------------------------------------- roof / frame systems

/**
 * posts(room, opts) -> [{x, y, s}] interior roof posts in plan coordinates.
 * kneeTyp: planning default for the Kniestock (assumed).
 */
export const SYSTEMS = {
  sparren: {
    de: 'Sparrendach', en: 'Rafter roof', pitchMin: 30, pitchTyp: 50, depthMax: 8, rafterFreeMax: 4, kneeTyp: 0.3, collar: false, posts: 'none',
    rules: [
      { de: 'Ab ca. 30° Dachneigung; darunter wächst der Horizontalschub am Fußpunkt.', en: 'From about 30° pitch; below that the horizontal thrust at the eaves grows.', src: ['sparren'] },
      { de: 'Einfaches Sparrendach für Gebäudetiefen von ca. 7–8 m; größere Tiefen brauchen Kehlbalken.', en: 'A simple rafter roof suits building depths of about 7–8 m; larger depths need collar beams.', src: ['sparren', 'fachseiten'] },
      { de: 'Zugbalken (Deckenbalken/Zerrbalken) nimmt den Schub auf; Sparrenabstand heute 70–80 cm, höchstens 90 cm (traditionell bis ca. 1 m).', en: 'A tie beam takes the thrust; rafter spacing today 70–80 cm, max 90 cm (traditionally up to about 1 m).', src: ['sparren'] },
      { de: 'Traditionell freie Sparrenlänge höchstens ca. 4 m; Binder etwa jedes vierte Gespärre, höchstens 5 m auseinander.', en: 'Traditionally a free rafter length of about 4 m at most; a binder about every fourth pair, at most 5 m apart.', src: ['sparren'] },
      { de: 'Dachraum stützenfrei; Kniestock und Gauben sind konstruktiv aufwendig.', en: 'Attic is column-free; knee walls and dormers are structurally demanding.', src: ['sparren'] },
    ],
  },
  kehlbalken: {
    de: 'Kehlbalkendach', en: 'Collar-beam roof', pitchMin: 30, pitchTyp: 50, depthMin: 8, collar: true, collarFraction: 0.5, upperRafterMax: 3.5, kneeTyp: 0.3, posts: 'none',
    rules: [
      { de: 'Ab Gebäudetiefen über ca. 8 m und Neigungen ab 45° erforderlich und wirtschaftlicher als das einfache Sparrendach.', en: 'Required and more economical than a simple rafter roof for building depths over about 8 m and pitches from 45°.', src: ['fachseiten'] },
      { de: 'Kehlbalken wirkt am besten auf halber Sparrenlänge; der Sparrenteil darüber höchstens ca. 3,5 m.', en: 'The collar beam works best at half the rafter length; the rafter part above it at most about 3.5 m.', src: ['fachseiten'] },
      { de: 'Bei Nutzung des Dachraums kommt zur Druck- auch Zugbeanspruchung des Kehlbalkens hinzu.', en: 'When the attic is used the collar beam sees tension as well as compression.', src: ['fachseiten'] },
      { de: 'Kann mit einfach, doppelt oder dreifach stehendem Stuhl kombiniert werden (doppelt am häufigsten).', en: 'Can be combined with a single, double or triple standing frame (double is the usual).', src: ['sparren', 'dachstuhl'] },
    ],
  },
  pfetten_stehend: {
    de: 'Pfettendach, stehender Stuhl', en: 'Purlin roof, standing posts', pitchMin: 20, pitchTyp: 40, kneeTyp: 0.9, collar: false, posts: 'purlin', postSpacing: 3.5, assumedPostSpacing: true,
    rules: [
      { de: 'Pfetten parallel zur Traufe tragen die Sparren; deutlich flachere Neigungen und größere Tiefen als beim Sparrendach möglich.', en: 'Purlins parallel to the eaves carry the rafters; much flatter pitches and larger depths than a rafter roof.', src: ['pfetten', 'baunetzPfetten'] },
      { de: 'Einfach stehender Stuhl: Firstsäulen; zweifach: Mittelpfetten auf Pfosten; dreifach: Fuß-, Mittel- und Firstpfetten.', en: 'Single standing frame: ridge posts; double: mid purlins on posts; triple: eaves, mid and ridge purlins.', src: ['baunetzPfetten'] },
      { de: 'Geringer Horizontalschub: Kniestock (Drempel), große Gauben und Walme sind einfach herzustellen.', en: 'Small horizontal thrust: knee walls, large dormers and hips are easy.', src: ['pfetten'] },
      { de: 'Bei Neigungen über 40° oder Sparrenlängen über 7 m sind zusätzliche Streben gegen Windkräfte sinnvoll.', en: 'Above 40° pitch or rafter lengths over 7 m extra braces against wind are sensible.', src: ['fachseiten'] },
      { de: 'Pfosten stehen im Dachraum und müssen ihre Last bis in die Fundamente abtragen. Pfostenabstand 3,5 m ist ein Planungsansatz, kein Quellenwert.', en: 'Posts stand in the attic and must carry their load to the foundation. The 3.5 m post spacing is a planning assumption, not a source value.', src: ['pfetten'] },
    ],
  },
  pfetten_liegend: {
    de: 'Pfettendach, liegender Stuhl', en: 'Purlin roof, raking posts', pitchMin: 20, pitchTyp: 40, kneeTyp: 0.9, collar: false, posts: 'raking', postSpacing: 3.5, assumedPostSpacing: true,
    rules: [
      { de: 'Schräg liegende Stuhlsäulen übernehmen zugleich die Aufgabe der Streben; der Dachraum bleibt in der Mitte frei.', en: 'Raking posts double as braces; the middle of the attic stays free.', src: ['dachstuhl', 'fachseiten'] },
      { de: 'Fuß der Stuhlsäulen sitzt nahe der Außenwand auf der Balkenlage und wirkt als Spannriegel-Auflager.', en: 'The posts’ feet sit near the outer wall on the joists and carry a tie.', src: ['dachstuhl'] },
      { de: 'Geeignet, wenn ein stehender Stuhl den Binderbalken zu stark durchbiegen würde (große Längen).', en: 'Suitable where standing posts would deflect the tie beam too much (large spans).', src: ['fachseiten'] },
    ],
  },
  staenderbau: {
    de: 'Ständerbau (Hallenhaus)', en: 'Post-and-beam frame (hall house)', pitchMin: 45, pitchTyp: 53, kneeTyp: 0.0, collar: false, posts: 'staender', postSpacing: 2.5,
    rules: [
      { de: 'Das Dach ruht auf Ständerreihen statt auf den Außenwänden; Ständerpaar, Rähm/Balken und Sparren bilden ein steifes Dreieck.', en: 'The roof rests on rows of posts rather than the outer walls; a post pair, beam and rafters form a rigid triangle.', src: ['volksdorf', 'hallenhaus'] },
      { de: 'Fachbreite (Abstand der Ständerpaare) etwa 2,5 m.', en: 'Bay width (distance between post pairs) about 2.5 m.', src: ['volksdorf'] },
      { de: 'Grundformen: Zweiständer (ältester), Dreiständer (asymmetrische Übergangsform), Vierständer (in Westfalen verbreitet).', en: 'Basic forms: two-post (oldest), three-post (asymmetric transitional), four-post (widespread in Westphalia).', src: ['hallenhaus', 'wolf1950'] },
      { de: 'Zweiflächendach (Satteldach zwischen zwei ungebrochenen Giebeln) für volle Nutzung des Dachbodens als Erntelager.', en: 'Two-slope roof (saddle between two full gables) so the whole loft can store the harvest.', src: ['wolf1950'] },
      { de: 'Zimmermannsregel: Firsthöhe = 2/3 der Gebäudebreite (Halbbreite in 3 Teile, 4 Teile hoch, Sparren 5 Teile) ≈ 53° Neigung.', en: 'Carpenter’s rule: ridge height = 2/3 of the building width (half-width in 3 parts, 4 parts high, rafter 5 parts) ≈ 53° pitch.', src: ['wolf1950'] },
    ],
  },
};

// ---------------------------------------------------------------- regions

export const REGIONS = [
  {
    id: 'paderborn', de: 'Paderborner Land / Kreis Höxter', en: 'Paderborn Land / Höxter district',
    museum: { de: 'Paderborner Dorf (ca. 70 Gebäude, Zustand um 1900)', en: 'Paderborner Dorf (about 70 buildings, state around 1900)' },
    house: { de: 'Durchgangsdeelenhaus, Vierständerbau (Ackerbürgerhaus 1730, Haupthaus Zeddies 1731)', en: 'Through-hall house, four-post frame (Ackerbürgerhaus 1730, Haupthaus Zeddies 1731)' },
    frame: 'vierstaender', system: 'staenderbau', covering: 'sollingplatte', coverings: ['reet', 'hohlpfanne', 'sollingplatte'], form: 'Satteldach',
    note: { de: 'Ursprünglich Strohdach, seit dem 18. Jh. Ziegel oder Sollingsandstein-Platten.', en: 'Originally thatch, from the 18th century tiles or Solling sandstone slabs.' },
    src: ['lwl', 'wolf1950'],
  },
  {
    id: 'lippe', de: 'Lippe', en: 'Lippe',
    museum: { de: 'Lippischer Meierhof', en: 'Lippischer Meierhof' },
    house: { de: 'Zweiständerbau, Haupthaus 43 m lang (1570/1707)', en: 'Two-post frame, main house 43 m long (1570/1707)' },
    frame: 'zweistaender', system: 'staenderbau', covering: 'hohlpfanne', coverings: ['reet', 'hohlpfanne', 'sollingplatte'], form: 'Satteldach',
    note: { de: 'Dachform und Deckung im Quellentext nicht beschrieben; Wolf: Hohlpfanne im nördlichen Westfalen, Sollingplatten am Weserrand. Weserrenaissance-Zierfachwerk nicht belegt.', en: 'Roof form and covering are not described in the source text; Wolf: Hohlpfanne in northern Westphalia, Solling slabs at the Weser edge. Weser-Renaissance ornamental framing not verified.' },
    src: ['lwl', 'wolf1950'],
  },
  {
    id: 'minden', de: 'Minden-Lübbecke / Grafschaft Hoya', en: 'Minden-Lübbecke / County of Hoya',
    museum: { de: 'Mindener Hof', en: 'Mindener Hof' },
    house: { de: 'Zweiständer-Hallenhaus mit halbrund vorspringendem Walmdach und Pferdeköpfen (1673/1780)', en: 'Two-post hall house with a semicircular projecting hipped end and horse-head gables (1673/1780)' },
    frame: 'zweistaender', system: 'staenderbau', covering: 'reet', coverings: ['reet', 'hohlpfanne'], form: 'Walm (halbrund)',
    note: { de: 'Weichdächer haben sich im Kreis Minden und Lübbecke am längsten gehalten (Wolf 1950).', en: 'Soft roofs survived longest in the districts of Minden and Lübbecke (Wolf 1950).' },
    src: ['lwl', 'wolf1950'],
  },
  {
    id: 'muensterland', de: 'Münsterland / Westmünsterland', en: 'Münsterland / western Münsterland',
    museum: { de: 'Münsterländer Gräftenhof, Westmünsterländer Hof', en: 'Münsterländer Gräftenhof, Westmünsterländer Hof' },
    house: { de: 'Niederdeutsches Hallenhaus, Vierständer; Haupthaus 1787, 42 × 15 m (größtes des Museums)', en: 'Low German hall house, four-post frame; main house 1787, 42 × 15 m (the museum’s largest)' },
    frame: 'vierstaender', system: 'staenderbau', covering: 'hohlpfanne', coverings: ['reet', 'hohlpfanne'], form: 'Satteldach',
    note: { de: 'Vierständer-Hallenhaus ist im Münsterland und Osning weit verbreitet (Wolf 1950); nördliches Westfalen bevorzugte die naturrote Hohlpfanne.', en: 'The four-post hall house is widespread in Münsterland and Osning (Wolf 1950); northern Westphalia preferred the natural-red Hohlpfanne.' },
    src: ['lwl', 'hallenhaus', 'wolf1950'],
  },
  {
    id: 'osnabrueck', de: 'Osnabrücker Land / Wiehengebirge', en: 'Osnabrück Land / Wiehen Hills',
    museum: { de: 'Osnabrücker Hof', en: 'Osnabrücker Hof' },
    house: { de: 'Hallenhaus, Haupthaus 1609 (1790 hier wiederaufgebaut); kleinere Höfe und Kotten mit Halb- oder Vollwalm', en: 'Hall house, main house 1609 (rebuilt here 1790); smaller farms and cottages with half or full hips' },
    frame: 'vierstaender', system: 'staenderbau', covering: 'reet', coverings: ['reet', 'hohlpfanne'], form: 'Satteldach / Halbwalm',
    note: { de: 'Weichdächer erinnern im Kreis Tecklenburg an die alte Dachlandschaft (Wolf 1950).', en: 'Soft roofs in the district of Tecklenburg recall the old roof landscape (Wolf 1950).' },
    src: ['lwl', 'hallenhaus', 'wolf1950'],
  },
  {
    id: 'hellweg', de: 'Hellweg (Dortmund-Brackel)', en: 'Hellweg (Dortmund-Brackel)',
    museum: { de: 'Westhellweg-Hof', en: 'Westhellweg-Hof' },
    house: { de: 'Hallenhaus, Haupthaus 1793', en: 'Hall house, main house 1793' },
    frame: 'vierstaender', system: 'staenderbau', covering: 'hohlpfanne', coverings: ['hohlpfanne', 'schiefer'], form: 'Satteldach',
    note: { de: 'Zwischen Hohlpfannen-Norden und Schiefer-Süden gelegen.', en: 'Lies between the Hohlpfanne north and the slate south.' },
    src: ['lwl', 'wolf1950'],
  },
  {
    id: 'sauerland', de: 'Sauerland (Kreis Olpe, Hochsauerlandkreis)', en: 'Sauerland (Olpe, Hochsauerland)',
    museum: { de: 'Sauerländer Dorf (Zeitraum 1900–1930)', en: 'Sauerländer Dorf (period 1900–1930)' },
    house: { de: 'Haupthaus 1623/1722/1764, Großer Bauernhof 1724/1770', en: 'Main house 1623/1722/1764, large farm 1724/1770' },
    frame: 'staenderbau', system: 'kehlbalken', covering: 'schiefer', coverings: ['schiefer', 'reet'], form: 'Satteldach / Krüppelwalm',
    note: { de: 'Krüppelwalm kommt im Sauerland vor; der Süden Westfalens wandte sich dem Naturschiefer zu. Dachsystem hier angenommen.', en: 'Half-hips occur in the Sauerland; southern Westphalia turned to natural slate. Roof system assumed here.' },
    assumed: true, src: ['lwl', 'hallenhaus', 'wolf1950'],
  },
  {
    id: 'siegerland', de: 'Siegerland / Altena (Südwestfalen)', en: 'Siegerland / Altena (south-west Westphalia)',
    museum: { de: '(LWL-Freilichtmuseum Hagen)', en: '(LWL open-air museum Hagen)' },
    house: { de: 'Fachwerk bzw. Steinbau; Wände und Dächer häufig mit Schiefer', en: 'Timber frame or stone; walls and roofs often slate-clad' },
    frame: 'staenderbau', system: 'kehlbalken', covering: 'schiefer', coverings: ['schiefer', 'reet'], form: 'Satteldach',
    note: { de: 'Weichdächer erinnern in den Kreisen Siegen und Altena noch an die frühere Dachlandschaft (Wolf 1950).', en: 'Soft roofs in the districts of Siegen and Altena still recall the earlier roof landscape (Wolf 1950).' },
    assumed: true, src: ['wolf1950'],
  },
];

// ---------------------------------------------------------------- calculations

const RAD = Math.PI / 180;

/** DIN EN 1991-1-3 shape coefficient µ1 for a duo-pitch roof (uniform snow load). */
export function snowFactor(alphaDeg) {
  if (alphaDeg <= 30) return 0.8;
  if (alphaDeg >= 60) return 0;
  return (0.8 * (60 - alphaDeg)) / 30;
}

/** Wolf's carpenter rule: ridge height as share of the building width (2/3 -> 53.13 deg). */
export const wolfRatio = (pitchDeg) => Math.tan(pitchDeg * RAD) / 2;
export const WOLF_PITCH = Math.atan(4 / 3) / RAD; // 53.13°

export const rafterLength = (room, pitch = room.pitch) => room.width / 2 / Math.cos(pitch * RAD);

/** Plan positions of the interior roof posts for a system. */
export function framePosts(room, systemId, opts = {}) {
  const sys = SYSTEMS[systemId];
  if (!sys || sys.posts === 'none' || sys.posts === 'raking') return [];
  const W = room.width, D = room.depth;
  const spacing = opts.spacing ?? sys.postSpacing ?? 3.5;
  const n = Math.max(2, Math.round(D / spacing));
  const ys = Array.from({ length: n }, (_, i) => +(D * (i + 0.5) / n).toFixed(3));
  let xs;
  if (sys.posts === 'purlin') xs = opts.rows === 1 ? [W / 2] : opts.rows === 3 ? [W * 0.3, W / 2, W * 0.7] : [W * 0.3, W * 0.7];
  else xs = opts.frame === 'dreistaender' ? [W * 0.35] : [W * 0.3, W * 0.7]; // staender
  const s = opts.size ?? (sys.posts === 'staender' ? 0.25 : 0.16);
  return xs.flatMap((x) => ys.map((y) => ({ x: +x.toFixed(3), y, s })));
}

/** Room-model patch for a traditional frame: pitch, knee wall, collar-tie ceiling, posts. */
export function applyFrame(room, { system, region, covering, windy = false, kehlFraction } = {}) {
  const sys = SYSTEMS[system];
  const reg = REGIONS.find((r) => r.id === region);
  const cov = COVERINGS[covering];
  if (!sys) return {};
  const minCov = cov ? (windy ? cov.minWindy : cov.min) : 0;
  let pitch = Math.max(sys.pitchTyp, sys.pitchMin, minCov);
  if (system === 'staenderbau') pitch = Math.max(WOLF_PITCH, minCov);
  pitch = Math.round(Math.min(70, pitch));
  const kneeWall = sys.kneeTyp;
  const tan = Math.tan(pitch * RAD);
  const ridge = kneeWall + tan * room.width / 2;
  const f = kehlFraction ?? sys.collarFraction ?? 0.5;
  const maxHeight = sys.collar ? +(kneeWall + tan * (room.width / 2) * f).toFixed(2) : +Math.min(6, ridge + 0.01).toFixed(2);
  const posts = framePosts(room, system, { frame: reg?.frame });
  return { pitch, kneeWall, maxHeight, posts };
}

/** Plausibility checks of the current roof against a frame system and covering. */
export function checkFrame(room, { system, covering, windy = false, kehlFraction } = {}) {
  const sys = SYSTEMS[system];
  const cov = COVERINGS[covering];
  if (!sys) return [];
  const out = [];
  const add = (level, de, en, src = []) => out.push({ level, de, en, src });
  const L = rafterLength(room);
  const a = room.pitch;

  if (a < sys.pitchMin) add('fail', `Neigung ${a}° unter dem Mindestwert ${sys.pitchMin}° für ${sys.de}.`, `Pitch ${a}° is below the ${sys.pitchMin}° minimum for a ${sys.en.toLowerCase()}.`, ['sparren', 'pfetten']);
  else add('ok', `Neigung ${a}° passt zum ${sys.de} (ab ${sys.pitchMin}°).`, `Pitch ${a}° suits a ${sys.en.toLowerCase()} (from ${sys.pitchMin}°).`);

  if (cov) {
    const need = windy ? cov.minWindy : cov.min;
    if (a < need) add('fail', `${cov.de}: mindestens ${need}° nötig${windy ? ' (windreiche Lage)' : ''}.`, `${cov.en}: at least ${need}° needed${windy ? ' (windy site)' : ''}.`, cov.src);
    else add('ok', `${cov.de}: Neigung reicht (≥ ${need}°).`, `${cov.en}: pitch is sufficient (≥ ${need}°).`, cov.src);
    if (cov.heavy) add('warn', 'Schwere Plattendeckung: Dachwerk und Ständer auf das Gewicht prüfen (Statiker).', 'Heavy slab covering: have the frame and posts checked for the weight (structural engineer).', ['wolf1950']);
  }

  if (sys.depthMax && room.width > sys.depthMax) add('warn', `Tiefe ${room.width.toFixed(1)} m über ca. ${sys.depthMax} m: Kehlbalken oder Pfetten nötig.`, `Depth ${room.width.toFixed(1)} m exceeds about ${sys.depthMax} m: collar beams or purlins needed.`, ['sparren', 'fachseiten']);
  if (sys.depthMin && room.width < sys.depthMin) add('info', `Tiefe unter ${sys.depthMin} m: ein einfaches Sparrendach genügt meist.`, `Depth under ${sys.depthMin} m: a simple rafter roof is usually enough.`, ['fachseiten']);
  if (sys.rafterFreeMax && L > sys.rafterFreeMax) add('warn', `Freie Sparrenlänge ${L.toFixed(1)} m > ca. ${sys.rafterFreeMax} m (traditionell).`, `Free rafter length ${L.toFixed(1)} m > about ${sys.rafterFreeMax} m (traditional).`, ['sparren']);
  if (sys.collar) {
    const f = kehlFraction ?? sys.collarFraction;
    const upper = L * (1 - f);
    if (upper > sys.upperRafterMax) add('warn', `Sparren über dem Kehlbalken ${upper.toFixed(1)} m > ${sys.upperRafterMax} m: Kehlbalken höher setzen.`, `Rafter above the collar beam ${upper.toFixed(1)} m > ${sys.upperRafterMax} m: raise the collar beam.`, ['fachseiten']);
    else add('ok', `Sparren über dem Kehlbalken ${upper.toFixed(1)} m (≤ ${sys.upperRafterMax} m).`, `Rafter above the collar beam ${upper.toFixed(1)} m (≤ ${sys.upperRafterMax} m).`, ['fachseiten']);
    if (room.width > 8 && a >= 45) add('info', 'Tiefe > 8 m und ≥ 45°: Kehlbalkendach ist hier die wirtschaftliche Wahl.', 'Depth > 8 m and ≥ 45°: a collar-beam roof is the economical choice here.', ['fachseiten']);
  }
  if ((system === 'pfetten_stehend' || system === 'pfetten_liegend') && (a > 40 || L > 7)) add('warn', 'Über 40° bzw. Sparren > 7 m: zusätzliche Streben gegen Wind vorsehen.', 'Above 40° or rafters > 7 m: add braces against wind.', ['fachseiten']);

  const ratio = wolfRatio(a);
  add('info', `Firsthöhe/Breite = ${(ratio * 100).toFixed(0)} % (Zimmermannsregel Wolf: 67 % ≈ 53°).`, `Ridge height / width = ${(ratio * 100).toFixed(0)} % (Wolf’s carpenter rule: 67 % ≈ 53°).`, ['wolf1950']);
  const mu = snowFactor(a);
  add('info', `Schneelast-Formbeiwert μ1 = ${mu.toFixed(2)} (0,8 bis 30°, linear auf 0 bei 60°).`, `Snow shape coefficient μ1 = ${mu.toFixed(2)} (0.8 up to 30°, linear to 0 at 60°).`, ['snow']);
  return out;
}
