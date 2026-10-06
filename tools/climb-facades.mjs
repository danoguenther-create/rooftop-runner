/** Continuous, physical masonry courses connect every solid building facade to its roof. */
export function addClimbFacades(boxes){
 const sources=boxes.filter(b=>{
  const [w,h,d]=b.size,tag=b.tag??'';
  if(b.solid===false||b.invisible||b.pos[1]<.4||h<2.4)return false;
  if(/stair|fence|gate|door|column|sewer/.test(tag))return false;
  return Math.min(w,d)>=2 || (Math.min(w,d)>=.4&&Math.max(w,d)>=4&&h>=3);
 });
 const courses=[];
 for(const b of sources){
  const [w,h,d]=b.size,bottom=b.pos[1]-h/2,top=b.pos[1]+h/2;
  const levels=[];
  if(bottom>.4)levels.push(bottom+.18);
  for(let y=1.8;y<top-.3;y+=1.6)if(y>bottom+.12)levels.push(y);
  for(const y of levels){
   courses.push({pos:[b.pos[0],+((y-.055).toFixed(4)),b.pos[2]],size:[+(w+.5).toFixed(4),.11,+(d+.5).toFixed(4)],rotY:b.rotY??0,color:b.color??'#a5a094',style:'plain',tag:'climb-facade-course'});
  }
 }
 boxes.push(...courses);
 return{sources:sources.length,courses:courses.length};
}
