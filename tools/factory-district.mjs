import { buildFactoryBuildings } from './factory-buildings.mjs';
/** An explorable industrial compound. Walls are assembled around real openings. */
export function addFactoryDistrict({boxes,rails,scenery}) {
  const colors={brick:'#81503e',steel:'#594b42',concrete:'#858779',rust:'#9b5f37',glass:'#496462'};
  const box=(pos,size,color=colors.concrete,tag,extra={})=>boxes.push({pos,size,color,style:color===colors.brick?'brick':'plain',tag,...extra});
  const detail=(pos,size,color)=>box(pos,size,color,undefined,{solid:false});
  const rail=(a,b,swing=false)=>rails.push({points:[a,b],swing});
  const sign=(x,y,z,text,color='#493d32')=>scenery.signs.push({x,y,z,text,color,side:1});
  box([196,-.5,2.5],[156,1,133],'#686e62','factory-ground');
  box([168,-.05,-10],[48,.1,40],'#85877e','factory-floor');
  // Perimeter: high steel mesh, a locked gate, one broken panel behind the yard.
  function fence(a,b,gap=false){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    const middle=[(a[0]+b[0])/2,2.5,(a[1]+b[1])/2];
    box(middle,[dx?length:.12,5,dz?length:.12],colors.steel, gap?'factory-broken-fence-upper':'factory-fence',{invisible:true});
    for(let d=0;d<=length;d+=.32) box([a[0]+ux*d,2.5,a[1]+uz*d],[.035,5,.035],d%2<1?'#575c53':'#655448');
    for(const y of [.15,2.5,4.95]) box([middle[0],y,middle[2]],[dx?length:.07,.07,dz?length:.07],colors.steel);
    for(let d=0;d<=length;d+=4)box([a[0]+ux*d,2.6,a[1]+uz*d],[.13,5.2,.13],colors.steel);
  }
  fence([126,-60],[270,-60]); fence([270,-60],[270,65]); fence([126,65],[270,65]);
  fence([126,-60],[126,27.1]); fence([126,28.2],[126,65]);
  box([126,3.525,27.65],[.12,2.95,1.1],colors.steel,'factory-hole-lintel',{invisible:true});
  for(let k=0;k<4;k++)box([126,3.6,27.12+k*.32],[.035,2.8,.035],colors.steel);
  box([125,.12,28],[2.1,.07,1.6],colors.steel,undefined,{rotY:.25});
  // Loose panels and storage obscure the opening from the main road.
  box([123.5,.65,22.3],[3.2,1.3,2.4],colors.rust,'factory-entry-crate');
  box([129,.15,28],[2,.3,1.7],'#a19a83');
  box([125.8,1.8,-8],[.18,3.6,7],'#635f52','factory-locked-gate');
  for(const z of [-11.5,-4.5])box([125.8,3,z],[.4,6,.4],colors.brick);
  sign(126,5.6,-3.8,'QUAY IRONWORKS');
  sign(123.4,1.1,21,'KEEP OUT');
  // The industrial outskirts continue under the distant skyline.
  box([260,-.57,-25],[350,1,250],'#737968','industrial-outskirts');
  buildFactoryBuildings({box,detail,rail,sign,colors});
  for(let i=0;i<12;i++)box([204,.75+i*1.5,-30],[3.6,1.48,3.6],i%2?'#714b3c':'#845944');
  for(let k=0;k<5;k++) {
    const x=136+k*3.1;
    box([x,.4,16],[2.1,.8,1.2],k%2?colors.rust:'#797f69');
  }
  // Boarded gate and concealed, just walkable gap (no crouch mechanic required).
  for(let k=0;k<6;k++)box([125.61,.3+k*.55,-8],[.12,.28,7.5],'#8c7454');
  for(const z of [24.7,30.6])box([123.5,1.2,z],[3,2.4,3.7],'#5c695e','factory-gap-screen');
  // A staggered salvaged panel hides the breach: approach from the north,
  // turn into the narrow aisle, then turn again toward the actual fence gap.
  box([120.5,1.4,27.65],[.5,2.8,4],colors.steel,'factory-entry-screen');
  for(let k=0;k<9;k++)detail([120.22,1.4,25.8+k*.45],[.09,2.65,.08],'#796b57');
  // Alternate way in: supplies -> two containers -> crane service deck -> boom.
  for(const [x,y,z,w,d] of [[112,.45,-40,2.4,2.4],[115,1.2,-40,3,6],[119,2.4,-40,3,6]]) {
    box([x,y,z],[w,y*2,d],'#7a6950','factory-crane-step');
    for(let k=0;k<5;k++)box([x-w/2+.03,y,z-d/2+.5+k],[.07,y*1.7,.08],'#4e5e59');
  }
  box([122,2.6,-40],[1.1,5.2,1.1],'#a38a44','factory-crane-mast');
  box([122,5.25,-40],[2.8,.3,3.2],'#b69a4a','factory-crane-deck');
  box([130,5.5,-40],[14,.22,1.05],'#b49a49','factory-crane-boom');
  // Recognisable tower, cab, counterweight and hanging hook above the service route.
  for(const x of [121.4,122.6])for(const z of [-43,-41.8])box([x,4.7,z],[.16,9.4,.16],'#b29a48');
  for(let y=.5;y<9.5;y+=1.2)for(const z of [-43,-41.8])box([122,y,z],[1.4,.14,.14],'#8b7839');
  box([122,7.5,-43.8],[2.1,2.1,2.1],'#9d8744','factory-crane-cab');
  box([122,7.7,-42.72],[1.6,1.1,.08],'#4b6668');
  box([128,9.5,-42.4],[27,.25,1.5],'#ab9245');
  box([116,9.8,-42.4],[3,1,2],'#686b61');
  for(let x=116;x<142;x+=2)box([x,9.1,-42.4],[.13,1,.13],'#756632');
  box([139,6.7,-42.4],[.065,5.2,.065],colors.steel);
  box([139,4.12,-42.4],[.8,.16,.18],'#aaa079');
  box([139.35,4.35,-42.4],[.13,.55,.18],'#aaa079');
  for(const x of [124,127,130,133,136])box([x,6.15,-40.6],[.12,1.3,.12],'#655e3a');
  box([130,6.8,-40.6],[14,.12,.12],'#76693c');
  box([136,3.3,-40],[3.2,.4,3.2],'#727c66','factory-crane-landing');
  for(const x of [134.6,137.4])box([x,1.55,-40],[.15,3.1,.15],colors.steel);
  // Larger eastern works: two more window-only buildings and a loading yard.
  function annex(cx,cz,w,d,height,title,upper=false){
    const front=cz+d/2,back=cz-d/2,opening=3,sill=upper?7.6:2.4;
    box([cx,-.03,cz],[w,.1,d],'#82877a');
    box([cx-w/2,height/2,cz],[.5,height,d],colors.brick);
    box([cx+w/2,height/2,cz],[.5,height,d],colors.brick);
    box([cx,height/2,back],[w,height,.5],colors.brick);
    box([cx,sill/2,front],[w,sill,.5],colors.brick);
    box([cx,(height+sill+3)/2,front],[w,height-sill-3,.5],colors.brick);
    for(const sign of [-1,1])box([cx+sign*(w+opening)/4,sill+1.5,front],[(w-opening)/2,3,.5],colors.brick);
    box([cx,sill,front+.3],[3.2,.18,1.1],'#a69e88','factory-annex-window');
    if(upper){
      // Freight -> service shelf -> elevated window: no ground-floor opening.
      for(const [x,top,z] of [[cx-9,1.2,front+7],[cx-6,2.7,front+5],[cx-3,4.1,front+3.2],[cx,5.6,front+3.2]])
        box([x,top/2,z],[2.4,top,2.4],colors.rust,'factory-boiler-approach');
      // Stair opening preserves access to the otherwise sealed ground floor.
      box([cx-3,6.325,cz],[w-6.5,.35,d-.5],colors.concrete,'factory-boiler-upper-floor');
      box([cx+w/2-3,6.325,front-6.625],[5.5,.35,12.75],colors.concrete,'factory-boiler-upper-floor');
      for(let k=0;k<30;k++){
        const h=(k+1)*6.5/30;
        box([cx+w/2-3,h/2,back+2+(k+.5)*.45],[3,h,.46],colors.concrete,'factory-boiler-stair');
        detail([cx+w/2-3,h+.008,back+2+(k+.9)*.45],[3,.015,.06],'#c3b792');
      }
      box([cx+w/2-3,6.325,back+16.25],[5.5,.35,1.5],colors.concrete,'factory-boiler-stair-landing');
      for(const x of [cx-10,cx+10])box([x,7.2,cz],[3,1.4,3],colors.steel,'factory-boiler-upper-machine');
    } else box([cx-.5,.55,front+3.2],[2.3,1.1,2.2],colors.rust,'factory-annex-approach');
    box([cx,height+.08,cz],[w,.2,d],'#606b63');
    // Sealed service doors and visible timber make the intended route legible.
    box([cx+w/2+.27,1.4,cz],[.08,2.8,3],colors.steel);
    for(let k=0;k<5;k++)box([cx+w/2+.36,.3+k*.54,cz],[.16,.3,3.3],'#927757');
    for(let k=0;k<5;k++)box([cx-w/2+4+k*3,.55+k*.4,cz],[2,1.1+k*.8,2.3],k%2?colors.rust:colors.steel);
    box([cx,height-2.1,back+2.5],[w-2,.22,3],'#7d8273','factory-annex-catwalk');
    for(let k=0,top=1.2;top<height-2;top+=1.35,k++)box([cx-w/2+3+k*3,top/2,back+5],[2.3,top,2.4],'#767d69','factory-annex-access');
    for(const z of [cz-4,cz,cz+4])rail([cx+3,height-2.4,z],[cx+w/2-2,height-2.4,z],true);
    for(let k=0;k<5;k++){
      const x=cx-w/2+4+k*(w-8)/4;
      if(Math.abs(x-cx)<2)continue;
      box([x,height-1.8,front+.29],[2.4,1.5,.09],'#374b48');
      for(const dx of [-1.2,0,1.2])box([x+dx,height-1.8,front+.36],[.06,1.55,.07],colors.steel);
      box([x,height-1.8,front+.36],[2.4,.07,.07],colors.steel);
    }
    for(const x of [cx-w/2+5,cx+w/2-5])box([x,height+.45,cz],[2,.7,3.5],'#737a6a');
    sign(cx,height-1,front+.3,title);
  }
  annex(238,-27,40,42,11,'TURBINE HALL 03');
  annex(237,35,38,30,14,'BOILER HOUSE / UPPER WINDOW',true);
  for(const [x,z] of [[208,16],[212,-50],[251,11],[263,55]]) {
    box([x,1.3,z],[3.4,2.6,7],'#6d7362','factory-storage-container');
    for(let k=0;k<6;k++)box([x+1.73,1.3,z-3+k],[.07,2.3,.09],'#4c574a');
  }
  rail([199,4.8,6],[211,4.8,6],true);
  scenery.industrial ??= [];
  for(const floor of [0,7,14,21]){
    scenery.industrial.push({kind:'compressor',pos:[153,floor,-25]});
    for(const x of [147,148.1])scenery.industrial.push({kind:'barrel',pos:[x,floor,5]});
    scenery.industrial.push({kind:'pipe',pos:[164,floor+.4,-27],length:5});
  }
  for(let k=0;k<18;k++)scenery.industrial.push({kind:'barrel',pos:[k<9?136+(k%3)*1.1:182+(k%3)*1.1,0,k<9?-34+Math.floor(k/3)*1.1:16+Math.floor((k-9)/3)*1.1]});
  for(const [x,z,length] of [[143,36,7],[199,-8,6],[164,-27,4],[155,-5,5]])scenery.industrial.push({kind:'pipe',pos:[x,.4,z],length});
  for(let k=0;k<60;k++) {
    const x=130+(k*17.3)%78,z=k%2?-39+(k%5):40-(k%7);
    detail([x,.018,z],[2.5,.02,1.8],k%3?'#687452':'#75815b');
    for(let j=0;j<4;j++)box([x+j*.17,.18,z+(j%2)*.21],[.05,.36,.11],'#56664a',undefined,{solid:false});
  }
  for(const x of [154,158,162,166,170]) {
    const y=.65+((x-154)/4)%3*.45;
    box([x,y*2+.32,-8.5],[.6,.45,.45],'#3f514d');
    for(let k=0;k<7;k++)box([x-.7+k*.23,y,-6.98],[.06,y*1.35,.05],'#4b4941');
  }
  // Corrugated freight shells and corner castings make the climbing stacks
  // read as discarded industrial cargo instead of undecorated gameplay boxes.
  for(const cargo of boxes.filter(b=>/factory-(workshop-roof-approach|boiler-approach|window-approach|storage-container)/.test(b.tag??''))){
    const [x,y,z]=cargo.pos,[w,h,d]=cargo.size;
    for(let dx=-w/2+.2;dx<w/2;dx+=.32){
      detail([x+dx,y,z+d/2+.025],[.065,h-.15,.07],'#675c4b');
      detail([x+dx,y,z-d/2-.025],[.065,h-.15,.07],'#675c4b');
    }
    for(const side of [-1,1]){
      detail([x+side*(w/2-.05),y,z+d/2+.04],[.13,h,.1],'#b09a74');
      for(let top=.1;top<h;top+=2)detail([x,y-h/2+top,z+d/2+.05],[w,.1,.1],'#4d5751');
    }
  }
  scenery.trees.push({x:132,z:24,scale:.65,palm:false},{x:208,z:35,scale:.9,palm:false});
  sign(154,2.2,-29.65,'NO POWER  /  WATCH YOUR STEP');
  sign(113,2.1,36,'IRONWORKS  >');
}
