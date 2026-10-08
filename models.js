import * as THREE from 'three';
export const OPENING = ['e2-e4','e7-e5','g1-f3','b8-c6','f1-c4','f8-c5','c2-c3'];
export const CATEGORY = {pawn:'design',bishop:'taste',knight:'experiment'};
export function openingPosition(){
 const back=['rook','knight','bishop','queen','king','bishop','knight','rook'];
 const pieces=[];
 for(let f=0;f<8;f++)for(const [rank,color,type] of [[1,'white',back[f]],[2,'white','pawn'],[7,'black','pawn'],[8,'black',back[f]]]){
  const from=String.fromCharCode(97+f)+rank;
  const move=OPENING.find(m=>m.startsWith(from));
  pieces.push({id:from,type,color,square:move?move.slice(3):from,active:!!move,category:CATEGORY[type]||null});
 }
 return pieces;
}
export function squarePosition(square){return new THREE.Vector3(square.charCodeAt(0)-97-3.5,0,3.5-(Number(square[1])-1))}
const latheCache=new Map();
function lathe(points){const key=JSON.stringify(points);if(!latheCache.has(key))latheCache.set(key,new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),128));return latheCache.get(key)}
export function createPiece(type,color){
 const group=new THREE.Group();
 const mat=new THREE.MeshStandardMaterial({color:color==='white'?0xffffff:0x292929,roughness:.5,metalness:.04,transparent:true});
 const add=(geo,x=0,y=0,z=0,material=mat)=>{const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=false;group.add(m);return m};
 add(lathe([[0,0],[.26,0],[.30,.025],[.315,.065],[.31,.1],[.285,.14],[.27,.17],[.265,.2],[.22,.24],[.19,.27],[.17,.3]]));
 if(type==='pawn'){
  add(lathe([[.18,.27],[.17,.32],[.14,.4],[.11,.51],[.10,.59],[.14,.63],[.18,.65],[.18,.69],[.12,.73]]));
  add(new THREE.SphereGeometry(.205,32,24),0,.89);
 }else if(type==='bishop'){
  add(lathe([[.18,.27],[.16,.36],[.13,.51],[.10,.69],[.13,.77],[.22,.81],[.22,.86],[.14,.90]]));
  const s=new THREE.Shape();s.moveTo(0,.91);s.bezierCurveTo(-.29,.99,-.23,1.19,-.04,1.43);s.lineTo(.015,1.36);s.lineTo(-.10,1.12);s.lineTo(-.055,1.10);s.lineTo(.065,1.31);s.bezierCurveTo(.3,1.08,.20,.97,0,.91);
  add(new THREE.ExtrudeGeometry(s,{depth:.15,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.04}),0,0,-.075);
  add(new THREE.SphereGeometry(.065,20,16),-.035,1.46);
 }else if(type==='knight'){
  add(lathe([[.19,.26],[.2,.30],[.20,.36],[.17,.39],[0,.39]]));
  const s=new THREE.Shape();s.moveTo(-.21,.37);s.bezierCurveTo(-.27,.63,-.22,.95,-.08,1.14);s.lineTo(-.12,1.43);s.lineTo(.025,1.34);s.lineTo(.13,1.43);s.lineTo(.19,1.20);s.lineTo(.34,1.02);s.lineTo(.38,.88);s.lineTo(.32,.81);s.lineTo(.10,.84);s.lineTo(.035,.94);s.bezierCurveTo(-.02,.79,.18,.62,.23,.38);s.closePath();
  add(new THREE.ExtrudeGeometry(s,{depth:.21,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.045,bevelThickness:.04}),0,0,-.105);
  const eyeMat=mat.clone();eyeMat.color.set(color==='white'?0x787b73:0x989d92);
  for(const z of [-.151,.151])add(new THREE.SphereGeometry(.024,12,8),.13,1.12,z,eyeMat);
 }else if(type==='rook'){
  add(lathe([[.18,.28],[.18,.45],[.18,.75],[.24,.83],[.25,.87],[.25,.96],[.19,.97],[.18,.85],[0,.85]]));
  for(let i=0;i<6;i++){const a=i*Math.PI/3;const m=add(new THREE.BoxGeometry(.13,.16,.12),Math.cos(a)*.19,1.015,Math.sin(a)*.19);m.rotation.y=-a;}
 }else{
  add(lathe([[.18,.27],[.17,.38],[.13,.57],[.12,.84],[.19,.90],[.23,.92],[.23,.98],[.14,1.01],[.15,1.12],[.22,1.24],[.22,1.3],[0,1.3]]));
  if(type==='queen'){
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7;add(new THREE.SphereGeometry(.057,16,12),.19*Math.cos(a),1.34,.19*Math.sin(a));}
   add(new THREE.SphereGeometry(.09,20,16),0,1.42);
  }else{
   add(new THREE.SphereGeometry(.11,24,16),0,1.38);
   add(new THREE.BoxGeometry(.075,.30,.075),0,1.59);
   add(new THREE.BoxGeometry(.23,.075,.075),0,1.62);
  }
 }
 group.userData.materials=[...new Set(group.children.map(m=>m.material))];
 return group;
}
export function createBoard(){
 const board=new THREE.Group();
 const mats=[0x000000,0xd9d7d2].map(color=>{
  const material=new THREE.MeshStandardMaterial({color,roughness:.95,metalness:0,transparent:true});
  material.userData.boardSurface=true;return material;
 });
 const geo=new THREE.BoxGeometry(.998,.10,.998);
 for(let z=0;z<8;z++)for(let x=0;x<8;x++){
  const tile=new THREE.Mesh(geo,mats[(x+z+1)%2]);tile.position.set(x-3.5,-.07,z-3.5);tile.receiveShadow=false;board.add(tile);
 }
 const edge=new THREE.MeshStandardMaterial({color:0x050505,roughness:.82,transparent:true});
 const underside=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,transparent:true});
 underside.userData.boardUnderside=true;
 underside.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying float vBoardDepth;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvBoardDepth = position.z;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying float vBoardDepth;')
   .replace('#include <color_fragment>','#include <color_fragment>\n    float backFade = smoothstep(-4.08, 4.08, -vBoardDepth);\n    diffuseColor.rgb = mix(vec3(0.0), vec3(0.1882353), backFade);');
 };
 underside.customProgramCacheKey=()=> 'chess-board-underside-depth-gradient';
 const base=new THREE.Mesh(new THREE.BoxGeometry(8.16,.16,8.16),[edge,edge,edge,underside,edge,edge]);
 base.position.y=-.2;base.receiveShadow=false;board.add(base);
 board.userData.materials=[...mats,edge,underside];return board;
}
