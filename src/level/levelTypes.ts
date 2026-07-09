/** Schema der Level-JSON-Dateien in public/levels/. */

export type Vec3 = [number, number, number];

export interface BoxData {
  pos: Vec3;
  size: Vec3;
  rotY?: number;
  color?: string;
  /** Gleiche size+color werden zu einem InstancedMesh gebündelt (Task 17) */
  instanced?: boolean;
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
  name: string;
  spawn: Vec3;
  boxes: BoxData[];
  ramps: RampData[];
  rails: RailData[];
  markers?: MarkerData[];
  /** Medaillen-Zielzeiten fürs Zeitrennen in ms (Task 19) */
  trialTimes?: { gold: number; silver: number; bronze: number };
}
