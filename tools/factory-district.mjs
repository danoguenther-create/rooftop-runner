/** An explorable industrial compound. Walls are assembled around real openings. */
export function addFactoryDistrict({boxes,rails,scenery}) {
  const colors={brick:'#81503e',steel:'#594b42',concrete:'#858779',rust:'#9b5f37',glass:'#496462'};
  const box=(pos,size,color=colors.concrete,tag,extra={})=>boxes.push({pos,size,color,style:color===colors.brick?'brick':'plain',tag,...extra});
  const detail=(pos,size,color)=>box(pos,size,color,undefined,{solid:false});
  const rail=(a,b,swing=false)=>rails.push({points:[a,b],swing});
  const sign=(x,y,z,text,color='#493d32')=>scenery.signs.push({x,y,z,text,color,side:1});
  box([162,-.5,0],[124,1,100],'#686e62','factory-ground');
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
  fence([126,-44],[212,-44]); fence([212,-44],[212,44]); fence([126,44],[212,44]);
  fence([126,-44],[126,26.2]); fence([126,29],[126,44]);
  box([126,3.6,27.6],[.12,2.8,2.8],colors.steel,'factory-hole-lintel',{invisible:true});
  for(let k=0;k<9;k++)box([126,3.7+(k%3)*.05,26.25+k*.32],[.035,2.5-(k%3)*.1,.035],colors.steel);
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
  // South wall: three industrial windows, only the central bay is open.
  box([168,1.05,10],[48,2.1,.5],colors.brick,'factory-window-base');
  box([168,7.35,10],[48,3.3,.5],colors.brick);
  let left=144;
  for(const x of [152,164,176,186]) {
    const lo=x-1.4,hi=x+1.4;
    box([(left+lo)/2,3.9,10],[lo-left,3.6,.5],colors.brick);
    box([x,2.07,10.32],[3.1,.18,1.05],'#a29c84',x===164?'factory-open-window-sill':undefined);
    box([x,5.75,10.06],[3.15,.2,.75],'#a29c84');
    if(x!==164){
      box([x,3.9,10],[2.8,3.6,.12],colors.glass);
      for(const xx of [x-.7,x,x+.7])box([xx,3.9,10.1],[.06,3.6,.08],colors.steel);
      box([x,3.9,10.1],[2.8,.06,.08],colors.steel);
    }
    left=hi;
  }
  box([(left+192)/2,3.9,10],[192-left,3.6,.5],colors.brick);
  box([144,4.5,-10],[.5,9,40],colors.brick);
  box([168,4.5,-30],[48,9,.5],colors.brick);
  // East wall door is a real clear opening, with the door leaf standing open.
  box([192,4.5,-26.15],[.5,9,7.7],colors.brick);
  box([192,4.5,-4.85],[.5,9,29.7],colors.brick);
  box([192,5.8,-21],[.5,6.4,2.6],colors.brick);
  box([193.1,1.3,-19.6],[2.2,2.6,.13],colors.rust,'factory-open-door-leaf',{rotY:.25});
  box([192,0,-21],[1,.06,2.6],'#b6ab90','factory-door-threshold');
  // Structural pillars, contrasting masonry courses and weathered panels.
  for(const x of [144,156,168,180,192]) {
    for(const z of [-30,10])box([x,4.6,z],[.55,9.2,.8],'#6f756b');
    box([x,8.8,-10],[.25,.38,40],colors.steel);
  }
  for(const y of [2.6,5.8,8.7]) box([143.7,y,-10],[.12,.18,40],'#666a60');
  for(let k=0;k<25;k++) {
    const x=145+(k*7.1)%46,z=-29+(k*4.3)%37;
    detail([x,.012,z],[1.2+(k%4),.018,1+(k%3)],k%2?'#666957':'#737467');
  }
  for(const x of [148,159,170,181,188]) {
    box([x,6.65,10.29],[3.8,2.1,.08],colors.glass);
    for(const dx of [-1.85,-.9,0,.9,1.85])box([x+dx,6.65,10.35],[.06,2.2,.07],colors.steel);
    box([x,6.65,10.35],[3.8,.06,.07],colors.steel);
    box([x,5.53,10.4],[4,.18,.8],'#8e8c76');
  }
  for(const x of [148,188])for(const z of [-20,-10,0])box([x,1.6,z],[.3,3.2,.3],colors.steel);
  for(const x of [153,164,176,184])box([x,3.2,-25],[.35,6.4,.35],colors.steel);
  for(let i=0;i<3;i++)box([155+i*3.1,(3.8+i*.8)/2,-22],[.32,3.8+i*.8,.32],colors.steel);
  // Roof strips with a collapsed skylight over the central route.
  for(const [x,w] of [[149,10],[163,10],[179,10],[189,6]]) {
    box([x,9.15,-20],[w,.22,20],'#666f69');
    box([x,9.15,6],[w,.22,8],'#666f69');
    if(x!==163)box([x,9.15,-5],[w,.22,10],'#666f69');
    box([x-w/2,9.65,-10],[.18,1.1,40],colors.steel);
  }
  // Mezzanines, a broken walkway and alternating stepping machinery.
  box([148,3.2,-10],[7,.25,32],'#7e8074','factory-low-mezzanine');
  box([168,6.4,-25],[36,.25,3],'#828577','factory-high-catwalk');
  box([188,3.2,-5],[6,.25,22],'#7e8074');
  for(const x of [154,158,162,166,170]) {
    const y=.65+((x-154)/4)%3*.45;
    box([x,y,-8],[2.2,y*2,2.0],colors.rust,'factory-machine');
    box([x,y*2+.1,-8],[2.45,.2,2.2],'#5d6660');
    for(const z of [-8.95,-7.05])box([x,y,z],[1.7,.08,.06],'#c1a45e');
  }
  for(let i=0;i<3;i++)box([149,0.5+i*.7,-18+i*2.6],[2.3,1+i*1.4,2],i%2?colors.rust:'#656b60');
  for(let i=0;i<3;i++)box([155+i*3.1,3.8+i*.8,-22],[2.5,.25,2.8],'#8b8670');
  box([177,.46,-16],[8,.92,1.0],'#61665c','factory-speed-vault');
  for(const z of [-12,-7,-2])rail([173,5.5,z],[183,5.5,z],true);
  rail([152,3.85,-19],[152,3.85,0]);
  rail([153,7.15,-24],[183,7.15,-24]);
  rail([176,1.4,-16],[180,1.4,-16]);
  // Open doorway into a second building on the yard's southern side.
  box([186.5,-.02,30],[27,.12,16],'#8f907e');
  box([186.5,2.3,22],[27,4.6,.45],colors.brick);
  box([186.5,2.3,38],[27,4.6,.45],colors.brick);
  box([200,2.3,30],[.45,4.6,16],colors.brick);
  for(const z of [25,35])box([173,2.3,z],[.45,4.6,6],colors.brick);
  box([173,3.6,30],[.45,2,4],colors.brick);
  box([186.5,4.65,30],[27,.2,16],'#626d64','factory-workshop-roof');
  for(let k=0;k<5;k++)box([179+k*3.5,.4+(k%2)*.2,30],[1.6,.8+(k%2)*.4,1.4],colors.steel);
  rail([180,2.9,27],[194,2.9,27],true);
  // Yard routes: stacked supplies lead to the open window and workshop roof.
  box([164,.55,12.5],[2.1,1.1,2.0],colors.rust,'factory-window-approach');
  for(const [x,y,z] of [[166,.5,34],[169,1.05,36],[172,1.65,39]])box([x,y,z],[2.3,y*2,2.3],'#827358');
  for(let i=0;i<12;i++)box([204,.75+i*1.5,-30],[3.6,1.48,3.6],i%2?'#714b3c':'#845944');
  for(let k=0;k<5;k++) {
    const x=136+k*3.1;
    box([x,.4,16],[2.1,.8,1.2],k%2?colors.rust:'#797f69');
  }
  scenery.industrial ??= [];
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
  scenery.trees.push({x:132,z:24,scale:.65,palm:false},{x:208,z:35,scale:.9,palm:false});
  sign(168,7.6,10.4,'QUAY IRONWORKS  /  1948');
  sign(186,3.4,38.3,'WORKSHOP 02');
  sign(154,2.2,-29.65,'NO POWER  /  WATCH YOUR STEP');
  sign(113,2.1,36,'IRONWORKS  >');
}
