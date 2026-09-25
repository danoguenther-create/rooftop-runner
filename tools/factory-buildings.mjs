/** Traversable factory interiors. All large shapes have matching collision. */
export function buildFactoryBuildings({box,detail,rail,sign,colors}) {
  const concrete='#858779',steel=colors.steel;
  function window(x,y,z,w,h){
    detail([x,y,z],[w,h,.09],'#394d4c');
    for(const dx of [-w/2,0,w/2])detail([x+dx,y,z+.07],[.07,h+.1,.12],steel);
    for(const dy of [-h/2,0,h/2])detail([x,y+dy,z+.07],[w,.07,.12],steel);
    detail([x,y-h/2-.08,z+.12],[w+.3,.16,.4],'#aca48e');
  }
  function stairs(x,z,base,rise,count,width,direction,tag){
    const tread=.45;
    for(let i=0;i<count;i++){
      const h=rise*(i+1)/count;
      box([x,base+h/2,z+direction*(i+.5)*tread],[width,h,tread+.012],concrete,tag);
      detail([x,base+h+.008,z+direction*(i+.9)*tread],[width,.015,.065],'#c3b792');
    }
  }
  function pipe(x,y,z,length){
    // Flanged utility lines with wall saddles, kept above the running routes.
    detail([x,y,z],[.18,.18,length],'#796851');
    for(let d=-length/2+.8;d<length/2;d+=3){
      detail([x,y,z+d],[.28,.28,.1],'#434a45');
      detail([x-.15,y-.12,z+d],[.48,.12,.13],steel);
    }
  }
  // Main mill: ground + three upper storeys, 6.65 m clear below slabs.
  box([144,14,-10],[.5,28,40],colors.brick,'factory-main-west');
  box([192,14,-10],[.5,28,40],colors.brick,'factory-main-east');
  box([168,14,-30],[48,28,.5],colors.brick,'factory-main-back');
  box([168,1.7,10],[48,3.4,.5],colors.brick,'factory-window-base');
  box([168,17.2,10],[48,21.6,.5],colors.brick);
  box([153.3,4.9,10],[18.6,3,.5],colors.brick);
  box([178.7,4.9,10],[26.6,3,.5],colors.brick);
  box([164,3.4,10.3],[3.1,.18,1.05],'#a29c84','factory-open-window-sill');
  // Offset approach: turn from the low pallet to the loading block before jumping.
  box([161,.45,15],[2.4,.9,2.4],colors.rust,'factory-window-step');
  box([164,1,13],[2.3,2,2.3],colors.steel,'factory-window-approach');
  box([192.3,1.4,-21],[.1,2.8,3],steel,'factory-boarded-door');
  for(let k=0;k<5;k++)box([192.4,.3+k*.55,-21],[.13,.3,3.3],'#897357');
  for(let floor=0;floor<4;floor++){
    const y=floor*7;
    if(floor){
      // Broad floor and front wing surround the open, stacked stairwell.
      box([162,y-.175,-10],[36,.35,40],concrete,'factory-storey-floor');
      box([186,y-.175,-1.5],[12,.35,23],concrete,'factory-storey-floor');
    }
    if(floor<3){
      stairs(183,-25,y,3.5,20,3,1,'factory-main-stair');
      box([185.5,y+3.325,-14.5],[8,.35,3],concrete,'factory-main-half-landing');
      stairs(188,-16,y+3.5,3.5,20,3,-1,'factory-main-stair');
      box([184,y+6.825,-26.5],[12,.35,3],concrete,'factory-main-landing');
    }
    for(const x of (floor?[150,162,174,188]:[150,156,174,188]))window(x,y+4.5,10.3,3.4,2.7);
    // Glazed bays on both side elevations, with matching interior recesses.
    for(const z of [-24,-14,-4,6])for(const x of [143.71,144.29,191.71,192.29]){
      detail([x,y+4.3,z],[.07,2.8,3.6],'#394d4c');
      for(const dz of [-1.8,0,1.8])detail([x,y+4.3,z+dz],[.12,2.9,.075],steel);
      for(const dy of [-1.4,0,1.4])detail([x,y+4.3+dy,z],[.12,.075,3.6],steel);
      detail([x,y+2.78,z],[.35,.15,3.9],'#aaa28b');
    }
    for(const x of [150,162,174,188])if(floor||x!==162)window(x,y+4.5,9.68,3.4,2.7);
    // Leave the actual entry clear; decorative windows use the other bays.
    for(const x of [150,162,174]){
      box([x,y+3.35,-20],[.45,6.7,.45],steel,'factory-main-column');
      detail([x,y+6.5,-10],[.3,.35,39],steel);
    }
    if(floor){
      // Guard the floor edge without blocking the stair landings at either end.
      for(const z of [-23,-20,-17])box([179.9,y+.55,z],[.08,1.1,.08],steel);
      box([179.9,y+1.1,-20],[.08,.08,9],steel);
      // Machinery islands and low hurdles leave generous camera corridors.
      for(const [x,z,h] of [[151,-9,1.4],[160,-3,.8],[172,-14,1.1]]){
        box([x,y+h/2,z],[3,h,2.2],floor%2?colors.rust:steel,'factory-upper-machine');
        detail([x,y+h+.12,z],[3.2,.24,2.4],'#727e76');
        for(let k=0;k<5;k++)detail([x-1+k*.5,y+h*.55,z+1.12],[.08,h*.55,.07],'#242f2d');
      }
      rail([154,y+3.9,-5],[164,y+3.9,-5],true);
      sign(178,y+2.4,-29.6,`MILL / LEVEL 0${floor}`);
    }
    pipe(145,y+5.8,-10,37);
    for(let k=0;k<18;k++){
      const x=147+(k*7.13)%29,z=-27+(k*5.27)%33;
      detail([x,y+.013,z],[.6+(k%4),.02,.7+(k%3)],k%2?'#5e655a':'#777b69');
    }
  }
  // Seal roof: no unintended shortcut into any floor.
  box([168,28.1,-10],[48,.2,40],'#606b63','factory-main-roof');
  for(const x of [150,162,174,188])for(const z of [-30,10])box([x,14,z],[.65,28,.7],'#6f756b');
  for(const y of [7,14,21,28])detail([168,y,10.38],[48,.25,.25],'#a09b86');
  for(const x of [149,160,172,185]){
    box([x,28.5,-12],[3,.8,9],'#737e79');
    detail([x,28.92,-12],[2.8,.06,8.8],'#455d60');
    for(let z=-16;z<=-8;z+=2)detail([x,28.97,z],[3,.08,.08],steel);
  }
  // Gutters, downpipes, coping and masonry repairs break up the large volume.
  for(const x of [144.4,191.6])box([x,28.55,-10],[.35,.9,40],'#72786e');
  for(const z of [-29.6,9.6])box([168,28.55,z],[47,.9,.35],'#72786e');
  for(const x of [146,190]){
    detail([x,14,10.5],[.18,28,.18],'#4f5e58');
    for(let y=1;y<28;y+=3)detail([x,y,10.5],[.35,.09,.3],steel);
    for(let k=0;k<5;k++)detail([x+.22+k*.1,2.2-k*.25,10.26],[.12,4-k*.5,.02],'#685441');
  }
  for(const floor of [0,7,14,21]){
    // Wall-mounted power cabinets, conduit and small inspection labels.
    box([145.1,floor+1.4,-17],[.65,1.8,1.3],'#65736c');
    detail([145.44,floor+1.55,-17],[.025,1.3,1],'#3f514d');
    detail([145.48,floor+1.8,-16.85],[.03,.13,.22],'#c9ac65');
    detail([145.1,floor+4,-17],[.09,3.5,.09],steel);
    // Timber pallets and sparse fallen masonry stay beside the circulation paths.
    for(let k=0;k<5;k++)detail([147.5+k*.22,floor+.16,-3],[.17,.14,1.5],'#86765b');
    for(const z of [-3.5,-2.5])box([148,floor+.07,z],[1.3,.14,.18],'#665c48');
    for(let k=0;k<6;k++)box([146.4+(k%3)*.32,floor+.07,1+Math.floor(k/3)*.4],[.25,.14,.33],'#745844',undefined,{rotY:k*.37});
  }
  sign(168,25.8,10.5,'QUAY IRONWORKS / 1948');
  // Ground-floor parkour routes and recognizable abandoned machinery.
  for(const x of [154,158,162,166,170]){
    const h=1.3+((x-154)/4)%3*.9;
    box([x,h/2,-8],[2.2,h,2],colors.rust,'factory-machine');
    box([x,h+.1,-8],[2.45,.2,2.2],'#5d6660');
  }
  box([177,.46,-16],[8,.92,1],steel,'factory-speed-vault');
  for(const z of [-12,-7,-2])rail([173,5.5,z],[179,5.5,z],true);
  rail([176,1.4,-16],[180,1.4,-16]);

  // Workshop: ONLY the roof hatch connects inside and outside.
  box([186.5,-.02,30],[27,.12,16],concrete);
  for(const z of [22,38])box([186.5,3.5,z],[27,7,.45],colors.brick,'factory-workshop-sealed-wall');
  for(const x of [173,200])box([x,3.5,30],[.45,7,16],colors.brick,'factory-workshop-sealed-wall');
  for(const x of [178,184,190,196])window(x,3.5,38.28,2.4,2.8);
  box([172.7,1.3,30],[.1,2.6,4],steel,'factory-workshop-boarded-door');
  for(let k=0;k<5;k++)box([172.6,.25+k*.51,30],[.14,.3,4.3],'#8f795b');
  // Open roof stairwell (188..192 / 30..37), with clear headroom above the flight.
  box([180.5,7,30],[15,.25,16],'#626d64','factory-workshop-roof');
  box([196,7,30],[8,.25,16],'#626d64','factory-workshop-roof');
  box([190,7,26],[4,.25,8],'#626d64','factory-workshop-roof');
  box([190,7,37.5],[4,.25,1],'#626d64','factory-workshop-roof');
  stairs(190,22.4,0,7,32,2.8,1,'factory-workshop-stair');
  for(let k=0;k<4;k++)box([179+k*2.3,.5,29],[1.5,1,1.5],steel);
  // Exterior climb: stacked freight, loading ledges, then the roof edge.
  for(const [x,y,z,w] of [[166,.55,34,2.3],[169,1.25,36,2.3],[172,2.1,40,2.5],[175,2.85,40,2.5],[178,3.55,40,3]])
    box([x,y,z],[w,y*2,2.4],colors.rust,'factory-workshop-roof-approach');
  box([194,7.65,30],[.2,1.1,4.5],steel); // folded hatch cover beside aperture
  for(const x of [176,182]){
    box([x,7.6,26],[1.8,1,2.8],'#748078');
    for(let k=0;k<6;k++)detail([x-.7+k*.28,8.12,26],[.08,.05,2.5],steel);
  }
  sign(186,5.8,38.35,'WORKSHOP / ROOF ACCESS');
  rail([179,4.6,27],[185,4.6,27],true);
}
