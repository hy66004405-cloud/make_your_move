import * as THREE from 'three';
import { animate } from './vendor/anime.js';
import { createPiece,createBoard,squarePosition } from './models.js?v=13';
import { createWorkboard } from './workboard.js?v=43';
import { createPawnCaption } from './pawn-caption.js?v=10';
import { createPawnFollower } from './pawn-follower.js?v=6';
import { categories } from './content.js?v=15';
import { inertialEase,coastEase,coastDuration,coastSeconds,glide } from './motion.js?v=6';
const $=s=>document.querySelector(s);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const duration=n=>reduced.matches?1:n;
let renderer,scene,camera,board,selected=null,state='board',hovered=null,transition=null;
let pieces=[],active=[],lastTime=0,ready=false,openingFraming=false;
let ambientLight,keyLight,rimLight,fillLight;
let openingDisc;
let pawnFollower;
let openingDepth=0;
let coasting=null;
const boardDeparture={progress:0,target:0,active:false};
const BOARD_EXIT_SECONDS=.28;
const pawnLean={pawn:null,value:0,velocity:0,target:0,active:false};
const descentCamera={elapsed:0,active:false,x:0,y:0};
const openingSurfaces=[];
const circleAppearance={mix:0,alpha:1,glow:0};
const smooth=u=>{const t=THREE.MathUtils.clamp(u,0,1);return t*t*t*(t*(t*6-15)+10)};
const BOARD_ANGLE=0;
const GLOW_SQUARES=new Set();
const CAMERA_DISTANCE=28;
const SIDE_TRANSITION_MS=400;
// One reference-matched exponential curve drives both the camera and its tail.
const cameraEase=u=>coastEase(u,SIDE_TRANSITION_MS);
const lighting={focus:0};
const view={angle:BOARD_ANGLE,azimuth:0,height:14.2,targetX:.5,targetY:.55,targetZ:-.5,perspective:0,fade:1};
const introEls=[$('#intro'),$('#board-note'),$('#board-instruction')];
const mobile=()=>innerWidth<=650;
const announce=text=>$('#announcement').textContent=text;
const pawnCaption=createPawnCaption($('#pawn-caption'));
const workboard=createWorkboard({onOpen(){state='dashboard';document.body.dataset.view='dashboard';$('#back-button').hidden=true},onClose(){state='circle';document.body.dataset.view='focus';document.body.dataset.scene='circle';$('#back-button').hidden=false}});
let cursorRestoring=false;
async function restoreCirclePawn(){if(state!=='circle'||cursorRestoring)return;cursorRestoring=true;window.dispatchEvent(new Event('opening:circle-start'));await workboard.settleCircle();cursorRestoring=false;turnPawnIntoCircle(true)}
function topHeight(){return mobile()?8.16/(innerWidth/innerHeight)*1.22:Math.max(12.4,8.16/(innerWidth/innerHeight)*1.5)}
function frameCamera(){
 const pose=view;
 $('#reveal-world').dataset.cameraHeight=String(pose.height);
 const a=innerWidth/innerHeight,h=pose.height;
 // Blend projection continuously; the target plane keeps exactly the same scale.
 const p=pose.perspective,n=camera.near,f=camera.far,d=CAMERA_DISTANCE;
 const zScale=-(2*(1-p)+p*(f+n)/d)/(f-n);
 const zOffset=zScale*n-(1-p)-p*n/d;
 camera.projectionMatrix.set(2/(h*a),0,0,0, 0,2/h,0,0, 0,0,zScale,zOffset, 0,0,-p/d,1-p);
 camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 camera.up.set(0,Math.sin(pose.angle),-Math.cos(pose.angle));
 camera.position.set(pose.targetX+Math.sin(pose.angle)*Math.sin(pose.azimuth)*CAMERA_DISTANCE,pose.targetY+Math.cos(pose.angle)*CAMERA_DISTANCE,pose.targetZ+Math.sin(pose.angle)*Math.cos(pose.azimuth)*CAMERA_DISTANCE);
 camera.position.x+=descentCamera.x;camera.position.y+=descentCamera.y;
 camera.lookAt(pose.targetX+descentCamera.x,pose.targetY+descentCamera.y,pose.targetZ);camera.updateMatrixWorld();
}
function updateDescentMotion(dt){
 if(pawnLean.active){
  if(reduced.matches){pawnLean.value=pawnLean.target;pawnLean.velocity=0}
  else glide(pawnLean,'value',pawnLean.target,'velocity',dt,5.4);
  if(Math.abs(pawnLean.value-pawnLean.target)<.00005&&Math.abs(pawnLean.velocity)<.0001){pawnLean.value=pawnLean.target;pawnLean.active=false}
  pawnLean.pawn.model.rotation.z=pawnLean.value;
 }
 descentCamera.x=0;descentCamera.y=0;
 if(!descentCamera.active)return;
 descentCamera.elapsed+=dt;
 const t=descentCamera.elapsed;
 if(reduced.matches||t>=.65){descentCamera.active=false;return}
 // A brief vertical tracking lag and tiny vibration convey descent without
 // changing the camera's resting position or accumulating random drift.
 const envelope=(1-Math.exp(-t/.025))*Math.exp(-t/.18)*(1-smooth(t/.65));
 descentCamera.x=view.height*.0005*Math.sin(t*Math.PI*34)*envelope;
 descentCamera.y=view.height*(.003+.0022*Math.sin(t*Math.PI*24))*envelope;
}
function opacity(group,value){group.visible=value>.003;group.userData.materials.forEach(m=>{m.opacity=value;m.depthWrite=value>.98});}
function applyFade(){opacity(board,view.fade);pieces.forEach(p=>{if(p!==selected)opacity(p.model,view.fade);if(p.glow)p.glow.visible=state==='board'||(state==='transition'&&view.fade>.65)});}
function updateBoardDeparture(dt){
 if(!boardDeparture.active)return;
 const blend=reduced.matches?1:1-Math.exp(-dt/BOARD_EXIT_SECONDS);
 boardDeparture.progress+=(boardDeparture.target-boardDeparture.progress)*blend;
 if(Math.abs(boardDeparture.target-boardDeparture.progress)<.0001){boardDeparture.progress=boardDeparture.target;boardDeparture.active=false}
 const t=boardDeparture.progress;
 // Lift the camera-facing edge early, revealing the dark underside before
 // the board clears the frame. The same path is retraced on reverse scroll.
 board.position.set(0,view.height*1.25*(.55*t+.45*t*t),.9*Math.sin(t*Math.PI/2));
 board.rotation.set(-.30*smooth(t/.55),0,0);
 view.fade=1-smooth((t-.72)/.24);
 applyFade();
}
function updateLighting(t){
 lighting.focus=t;ambientLight.intensity=THREE.MathUtils.lerp(.8,.35,t);keyLight.intensity=THREE.MathUtils.lerp(2.8,.8,t);rimLight.intensity=THREE.MathUtils.lerp(2.1,7,t);fillLight.intensity=THREE.MathUtils.lerp(.8,1.1,t);
}
function makeGlow(p){
 const glow=new THREE.Group();
 const strength={value:.48};
 const meshes=[...p.model.children];
 // Back-facing shells are depth-tested against the solid model: only the
 // silhouette's exterior is visible, without brightening its surface.
 for(let layer=0;layer<6;layer++){
  const material=new THREE.ShaderMaterial({
   uniforms:{strength,spread:{value:.025+layer*.024},falloff:{value:(1-layer/7)*.30}},
   vertexShader:`uniform float spread;void main(){vec3 expanded=position+normal*spread;gl_Position=projectionMatrix*modelViewMatrix*vec4(expanded,1.);}`,
   fragmentShader:`uniform float strength;uniform float falloff;void main(){gl_FragColor=vec4(vec3(.97),strength*falloff);}`,
   transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,side:THREE.BackSide
  });
  for(const mesh of meshes){const shell=new THREE.Mesh(mesh.geometry,material);shell.position.copy(mesh.position);shell.rotation.copy(mesh.rotation);shell.renderOrder=2;shell.raycast=()=>{};glow.add(shell)}
  if(layer===0)p.glowMaterial=material;
 }
 p.model.add(glow);p.glow=glow;
 for(const material of p.model.userData.materials){material.emissive.set(0x000000);material.emissiveIntensity=0;}
}

function projectControls(){
 if(selected&&pawnCaption.visible){
  selected.model.updateMatrixWorld(true);
  const offset=pawnFollower?.offset||{x:0,y:0};
  const anchor=selected.model.localToWorld(new THREE.Vector3(.46+offset.x,.55+offset.y,0)).project(camera);
  pawnCaption.place((anchor.x+1)*innerWidth/2,(1-anchor.y)*innerHeight/2);
 }
 for(const p of active){
  const show=state==='board'||(state==='focus'&&p===selected);
  p.button.hidden=!show;
  if(!show)continue;
  const v=new THREE.Vector3(p.model.position.x,p.model.position.y+(state==='focus'?.7:.75),p.model.position.z).project(camera);
  p.button.style.left=((v.x+1)*innerWidth/2)+'px';p.button.style.top=((-v.y+1)*innerHeight/2)+'px';
 }
}
function syncOpeningSurface(){
 const flat=(1-smooth((openingDepth-.12)/.76))*(1-smooth(view.angle/.48));
 for(const uniform of openingSurfaces)uniform.value=flat;
 openingDisc.visible=flat>.001&&(state==='board'||state==='transition');
 openingDisc.material.opacity=flat;
 const pawn=pieces[0];
 if(openingDisc.visible){openingDisc.position.copy(pawn.origin);openingDisc.position.y=1.11}
 if((state==='board'||state==='transition')&&view.angle<.48)opacity(pawn.model,1-flat);
}
function init(){
 window.setLoadingStage?.('3D 공간 준비');
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(25,innerWidth/innerHeight,.1,100);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor(0x000000,0);
 renderer.domElement.setAttribute('aria-label','위에서 내려다본 체스판과 백색 폰. 스크롤하면 사이드 뷰로 전환됩니다.');
 $('#canvas-container').append(renderer.domElement);
 ambientLight=new THREE.HemisphereLight(0xffffff,0x292929,.8);scene.add(ambientLight);
 keyLight=new THREE.DirectionalLight(0xffffff,2.8);keyLight.position.set(-5,8,3);keyLight.castShadow=false;scene.add(keyLight);
 rimLight=new THREE.DirectionalLight(0xffffff,2.1);rimLight.position.set(1.5,3.5,-5);scene.add(rimLight);
 fillLight=new THREE.DirectionalLight(0xffffff,.8);fillLight.position.set(-5,2,1);scene.add(fillLight);
 board=createBoard();scene.add(board);
 for(const material of board.userData.materials){
  if(material.userData.boardUnderside)continue;
  const flatness={value:1};openingSurfaces.push(flatness);
  const flatColor={value:new THREE.Color(material.color.getHex()<=0x151515?0x000000:0xffffff)};
  material.customProgramCacheKey=()=>material.userData.boardSurface?'opening-board-top-dim':'opening-board-base';
  material.onBeforeCompile=shader=>{
   shader.uniforms.openingFlatness=flatness;shader.uniforms.openingFlatColor=flatColor;
   shader.fragmentShader='uniform float openingFlatness;uniform vec3 openingFlatColor;\n'+shader.fragmentShader;
   if(material.userData.boardSurface)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    reflectedLight.directDiffuse *= 0.65;
    reflectedLight.indirectDiffuse *= 0.65;
    reflectedLight.directSpecular *= 0.035;
    reflectedLight.indirectSpecular *= 0.035;
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','#include <tonemapping_fragment>\ngl_FragColor.rgb=mix(gl_FragColor.rgb,openingFlatColor,openingFlatness);');
  };
 }
 window.setLoadingStage?.('백색 폰 한 개 배치');
 const data={id:'e5',type:'pawn',color:'white',square:'e5',active:true,category:'design'};
 const model=createPiece(data.type,data.color);model.position.copy(squarePosition(data.square));model.traverse(o=>{if(o.isMesh)o.renderOrder=2});scene.add(model);
 pawnFollower=createPawnFollower(model,{camera,canvas:renderer.domElement});
 pieces=[{...data,model,origin:model.position.clone(),originRotation:model.rotation.y}];
 openingDisc=new THREE.Mesh(new THREE.CircleGeometry(.42,128),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,transparent:true,depthWrite:false}));
 openingDisc.rotation.x=-Math.PI/2;openingDisc.renderOrder=3;scene.add(openingDisc);
 active=pieces;
 for(const p of active){
  if(GLOW_SQUARES.has(p.square))makeGlow(p);
  const b=document.createElement('button');b.className='piece-hotspot';b.dataset.square=p.square;b.dataset.glowing=String(GLOW_SQUARES.has(p.square));b.setAttribute('aria-label',`${p.color==='white'?'백':'흑'} ${p.type} ${p.square} — ${categories[p.category].title}`);
  b.innerHTML=`<span class="tooltip">${categories[p.category].title} ↗</span>`;
  b.addEventListener('click',()=>activate(p));
  b.addEventListener('pointerenter',()=>hovered=p);b.addEventListener('pointerleave',()=>hovered=null);
  b.addEventListener('focus',()=>hovered=p);b.addEventListener('blur',()=>hovered=null);
  $('#piece-controls').append(b);p.button=b;
 }
 view.height=topHeight();view.targetX=.5;view.targetZ=-.5;
 // Set the opening camera before drawing or exposing the first canvas frame.
 ready=true;window.dispatchEvent(new Event('opening:scene-ready'));
 frameCamera();syncOpeningSurface();renderer.render(scene,camera);projectControls();
 $('#loading').hidden=true;document.body.dataset.sceneReady='true';window.finishLoading?.();
 animate(introEls,{opacity:[0,1],duration:duration(1100),ease:'outCubic'});
 board.position.y=0;
 renderer.setAnimationLoop(tick);
 renderer.domElement.addEventListener('pointermove',pointerMove);
 renderer.domElement.addEventListener('pointerleave',()=>{hovered=null;renderer.domElement.style.cursor='default'});
 renderer.domElement.addEventListener('click',canvasClick);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();showFallback('3D 연결이 끊어졌습니다. 컬렉션은 계속 탐색할 수 있습니다.');});
 const initial=location.hash.slice(1);if(categories[initial])openCollection(initial,false);
}
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
function hit(e){
 if(!ready||(state!=='board'&&state!=='focus'))return null;
 pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);const near=new THREE.Vector3(pointer.x,pointer.y,-1).unproject(camera),far=new THREE.Vector3(pointer.x,pointer.y,1).unproject(camera);ray.ray.set(near,far.sub(near).normalize());
 const choices=state==='focus'?[selected]:active;
 const hits=ray.intersectObjects(choices.map(p=>p.model),true);
 if(!hits.length)return null;
 return choices.find(p=>{let obj=hits[0].object;while(obj){if(obj===p.model)return true;obj=obj.parent}return false});
}
function pointerMove(e){hovered=hit(e);renderer.domElement.style.cursor=pawnFollower?.dragging?'grabbing':state==='focus'&&selected?.model.userData.preserveBoard?'grab':hovered?'pointer':state==='focus'?'zoom-out':'default'}
function canvasClick(e){const p=hit(e);if(p)activate(p);else if(state==='focus'&&!selected?.model.userData.preserveBoard)returnToBoard()}
function activate(p){if(state==='board')focusPiece(p,true);else if(state==='focus'&&p===selected&&!p.model.userData.preserveBoard)openCollection(p.category)}
function closeMenu(){$('#index-menu').hidden=true;$('#index-toggle').setAttribute('aria-expanded','false')}
function focusPiece(p,preserveBoard=false){
 if(!p)return;if(!ready)return openCollection(p.category);
 if(state==='transition')return;
 coasting=null;
 openingFraming=false;closeMenu();selected=p;p.model.userData.isolated=false;window.dispatchEvent(new Event('opening:side-start'));p.model.userData.preserveBoard=preserveBoard;state='transition';document.body.dataset.view='focus';if(preserveBoard)document.body.dataset.scene='side';hovered=null;
 const c=categories[p.category];$('#focus-kicker').textContent=c.kicker;$('#title-link').innerHTML=c.line;$('#title-link').setAttribute('aria-label',c.title+' 컬렉션으로 이동');$('#focus-description').textContent=c.description;$('#piece-name').textContent=`${c.piece} / ${p.square.toUpperCase()} / ${p.color.toUpperCase()}`;
 $('#focus-copy').hidden=preserveBoard;$('#focus-copy').style.opacity='0';$('#focus-meta').hidden=true;$('#back-button').hidden=true;
 if(preserveBoard){$('#footer').style.opacity='0';$('#footer').style.transition='opacity .45s ease';}
 animate(introEls,{opacity:0,duration:duration(350)});
 const m={progress:0},start={...view},origin=p.model.position.clone(),rot=p.model.rotation.y;
 const boardStartPosition=board.position.clone(),boardStartQuaternion=board.quaternion.clone(),boardRestPosition=new THREE.Vector3(),boardRestQuaternion=new THREE.Quaternion();
 const finalScale=p.type==='pawn'?(preserveBoard?1:1.6):1.18;
 const end=preserveBoard
  ?{angle:Math.PI/2-.13,azimuth:0,height:mobile()?3.6:2.65,targetX:origin.x,targetY:.55,targetZ:origin.z,perspective:1}
  :{angle:Math.PI/2-.055,azimuth:0,height:mobile()?4.3:2.65,targetX:mobile()?0:.28,targetY:mobile()?.18:.87,targetZ:0};
 transition=animate(m,{progress:1,duration:duration(preserveBoard?coastDuration(SIDE_TRANSITION_MS):1700),ease:'linear',onUpdate:()=>{
  const u=m.progress,t=preserveBoard?cameraEase(u):u*u*u*(u*(u*6-15)+10);for(const k in end)view[k]=THREE.MathUtils.lerp(start[k],end[k],t);
  view.fade=preserveBoard?1:1-Math.min(1,t*2.4);const destination=preserveBoard?origin:new THREE.Vector3(mobile()?0:-.72,mobile()?.88:0,0);p.model.position.lerpVectors(origin,destination,t);
  if(preserveBoard){board.position.lerpVectors(boardStartPosition,boardRestPosition,t);board.quaternion.slerpQuaternions(boardStartQuaternion,boardRestQuaternion,t)}
  p.model.rotation.y=preserveBoard?rot:THREE.MathUtils.lerp(rot,p.type==='knight'?.12:.25,t);p.model.scale.setScalar(THREE.MathUtils.lerp(1,finalScale,t));if(!preserveBoard)updateLighting(t);
  applyFade();frameCamera();projectControls();
 },onComplete:()=>{
  state='focus';transition=null;$('#back-button').hidden=false;$('#back-button span').textContent=preserveBoard?'Top view':'Back to the opening';$('#focus-meta').hidden=preserveBoard;
  if(preserveBoard){coasting={view:end,boardPosition:boardRestPosition,boardQuaternion:boardRestQuaternion};document.body.dataset.sideReady='true';window.dispatchEvent(new Event('opening:side-ready'))}
  p.button.classList.toggle('focused',!preserveBoard);p.button.setAttribute('aria-label',preserveBoard?'백색 폰':'Design project 컬렉션으로 이동');
  if(!preserveBoard)animate('#focus-copy',{opacity:[0,1],translateY:[18,0],duration:duration(650),ease:'outCubic'});
  projectControls();if(!preserveBoard)p.button.focus({preventScroll:true});announce(preserveBoard?'체스판과 백색 폰의 사이드 뷰':`${c.title}. 말이나 제목을 클릭하면 컬렉션으로 이동합니다.`);
 }});
}
function isolatePawn(reverse=false){
 if(state!=='focus'||!selected?.model.userData.preserveBoard||Boolean(selected.model.userData.isolated)!==reverse)return;
 pawnCaption.hide();
 coasting=null;
 const p=selected,start={...view},startY=p.model.position.y,startTilt=p.model.rotation.z;
 const restingTilt=p.model.userData.departureRestTilt??startTilt;
 if(!reverse)p.model.userData.departureRestTilt=restingTilt;
 if(reverse)pawnFollower.settle();else pawnFollower.activate();
 if(pawnLean.pawn!==p||!pawnLean.active)pawnLean.velocity=0;
 Object.assign(pawnLean,{pawn:p,value:startTilt,target:restingTilt+(reverse?0:.2),active:true});
 Object.assign(descentCamera,{elapsed:0,active:!reverse,x:0,y:0});
 boardDeparture.target=reverse?0:1;boardDeparture.active=true;
 const end={angle:reverse?Math.PI/2-.13:Math.PI/2,azimuth:0,targetY:reverse?.55:.25,perspective:1};
 state='transition';hovered=null;document.body.dataset.scene='departure';delete document.body.dataset.sideReady;$('#back-button').hidden=true;
 const m={progress:0};
 transition=animate(m,{progress:1,duration:duration(coastDuration()*BOARD_EXIT_SECONDS/coastSeconds),ease:'linear',onUpdate:()=>{
  const u=m.progress,t=coastEase(u,650);
  for(const k in end)view[k]=THREE.MathUtils.lerp(start[k],end[k],t);
  p.model.position.y=THREE.MathUtils.lerp(startY,p.origin.y+(reverse?0:-.3),t);
  applyFade();frameCamera();projectControls();
 },onComplete:()=>{
  p.model.userData.isolated=!reverse;state='focus';transition=null;document.body.dataset.scene=reverse?'side':'pawn';
  coasting={view:end,pawn:p,position:p.origin.clone().add(new THREE.Vector3(0,reverse?0:-.3,0)),seconds:BOARD_EXIT_SECONDS};
  if(reverse)document.body.dataset.sideReady='true';
  $('#back-button').hidden=false;window.dispatchEvent(new Event(reverse?'opening:side-ready':'opening:pawn-ready'));
  announce(reverse?'체스판과 백색 폰의 사이드 뷰로 돌아왔습니다.':'체스판이 사라지고 흰 폰이 정면에 남았습니다.');
 }});
}
function syncFlatCircle(){
 const el=$('#flat-circle');if(!selected||el.hidden)return;
 selected.model.updateMatrixWorld(true);
 // The widest rim is circular and parallel to the screen at the end of the turn.
 const center=selected.model.localToWorld(new THREE.Vector3(0,.065,0)).project(camera);
 const edge=selected.model.localToWorld(new THREE.Vector3(.315,.065,0)).project(camera);
 const diameter=Math.min(Math.hypot((edge.x-center.x)*innerWidth,(edge.y-center.y)*innerHeight),workboard.gridCellSize()*.9);
 const anchor={x:(center.x+1)*innerWidth/2,y:(1-center.y)*innerHeight/2,size:diameter};
 if(state==='circle'&&workboard.updateAnchor(anchor))return;
 el.style.left=anchor.x+'px';el.style.top=anchor.y+'px';
 el.style.width=el.style.height=diameter+'px';el.style.opacity=circleAppearance.mix*circleAppearance.alpha;
 const glow=circleAppearance.glow;
 el.style.boxShadow=`0 0 ${diameter*.28*glow}px ${diameter*.045*glow}px rgba(255,255,255,${.82*glow}),0 0 ${diameter*.72*glow}px ${diameter*.11*glow}px rgba(255,255,255,${.34*glow})`;
}
// Quintic segments join position, velocity and acceleration continuously.
// The close-up drifts into the same flowing curve as the return and rotation.
function pawnFlightCurve(t,keys){
 const last=keys[keys.length-1];if(t>=last[0])return last[1];
 for(let i=1;i<keys.length;i++){
  const a=keys[i-1],b=keys[i];if(t>b[0])continue;
  const span=b[0]-a[0],u=THREE.MathUtils.clamp((t-a[0])/span,0,1),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  return (1-10*u3+15*u4-6*u5)*a[1]+(u-6*u3+8*u4-3*u5)*span*a[2]+(10*u3-15*u4+6*u5)*b[1]+(-4*u3+7*u4-3*u5)*span*b[2];
 }
 return keys[0][1];
}
const pawnApproachKeys=[[0,0,0],[.22,.72,5],[.34,1,.25],[.43,1.015,-.1],[.55,.78,-4],[.68,.12,-2.7],[.79,0,0]];
const pawnTurnKeys=[[0,0,0],[.32,.025,.2],[.44,.09,.8],[.58,.53,4],[.7,.965,.8],[.79,1,0]];
function turnPawnIntoCircle(reverse=false){
 if(reverse?state!=='circle':state!=='focus'||!selected?.model.userData.isolated)return;
 coasting=null;
 pawnLean.active=false;
 pawnFollower.pause();
 const p=selected,el=$('#flat-circle');
 if(!reverse)p.model.userData.circlePose={position:p.model.position.clone(),quaternion:p.model.quaternion.clone(),scale:p.model.scale.x,cameraHeight:view.height,follower:pawnFollower.capture(),materials:p.model.userData.materials.map(m=>({emissive:m.emissive.clone(),intensity:m.emissiveIntensity}))};
 const pose=p.model.userData.circlePose,pivot=new THREE.Vector3(0,.55,0);
 const center=pose.position.clone().add(pivot.clone().multiplyScalar(pose.scale).applyQuaternion(pose.quaternion));
 state='transition';hovered=null;document.body.dataset.scene='circle-turn';$('#back-button').hidden=true;
 window.dispatchEvent(new Event('opening:circle-start'));el.hidden=false;
 const m={progress:0},flightCamera={value:0,velocity:0};
 let cameraFrameTime=performance.now();
 // Keep the complete flight and its slowdown connected on one continuous clock.
 const flightMs=2528,finishMs=672,totalMs=flightMs+finishMs;
 transition=animate(m,{progress:1,duration:duration(reverse?1550:totalMs),ease:'linear',onUpdate:()=>{
  const elapsed=(reverse?1-m.progress:m.progress)*totalMs;
  const q=elapsed<=flightMs?.79*elapsed/flightMs:.79+.21*(elapsed-flightMs)/finishMs;
  const turn=pawnFlightCurve(q,pawnTurnKeys);
  const approach=pawnFlightCurve(q,pawnApproachKeys);
  p.model.scale.setScalar(pose.scale*(1+(mobile()?2.4:3.2)*approach));
  const orbit=turn,arc=Math.sin(Math.PI*orbit);
  pawnFollower.morph(pose.follower,turn);
  p.model.quaternion.slerpQuaternions(pose.quaternion,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),turn);
  // Roll along the curved return path rather than rotating in place.
  p.model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI*2*orbit-.24*approach));
  p.model.position.copy(center).sub(pivot.clone().multiplyScalar(p.model.scale.x).applyQuaternion(p.model.quaternion));
  const undersidePosition=new THREE.Vector3(view.targetX,view.targetY,view.targetZ).sub(new THREE.Vector3(0,.065,0).multiplyScalar(p.model.scale.x).applyQuaternion(p.model.quaternion));
  p.model.position.lerp(undersidePosition,turn);
  p.model.position.z+=7.2*approach;
  // Keep the actual head in frame even when the user has spun the inner rig.
  const innerRotation=pose.follower.quaternion.clone().slerp(new THREE.Quaternion(),turn);
  const innerPosition=pose.follower.position.clone().lerp(pivot,turn);
  const head=new THREE.Vector3(0,.78,0).sub(pivot).applyQuaternion(innerRotation).add(innerPosition)
   .multiplyScalar(p.model.scale.x).applyQuaternion(p.model.quaternion).add(p.model.position);
  const headFocus=smooth(approach);
  p.model.position.x+=(view.targetX-head.x)*headFocus;
  p.model.position.y+=(view.targetY-head.y)*headFocus;
  const pathWidth=pose.cameraHeight*Math.min(innerWidth/innerHeight,1.4);
  p.model.position.x+=pathWidth*(.075*approach+.16*Math.sin(Math.PI*2*orbit)*arc);
  p.model.position.y+=pose.cameraHeight*(.045*approach+.11*(Math.cos(Math.PI*2*orbit)-1)*arc);
  circleAppearance.mix=smooth((q-.72)/.15);
  circleAppearance.alpha=1;
  const glowIn=smooth((q-.76)/.1),glowOut=smooth((q-.93)/.065);
  circleAppearance.glow=0;
  const flatten=smooth((q-.7)/.17);
  p.model.userData.materials.forEach((material,i)=>{material.emissive.copy(pose.materials[i].emissive).lerp(new THREE.Color(0xffffff),flatten);material.emissiveIntensity=THREE.MathUtils.lerp(pose.materials[i].intensity,2,flatten)});
  // Keep the solid silhouette underneath until the matching 2D disc is opaque.
  p.model.visible=circleAppearance.mix<1;
  const now=performance.now(),cameraDt=Math.min(.05,Math.max(0,(now-cameraFrameTime)/1000));cameraFrameTime=now;
  glide(flightCamera,'value',q<.79?approach*.085:0,'velocity',cameraDt,3.4);
  view.height=pose.cameraHeight*(1-flightCamera.value);
  $('#circle-grid').style.opacity='0';
  frameCamera();syncFlatCircle();projectControls();
 },onComplete:()=>{
  transition=null;
  if(reverse){
   view.height=pose.cameraHeight;p.model.visible=true;p.model.scale.setScalar(pose.scale);p.model.position.copy(pose.position);p.model.quaternion.copy(pose.quaternion);el.hidden=true;
   pawnFollower.resume(pose.follower);
   state='focus';document.body.dataset.scene='pawn';$('#back-button span').textContent='Top view';
   window.dispatchEvent(new CustomEvent('opening:pawn-ready',{detail:{restored:true}}));announce('흰 폰의 정면으로 돌아왔습니다.');
  }else{
   view.height=pose.cameraHeight;p.model.visible=false;state='circle';document.body.dataset.scene='circle';$('#back-button span').textContent='Back to pawn';
   window.dispatchEvent(new Event('opening:circle-ready'));announce('밑면이 한 번 빛난 뒤 반투명 원이 되었습니다.');
  }
  $('#back-button').hidden=false;projectControls();
 }});
}
function returnToBoard(updateHistory=true){
 if(state==='circle')return restoreCirclePawn();
 if(state==='transition')return;
 coasting=null;
 pawnLean.active=false;
 pawnFollower?.settle();
 boardDeparture.active=false;boardDeparture.progress=0;boardDeparture.target=0;
 window.dispatchEvent(new Event('opening:board-start'));
 closeMenu();if(updateHistory&&location.hash)history.pushState(null,'',location.pathname+location.search);
 $('#collection').hidden=true;$('#focus-copy').hidden=true;$('#focus-meta').hidden=true;$('#back-button').hidden=true;document.body.dataset.view='board';delete document.body.dataset.scene;delete document.body.dataset.sideReady;window.scrollTo(0,0);
 if(!ready){state='board';return}
 state='transition';hovered=null;
 const p=selected,start={...view},pos=p?.model.position.clone(),rot=p?p.originRotation+Math.atan2(Math.sin(p.model.rotation.y-p.originRotation),Math.cos(p.model.rotation.y-p.originRotation)):0,startPitch=p?.model.rotation.x||0,startScale=p?.model.scale.x||1,startLight=lighting.focus,startBoardPosition=board.position.clone(),startBoardQuaternion=board.quaternion.clone();
 const restingBoardPosition=new THREE.Vector3(),restingBoardQuaternion=new THREE.Quaternion();
 const startRoll=p?.model.rotation.z||0;
 if(p)p.button.classList.remove('focused');
 const end={angle:BOARD_ANGLE,azimuth:0,height:Math.min(5.2,6/(innerWidth/innerHeight)),targetX:.5,targetY:.55,targetZ:-.5,perspective:0};
 const m={progress:0};
 transition=animate(m,{progress:1,duration:duration(coastDuration(SIDE_TRANSITION_MS)),ease:'linear',onUpdate:()=>{
  const t=cameraEase(m.progress);for(const k in end)view[k]=THREE.MathUtils.lerp(start[k],end[k],t);view.fade=THREE.MathUtils.lerp(start.fade,1,t);board.position.lerpVectors(startBoardPosition,restingBoardPosition,t);board.quaternion.slerpQuaternions(startBoardQuaternion,restingBoardQuaternion,t);
  if(p){p.model.position.lerpVectors(pos,p.origin,t);p.model.rotation.y=THREE.MathUtils.lerp(rot,p.originRotation,t);p.model.rotation.x=THREE.MathUtils.lerp(startPitch,0,t);p.model.rotation.z=THREE.MathUtils.lerp(startRoll,0,t);p.model.scale.setScalar(THREE.MathUtils.lerp(startScale,1,t))}updateLighting(startLight*(1-t));
  applyFade();frameCamera();projectControls();
 },onComplete:()=>{
  pieces.forEach(q=>{q.model.userData.isolated=false;if(q.glow)q.glow.visible=true;opacity(q.model,1)});state='board';selected=null;transition=null;
  coasting={view:{...end,fade:1},pawn:p,position:p?.origin.clone(),rotation:new THREE.Vector3(0,p?.originRotation||0,0),scale:1,boardPosition:restingBoardPosition,boardQuaternion:restingBoardQuaternion};
  animate(introEls,{opacity:1,duration:duration(600)});$('#footer').style.opacity='';projectControls();if(p){p.button.classList.remove('focused');p.button.setAttribute('aria-label',`${p.color==='white'?'백':'흑'} ${p.type} ${p.square}`);p.button.focus({preventScroll:true})}window.dispatchEvent(new Event('opening:board-ready'));announce('체스판 위의 백색 폰.');
 }});
}
function openCollection(key,updateHistory=true){
 const c=categories[key];if(!c||state==='transition')return;
 closeMenu();hovered=null;state='collection';document.body.dataset.view='collection';$('#collection').hidden=false;$('#collection').dataset.category=key;
 $('#collection-kicker').textContent=c.kicker+' — SELECTED COLLECTION';$('#collection-title').textContent=c.title+'.';$('#collection-description').textContent=c.description;
 $('#collection-grid').innerHTML=c.items.map((item,i)=>`<button class="work-card" data-item="${i}"><div class="work-art ${item.cls}">${item.art}</div><div class="work-caption"><div><h3>${item.title}</h3><p>${item.tag}</p></div><span>↗</span></div></button>`).join('');
 $('#collection>.placeholder-note').innerHTML=key==='taste'?'<a href="https://pin.it/35yWhKkgY" target="_blank" rel="noopener noreferrer">PINTEREST / 그래픽 디자인 보드 ↗</a> · 18 IMAGES':'CONCEPT PORTFOLIO · 현재 작업물은 전시 구성을 위한 예시입니다.';
 $('#collection-grid').querySelectorAll('button').forEach(b=>b.onclick=()=>openDetail(c.items[Number(b.dataset.item)]));
 if(updateHistory)history.pushState(null,'','#'+key);
 window.scrollTo(0,0);$('#collection').focus({preventScroll:true});
 animate('.collection-heading',{opacity:[0,1],translateY:[25,0],duration:duration(700),ease:'outCubic'});
 animate('.work-card',{opacity:[0,1],translateY:[40,0],delay:(_,i)=>reduced.matches?0:120+i*100,duration:duration(900),ease:'outCubic'});
 announce(c.title+' 컬렉션');
}
function openDetail(item){
 $('#detail').classList.toggle('image-detail',item.kind==='pinterest');
 if(item.kind==='pinterest'){
  $('#detail-content').innerHTML=`<img class="archive-full-image" src="${item.image}" alt="${item.title} — 그래픽 디자인 보드 이미지"><div class="archive-image-footer"><span>${item.title}</span><a href="${item.source}" target="_blank" rel="noopener noreferrer">Pinterest 원본 보기 ↗</a></div>`;
  $('#detail').showModal();return;
 }

 $('#detail-content').innerHTML=`<div class="work-art ${item.cls}">${item.art}</div><h2>${item.title}</h2><p>${item.description}</p><dl><dt>Focus</dt><dd>${item.role}</dd><dt>Process</dt><dd>${item.process}</dd></dl><p class="placeholder-note">전시 레이아웃을 위한 예시 프로젝트입니다. 실제 작업물로 교체할 수 있습니다.</p>`;
 $('#detail').showModal();
}
function tick(now){
 if(!ready||document.hidden||(state==='collection'||state==='dashboard'))return;
 const dt=Math.min((now-lastTime)/1000,.05)||.016;lastTime=now;
 if(coasting&&state!=='transition'){
  const blend=reduced.matches?1:1-Math.exp(-dt/(coasting.seconds||coastSeconds));
  for(const [key,target] of Object.entries(coasting.view))view[key]+=(target-view[key])*blend;
  if(coasting.boardPosition)board.position.lerp(coasting.boardPosition,blend);
  if(coasting.boardQuaternion)board.quaternion.slerp(coasting.boardQuaternion,blend);
  if(coasting.view.fade!==undefined)applyFade();
  if(coasting.pawn&&coasting.position)coasting.pawn.model.position.lerp(coasting.position,blend);
  if(coasting.pawn&&coasting.rotation){const r=coasting.pawn.model.rotation;for(const key of ['x','y','z'])r[key]+=(coasting.rotation[key]-r[key])*blend}
  if(coasting.pawn&&coasting.scale)coasting.pawn.model.scale.lerp(new THREE.Vector3().setScalar(coasting.scale),blend);
  frameCamera();
 }
 if(state==='board')for(const p of active){const isHover=hovered===p;const target=0;if(coasting?.pawn!==p)p.model.position.y=THREE.MathUtils.damp(p.model.position.y,target,10,dt);if(p.glowMaterial)p.glowMaterial.uniforms.strength.value=THREE.MathUtils.damp(p.glowMaterial.uniforms.strength.value,isHover?.85:.48,7,dt)}
 if(state==='focus'&&selected){
  const cinematic=selected.model.userData.preserveBoard;
  const responding=!cinematic&&hovered===selected&&!reduced.matches;
  const baseY=cinematic?selected.origin.y+(selected.model.userData.isolated ? -.3 : 0):(mobile()?.88:0);
  const baseScale=selected.type==='pawn'?(cinematic?1:1.6):1.18;
  const baseRotation=cinematic?selected.originRotation:(selected.type==='knight'?.12:.25);
  if(coasting?.pawn!==selected)selected.model.position.y=THREE.MathUtils.damp(selected.model.position.y,baseY+(responding?.09:0),8,dt);
  selected.model.rotation.y=THREE.MathUtils.damp(selected.model.rotation.y,baseRotation+(responding?.075:0),7,dt);
  selected.model.rotation.x=THREE.MathUtils.damp(selected.model.rotation.x,0,7,dt);
  selected.model.scale.setScalar(THREE.MathUtils.damp(selected.model.scale.x,baseScale*(responding?1.025:1),8,dt));
 }
 updateBoardDeparture(dt);
 updateDescentMotion(dt);
 pawnFollower?.update(dt,reduced.matches);
 frameCamera();syncOpeningSurface();projectControls();renderer.render(scene,camera);
}
function showFallback(message){ready=false;renderer?.setAnimationLoop(null);$('#loading').hidden=true;window.finishLoading?.();$('#fallback').hidden=false;$('#piece-controls').hidden=true;if(message)announce(message)}
$('#index-toggle').onclick=()=>{const open=$('#index-menu').hidden;$('#index-menu').hidden=!open;$('#index-toggle').setAttribute('aria-expanded',String(open))};
document.addEventListener('click',e=>{if(!e.target.closest('#index-menu')&&!e.target.closest('#index-toggle'))closeMenu()});
$('#home').onclick=e=>{e.preventDefault();returnToBoard()};
$('#back-button').onclick=()=>returnToBoard();$('#collection-back').onclick=()=>returnToBoard();
function enterSelected(){if(selected&&state==='focus')openCollection(selected.category)}
$('#enter-button').onclick=enterSelected;
$('#title-link').onclick=enterSelected;
$('#detail-close').onclick=()=>$('#detail').close();
window.addEventListener('opening:zoom',e=>{if(!ready||state!=='board')return;if(coasting)delete coasting.view.height;openingFraming=true;openingDepth=e.detail.progress;view.height=e.detail.height;frameCamera();syncOpeningSurface();projectControls()});
window.addEventListener('opening:circle',()=>turnPawnIntoCircle());
window.addEventListener('opening:caption-complete',function continueAfterCaption(){
 if(state!=='focus'||!selected?.model.userData.isolated)return;
 if(pawnFollower.dragging){setTimeout(continueAfterCaption,120);return}
 turnPawnIntoCircle();
});
window.addEventListener('opening:restore-pawn',restoreCirclePawn);
window.addEventListener('opening:isolate-pawn',()=>isolatePawn());
window.addEventListener('opening:restore-side',()=>isolatePawn(true));
window.addEventListener('opening:restore-grid',()=>returnToBoard());
window.addEventListener('opening:side-view',()=>{const pawn=pieces.find(p=>p.square==='e5'&&p.type==='pawn'&&p.color==='white');if(pawn)focusPiece(pawn,true)});
$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
$('[data-select=pawn]').onclick=()=>selectType('pawn');$('[data-select=bishop]').onclick=()=>selectType('bishop');$('[data-select=knight]').onclick=()=>selectType('knight');
function selectType(type){if(state==='transition')return;const key={pawn:'design',bishop:'taste',knight:'experiment'}[type];if(state==='board'&&ready)focusPiece(active.find(p=>p.type===type&&p.color==='white'),true);else openCollection(key)}
document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>openCollection(b.dataset.route));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#detail').open){if(!$('#index-menu').hidden)closeMenu();else if(state==='focus'||state==='circle'||state==='collection')returnToBoard()}});
window.addEventListener('popstate',()=>{if(transition){transition.complete();}const route=location.hash.slice(1);if(categories[route])openCollection(route,false);else returnToBoard(false)});
window.addEventListener('resize',()=>{if(!ready)return;renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));if(state==='circle'||document.body.dataset.scene==='circle-turn'){view.height=mobile()?3.6:2.65}else if(state==='board'){if(!openingFraming)view.height=topHeight();view.targetX=.5;view.targetZ=-.5}else if(state==='focus'&&selected.model.userData.preserveBoard){view.height=mobile()?3.6:2.65;view.targetX=selected.origin.x;view.targetY=selected.model.userData.isolated?.25:.55;view.targetZ=selected.origin.z;selected.model.position.copy(selected.origin);if(selected.model.userData.isolated)selected.model.position.y-=.3}else if(state==='focus'){view.height=mobile()?4.3:2.65;view.targetX=mobile()?0:.28;view.targetY=mobile()?.18:.87;selected.model.position.x=mobile()?0:-.72;selected.model.position.y=mobile()?.88:0}frameCamera();syncFlatCircle();projectControls()});
try{init()}catch(error){console.error('3D setup failed',error);showFallback()}
