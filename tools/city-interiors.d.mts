/** Types for the runtime use of tools/city-interiors.mjs (police station). */
export interface HouseSpec { x:number; z:number; width:number; depth:number; height:number; color:string; variant:number; stairSide:number }
export interface Rect { x0:number; x1:number; z0:number; z1:number }
export interface HousePlan { roofAccess:boolean; floors:number[]; layout:{ hole:Rect; core:Rect } }
export function planHouse(b:HouseSpec, index:number, opts:{ hash:(a:number,b:number)=>number; obstacles:Rect[]; doorOpen?:boolean; roofAccess:boolean; windows?:boolean }):HousePlan;
export function buildHouse(b:HouseSpec, plan:HousePlan, box:(pos:[number,number,number],size:[number,number,number],color:string,tag:string,style?:string)=>void,
  opts?:{ style?:string; sideWalls?:boolean; ringFaces?:string[]; plinth?:boolean }):{ floors:number[] };
