// The planning knowledge behind the layout rules and the checks, and where each number comes from.
//
// Nothing here is legal advice. Four kinds of entry:
//   statute    a rule of a German ordinance or building code. WoFlV is federal and stable. The Landesbauordnungen (LBO) differ from state to state and
//              change: the values below are the common ones of the Musterbauordnung (MBO) and carry verify: true, to be checked against the LBO of the building.
//   standard   planning dimensions after Neufert (Bauentwurfslehre) and DIN norms, rounded to the 5 or 10 cm the plans work in.
//   graph      functional adjacency and circulation depth: space syntax (Hillier and Hanson) and layouts read as graphs.
//   dataset    research collections of floor plans as graphs (RPLAN, LIFULL HOME'S, FloorNet and similar). Described here, NOT part of the app: nothing was downloaded.
//
// The app does not "learn" these from text: the numbers are code. shared/catalog.js (furniture zones), shared/engine.js (headroom and clearance checks),
// shared/rules.js and shared/plans.js (findings) read them from here, and rulebook() is the text that goes into the prompts of the language model (server/ai.js).

// ---------------------------------------------------------------- statute

/** Wohnflächenverordnung (WoFlV), § 4: how a floor area counts as living area by the clear height above it. */
import { wallShare, doorShare, roomWallShare, pct, FLATS } from './links.js';

export const WOFLV = { fullFrom: 2.0, halfFrom: 1.0, halfFactor: 0.5, winterGarden: 0.5, balcony: 0.25, source: 'WoFlV § 4 Nr. 1-4', verify: false };

/**
 * Landesbauordnungen, typical values after the Musterbauordnung (MBO). verify: true = look it up in the LBO of the state before relying on it.
 * An attic room is "Aufenthaltsraum" when people stay there (bedroom, living, study, kitchen); bathrooms, WC, storage and halls are not.
 */
export const LBO = {
  roomHeight: 2.4, // clear height of an Aufenthaltsraum in a regular storey
  atticHeight: 2.2, // in the roof space: this height over at least half of the floor area ...
  atticShare: 0.5,
  atticIgnoredBelow: 1.5, // ... and parts lower than this do not count as floor area for that test (older codes; many states have relaxed it)
  windowShare: 1 / 8, // window (rough opening) at least 1/8 of the floor area of the room
  doorClearHeight: 2.0, // clear height of a door opening
  doorClearWidth: 0.8,
  stairClearHeight: 2.0,
  stairMinWidth: 0.8, // one- and two-family house
  parapetEscape: 1.2, // an escape window sits at most this high above the floor
  source: 'MBO §§ 33, 34, 47 (typical)', verify: true,
};

// ---------------------------------------------------------------- walls

/**
 * Wall thickness of the plans, in metres. The outer wall (36.5 cm) lies INSIDE the footprint: its outer face is the footprint line. A partition (11.5 cm) is centred on the edge between two
 * rooms. The rooms of a layout are rectangles on these lines, so a room as a person can use it is smaller (netRect in shared/plans.js): sizes, furniture and areas are judged on that.
 * WoFlV § 3 counts floor area by the clear dimensions between the walls (verify). The two thicknesses are the common German masonry ones, not a requirement.
 */
export const WALLS = { outer: 0.365, inner: 0.115, source: 'common German masonry thicknesses; WoFlV § 3 (clear dimensions)', verify: true };

// ---------------------------------------------------------------- standard (Neufert and DIN, rounded)

/**
 * Heights are clear heights above the floor in metres. "Standing" = a person stands there, "sitting" = sits there.
 * The catalogue (shared/catalog.js) takes its headroom values from here.
 */
export const NEUFERT = {
  bedHeight: 0.5, // top of the mattress
  sittingUpAboveBed: 1.0, // head of a person sitting up, above the mattress
  headSit: 1.5, // so: clear height over the head end of a bed
  headZone: 0.9, // the part of the bed (from the head end) a person sits up in
  bedFoot: 1.0, // over the rest of the bed, knees and feet
  standing: 1.8, // beside a bed, in front of a wardrobe, in front of a WC
  basinStanding: 1.9, // leaning over the basin
  showerStanding: 2.0, // inside the shower
  sideOfBed: 0.6, // free floor beside a bed (0.5 for a single in a tight room)
  footOfBed: 0.5,
  wardrobeFront: 0.8,
  deskFront: 0.9,
  wcFront: 0.6,
  basinFront: 0.6,
  circulation: 0.9, // clear walkway, one person
  doorLeaf: 0.9, // door width of rooms (0.885 clear opening for DIN 18101 0.9 m)
};

// ---------------------------------------------------------------- graph: functional adjacency and circulation

/**
 * Wanted and unwelcome neighbours between room types, the way layouts are described as graphs (nodes = rooms, edges = shared wall or door).
 * kind 'want': the two should share a wall (finding if not); 'avoid': no door should lead straight from one into the other.
 */
// Every rule carries its evidence, measured on the real flats of the Modified Swiss Dwellings (shared/links.js): a 'want' needs at least half of the flats that have both rooms to do it, an 'avoid' at most a
// tenth of the real rooms to have such a door (server/test/links.test.js holds the rules to that). MSD has no child room (a bedroom there) and no WC (a small bath there).
const wantEvidence = (a, b) => { const w = wallShare(a, b); return { share: w.share, flats: w.flats, measure: 'of the flats that have both, they share a wall of 0.9 m' }; };
const avoidEvidence = (a, b) => ({ share: doorShare(a, b), flats: FLATS, measure: 'of the real rooms, a door straight into the other' });
export const ADJACENCY = [
  { a: 'bath', b: 'bedroom', kind: 'want', evidence: wantEvidence('bath', 'bedroom'), why: `Bathroom next to the sleeping rooms (one plumbing stack, a short night-time way): in ${pct(wantEvidence('bath', 'bedroom').share)} of real flats a bath shares a wall with a bedroom.` },
  { a: 'bath', b: 'child', kind: 'want', evidence: wantEvidence('bath', 'child'), why: `Bathroom next to the children's room: in ${pct(wantEvidence('bath', 'child').share)} of real flats a bath shares a wall with a bedroom.` },
  { a: 'kitchen', b: 'living', kind: 'want', evidence: wantEvidence('kitchen', 'living'), why: `Kitchen and living room belong together: in ${pct(wantEvidence('kitchen', 'living').share)} of real flats they share a wall.` },
  { a: 'bath', b: 'kitchen', kind: 'avoid', evidence: avoidEvidence('bath', 'kitchen'), why: `Bathroom door straight into the kitchen (hygiene and noise): only ${pct(avoidEvidence('bath', 'kitchen').share)} of real baths have one.` },
  { a: 'bath', b: 'living', kind: 'avoid', evidence: avoidEvidence('bath', 'living'), why: `Bathroom door straight into the living room: only ${pct(avoidEvidence('bath', 'living').share)} of real baths have one.` },
  { a: 'wc', b: 'kitchen', kind: 'avoid', evidence: avoidEvidence('wc', 'kitchen'), why: `WC door straight into the kitchen: only ${pct(avoidEvidence('wc', 'kitchen').share)} of real baths and WCs have one.` },
];

/** Circulation: space syntax reads a plan as a justified graph from the entrance; depth = doors to pass. */
export const CIRCULATION = { maxDepthSleeping: 2, noThroughSleeping: true, source: 'Hillier and Hanson, The Social Logic of Space (1984)' };

// ---------------------------------------------------------------- datasets (described, not used)

export const DATASETS = [
  { name: 'RPLAN', ref: 'Wu, Fu, Tang, Zhao, Zhang: Data-driven interior plan generation for residential buildings, SIGGRAPH Asia 2019', what: 'about 80,000 residential floor plans as room boxes with doors and windows', used: false },
  { name: 'LIFULL HOME\'S dataset', ref: 'LIFULL Co., Ltd. (research access via the National Institute of Informatics, Japan)', what: 'millions of real-estate floor plan images', used: false },
  { name: 'FloorNet', ref: 'Liu, Wu, Kohli, Furukawa: FloorNet, ECCV 2018', what: 'floor plan reconstruction from 3D scans (vector plans and annotations)', used: false },
  { name: 'ArchGraph and other spatial-graph collections', ref: 'research repositories; no single dataset was verified for this project', what: 'layouts as directed graphs with edge constraints: adjacency, accessibility, wall sharing', used: false },
];

// ---------------------------------------------------------------- the text for the language model

/** A short rulebook for the prompts. Plain text, English; the model answers in the language of the user. */
export function rulebook() {
  return [
    'Planning knowledge to respect when you read a brief or a sketch of an attic flat:',
    `- Living area (WoFlV): floor with clear height of ${WOFLV.fullFrom} m or more counts fully, ${WOFLV.halfFrom} to ${WOFLV.fullFrom} m counts ${Math.round(WOFLV.halfFactor * 100)} %, below ${WOFLV.halfFrom} m not at all.`,
    `- Building code (typical, differs by state): a habitable room under the roof needs ${LBO.atticHeight} m clear height over at least ${Math.round(LBO.atticShare * 100)} % of its floor; windows of at least 1/8 of the floor area; doors ${LBO.doorClearHeight} m high.`,
    `- A bed needs ${NEUFERT.headSit} m clear height over its head end (to sit up) and ${NEUFERT.bedFoot} m over the rest, ${NEUFERT.sideOfBed} m free floor beside it. Put the head against a partition or gable wall, not under the low knee wall.`,
    `- Wardrobes and WC need ${NEUFERT.standing} m to stand in front; a basin ${NEUFERT.basinStanding} m; a shower ${NEUFERT.showerStanding} m inside. Wet pieces stand together in the high part of the bathroom.`,
    '- Doors open into the room behind them, hinged next to a wall end so the open leaf lies against the wall; no furniture inside the swing.',
    `- Graph rules, measured on ${FLATS.toLocaleString('en')} real flats: a bathroom next to the bedrooms (it shares a wall with one in ${pct(wallShare('bath', 'bedroom').share)} of the flats), the kitchen next to the living room (${pct(wallShare('kitchen', 'living').share)}), no bathroom door straight into the kitchen or the living room (${pct(doorShare('bath', 'kitchen'))} and ${pct(doorShare('bath', 'living'))} of real baths have one), no bedroom you must walk through, every room one or two doors from the stair hall (${pct(roomWallShare('bath', 'hall'))} of real baths and ${pct(roomWallShare('bedroom', 'hall'))} of real bedrooms share a wall with the hall).`,
  ].join('\n');
}

/** Everything as one list, for the docs and for tests that every source is named. */
export const KNOWLEDGE = [
  { id: 'woflv', kind: 'statute', source: WOFLV.source, verify: WOFLV.verify, rule: '100 % from 2.0 m, 50 % from 1.0 m, 0 below', used: 'shared/engine.js DEFAULT_RULES, shared/plans.js countedArea' },
  { id: 'lbo-attic-height', kind: 'statute', source: LBO.source, verify: true, rule: `${LBO.atticHeight} m over at least ${LBO.atticShare * 100} % of the floor of a habitable attic room`, used: 'shared/plans.js scorePlan finding "lbo-height"' },
  { id: 'lbo-window', kind: 'statute', source: LBO.source, verify: true, rule: 'window area at least 1/8 of the floor area', used: 'documented; the plan check asks for a gable wall or dormer as daylight' },
  { id: 'lbo-door', kind: 'statute', source: LBO.source, verify: true, rule: `door opening ${LBO.doorClearHeight} m high, ${LBO.doorClearWidth} m wide at least`, used: 'shared/doors.js, shared/rules.js factCheckRoom' },
  { id: 'neufert-bed', kind: 'standard', source: 'Neufert, Bauentwurfslehre (bedroom)', rule: `${NEUFERT.headSit} m over the head end, ${NEUFERT.bedFoot} m over the rest, ${NEUFERT.sideOfBed} m beside`, used: 'shared/catalog.js, shared/engine.js evalOne' },
  { id: 'neufert-standing', kind: 'standard', source: 'Neufert, Bauentwurfslehre (bathroom, storage)', rule: `${NEUFERT.standing} m in front of wardrobe and WC, ${NEUFERT.basinStanding} m at the basin, ${NEUFERT.showerStanding} m in the shower`, used: 'shared/catalog.js useH' },
  { id: 'adjacency', kind: 'graph', source: 'functional adjacency graphs', rule: `${ADJACENCY.length} wanted and unwelcome neighbours`, used: 'shared/plans.js scorePlan findings "adjacency"' },
  { id: 'circulation', kind: 'graph', source: CIRCULATION.source, rule: 'depth from the stair hall, no through-rooms to bedrooms', used: 'shared/plans.js access score' },
];
