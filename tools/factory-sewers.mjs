/** Connected, genuinely underground passages; cut every overlapping ground slab. */
export function addFactorySewers({boxes,scenery}) {
  const box=(pos,size,color,tag,extra={})=>boxes.push({pos,size,color,style:'plain',tag,...extra});
  const detail=(pos,size,color)=>box(pos,size,color,undefined,{solid:false});
  const shafts=[
    {name:'MILL',x:158,z:-28},
    {name:'WORKSHOP',x:176,z:21},
    {name:'TURBINE',x:222,z:-45},
    {name:'BOILER',x:222,z:23},
    {name:'YARD',x:207,z:38},
  ];
  const holes=shafts.map(s=>({x0:s.x-1.8,x1:s.x+1.8,z0:s.z-.3,z1:s.z+14.65}));
  function cut(rect,hole){
    const x0=Math.max(rect.x0,hole.x0),x1=Math.min(rect.x1,hole.x1),z0=Math.max(rect.z0,hole.z0),z1=Math.min(rect.z1,hole.z1);
    if(x0>=x1||z0>=z1)return[rect];
    return [
      {...rect,x1:x0},{...rect,x0:x1},
      {...rect,x0,x1,z1:z0},{...rect,x0,x1,z0:z1},
    ].filter(r=>r.x1-r.x0>.001&&r.z1-r.z0>.001);
  }
  function carve(b){
    let parts=[{x0:b.pos[0]-b.size[0]/2,x1:b.pos[0]+b.size[0]/2,z0:b.pos[2]-b.size[2]/2,z1:b.pos[2]+b.size[2]/2}];
    for(const hole of holes)parts=parts.flatMap(r=>cut(r,hole));
    return parts.map(r=>({...b,pos:[(r.x0+r.x1)/2,b.pos[1],(r.z0+r.z1)/2],size:[r.x1-r.x0,b.size[1],r.z1-r.z0]}));
  }
  const ground=boxes.splice(0);
  for(const b of ground){
    const top=b.pos[1]+b.size[1]/2;
    // Thin floor decals also need holes; leave every upper floor intact.
    if(!b.rotY&&top<=.2&&top>=-1.2&&b.pos[1]-b.size[1]/2<.15)boxes.push(...carve(b));
    else boxes.push(b);
  }
  // The boiler's old machine occupies the new stair-head landing.
  for(let i=boxes.length-1;i>=0;i--){
    const b=boxes[i];if(Math.abs(b.pos[0]-222)<.1&&Math.abs(b.pos[2]-35)<.1&&b.pos[1]<2)boxes.splice(i,1);
  }
  const cells=new Set(),key=(x,z)=>`${x},${z}`;
  function corridor(x0,x1,z0,z1){for(let x=x0;x<x1;x+=2)for(let z=z0;z<z1;z+=2)cells.add(key(x,z));}
  corridor(154,228,14,20);
  corridor(154,162,-30,20);
  corridor(172,180,18,40);
  corridor(218,226,-48,40);
  corridor(202,212,18,56);
  for(const k of cells){
    const [x,z]=k.split(',').map(Number);
    box([x+1,-6.7,z+1],[2,.4,2],'#505a51','sewer-floor');
    const roof={pos:[x+1,-1.1,z+1],size:[2,.4,2],color:'#62675e',style:'plain',tag:'sewer-roof'};
    boxes.push(...carve(roof));
    for(const [dx,dz] of [[-2,0],[2,0],[0,-2],[0,2]])if(!cells.has(key(x+dx,z+dz))){
      box([x+1+dx/2,-3.6,z+1+dz/2],[dx?.25:2,5.8,dz?.25:2],'#626b58','sewer-wall');
      // Damp tide mark, pipework and block courses on tunnel boundaries.
      detail([x+1+dx*.47,-5.6,z+1+dz*.47],[dx?.035:2,.75,dz?.035:2],'#394b3e');
      detail([x+1+dx*.43,-2.2,z+1+dz*.43],[dx?.16:2,.16,dz?.16:2],'#766047');
      for(const y of [-5,-3.8,-2.6])detail([x+1+dx*.46,y,z+1+dz*.46],[dx?.04:2,.035,dz?.04:2],'#414c42');
    }
  }
  for(const s of shafts){
    for(let i=0;i<40;i++){
      const h=(i+1)*6.5/40;
      box([s.x,-6.5+h/2,s.z+(i+.5)*.36],[3.2,h,.372],'#82877b',`sewer-stair-${s.name.toLowerCase()}`);
      detail([s.x,-6.5+h+.012,s.z+(i+.95)*.36],[3.15,.02,.05],'#c0b589');
    }
    // A full landing bridges the cut edge; the final riser needs support ahead
    // for the character controller's autostep sweep.
    box([s.x,-.1,s.z+14.9],[3.6,.2,1],'#82877b','sewer-upper-landing');
    // Above the tunnel ceiling the stair shaft still needs retaining walls.
    for(const side of [-1,1])box([s.x+side*1.95,-.4,s.z+5.85],[.3,2,12.3],'#687165','sewer-shaft-wall');
    scenery.signs.push({x:s.x,y:-3.1,z:s.z-.7,text:`${s.name} / ACCESS`,color:'#688477',side:1});
  }
  // Shallow drainage trough visually separates the two broad walking margins.
  for(let x=156;x<226;x+=4)detail([x+1,-6.48,17],[3.8,.025,.55],'#314d49');
  for(const x of [158,176,194,207,222]){
    scenery.industrial.push({kind:'sewer-light',pos:[x,-1.65,17]});
    scenery.signs.push({x,y:-3.4,z:19.83,text:x<190?'MILL / WORKSHOP  <':'TURBINE / BOILER  >',color:'#769581',side:1});
  }
  for(const [x,z] of [[160.6,-18],[158,0],[178.6,29],[224.6,-36],[222,-16],[222,1],[224.6,29],[207,34],[209.6,48]])
    scenery.industrial.push({kind:'sewer-light',pos:[x,-1.65,z]});
  // Yard stair entry: visible framing and a folded cover, no ladder-only trap.
  box([210,.25,51],[.2,.5,4],'#445950','sewer-open-cover');
  scenery.signs.push({x:207,y:1.8,z:54.7,text:'DRAINAGE / SERVICE ACCESS',color:'#586957',side:1});
}
