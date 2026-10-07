/** Schema der Level-JSON-Dateien in public/levels/. */

export type Vec3 = [number, number, number];

/**
 * Darstellungs-Stil einer Box (Task 17b). Boxen mit `style` landen unabhängig
 * von ihrer Größe im Stadt-Batch: ein InstancedMesh pro Stil, Größe und Farbe
 * stecken in der Instanz. Das hält die Draw-Calls konstant, egal wie viel
 * Stadtmöblierung dazukommt.
 *
 * - `plain`: keine Textur, nur Farbe (Bordsteine, Autos, Mobiliar, Sockel)
 * - `windows-*`: Fensterraster auf den Seitenflächen, Dach/Boden bleiben glatt
 */
export type BoxStyle = 'city-plaster' | 'city-concrete' | 'city-asphalt' | 'city-metal' | 'city-wood' | 'city-damp' | 'city-glass' | 'city-sand' | 'mill-brick' | 'mill-concrete' | 'mill-metal' | 'mill-glass' | 'plain' | 'brick' | 'windows-grid' | 'windows-strip' | 'windows-mixed';

export interface BoxData {
  tag?: string;
  pos: Vec3;
  size: Vec3;
  rotY?: number;
  color?: string;
  /** Gleiche size+color werden zu einem InstancedMesh gebündelt (Task 17) */
  instanced?: boolean;
  /** Stadt-Batch mit Instanz-Größe und -Farbe statt Größen-Gruppierung (17b) */
  style?: BoxStyle;
  /** false = nur Deko: kein Collider, keine Deckfläche (Skyline-Kulisse) */
  solid?: boolean;
  /** Collision proxy for detailed scenery. */
  invisible?: boolean;
}

export interface RampData {
  pos: Vec3;
  size: Vec3;
  rotY?: number;
  /** Neigung um die lokale X-Achse in Radiant */
  tiltX?: number;
  color?: string;
}

export interface RailData {
  swing?: boolean;
  points: Vec3[];
}

export type MarkerType =
  | 'gap'
  | 'precision'
  | 'checkpoint'
  | 'collectible'
  | 'finish'
  | 'trialStart';

export interface MarkerData {
  type: MarkerType;
  pos: Vec3;
  size?: Vec3;
  id?: string;
}

export interface LevelData {
  scenery?: {
    industrial?: { kind: "barrel" | "pipe" | "compressor" | "sewer-light"; pos: Vec3; length?: number }[];
    /** `kind` marks the west bank's house types (tools/west-bank.mjs); absent on the old grid. */
    buildings: { x:number; z:number; width:number; depth:number; height:number; color:string; variant:number; stairSide:number; kind?:'highrise'|'office'|'townhouse'|'villa'|'lone'; look?:'turret'|'brick'|'glass'|'pavilion'; sign?:string; interior?:HouseInterior }[];
    /** Open water: falling in puts the runner back on the bank (PlayerController). */
    water?: { x0:number; x1:number; z0:number; z1:number; y:number }[];
    /** Steel members between two points (truss diagonals, masts); physical from r 0.04. */
    struts?: { a:Vec3; b:Vec3; r:number; color?:string }[];
    /** Hollow infills between houses and the landmark towers (roof hatch only). */
    infills?: { x:number; z:number; width:number; depth:number; height:number; interior?:HouseInterior }[];
    towers?: { x:number; z:number; width:number; depth:number; height:number; interior?:HouseInterior }[];
    /** Hollow roof annexes and stair sheds with one open doorway. */
    rooms?: { x:number; z:number; width:number; depth:number; base:number; height:number; door:{ face:'x'|'z'; side:number; u:number } }[];
    cars: { x:number; z:number; color:string }[];
    trees: { x:number; z:number; scale:number; palm:boolean }[];
    lamps: { x:number; z:number; side:number }[];
    signs: { x:number; y:number; z:number; text:string; color:string; side?:number }[];
  };
  name: string;
  spawn: Vec3;
  boxes: BoxData[];
  ramps: RampData[];
  rails: RailData[];
  markers?: MarkerData[];
  /** Medaillen-Zielzeiten fürs Zeitrennen in ms (Task 19) */
  trialTimes?: { gold: number; silver: number; bronze: number };
}

/** Enterable house (tools/city-interiors.mjs): storeys, stair core and the few open entrances. */
export interface HouseOpening { face:'x'|'z'; side:number; u:number; row:number; floor:number; top?:number; door?:boolean }
export interface HouseInterior {
  floors:number[];
  roofAccess:boolean;
  core:{ sx:number; sz:number; xi:number; zi:number; zl:number; zh:number; ze:number; laneA:number[]; laneB:number[]; hole:{x0:number;x1:number;z0:number;z1:number} };
  openings:HouseOpening[];
}
