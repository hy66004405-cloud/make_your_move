import { createInfiniteBoard } from './infinite-board.js?v=14';
import { workImages } from './work-images.js';
import { createEnding } from './ending.js?v=8';
import { inertialEase,inertialDuration,coastEase,coastDuration,coastSeconds,glide } from './motion.js?v=6';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const ease=inertialEase;
export function createWorkboard({onOpen,onClose}){
 const circle=document.querySelector('#flat-circle');document.body.append(circle);
 const panel=document.querySelector('#workboard'),plane=document.querySelector('#work-plane'),viewer=document.querySelector('#work-viewer');
 const detailShell=viewer.querySelector('.work-detail-shell');
 const detailImage=viewer.querySelector('#work-full-image');
 let detailRevealId=0,detailImageReveal=null;
 function cancelDetailReveal(){
  detailRevealId++;detailImageReveal?.cancel();detailImageReveal=null;detailShell.classList.remove('is-settled');
 }
 function revealDetailContents(opening){
  cancelDetailReveal();
  const id=detailRevealId;
  const showImage=()=>{
   if(id!==detailRevealId||!viewer.open)return;
   if(reduced.matches){detailShell.classList.add('is-settled');return}
   detailImageReveal=detailImage.animate([
    {opacity:0,transform:'translate3d(0,12px,0)'},
    {opacity:1,transform:'translate3d(0,0,0)'}
   ],{duration:300,easing:'cubic-bezier(.16,1,.3,1)'});
   detailImageReveal.onfinish=()=>{
    if(id!==detailRevealId)return;
    detailImageReveal=null;detailShell.classList.add('is-settled');
   };
  };
  if(detailImage.complete&&detailImage.naturalWidth)showImage();
  else detailImage.decode().catch(()=>{}).then(showImage);
 }
 const cursor={x:0,y:0,tx:0,ty:0,size:0,targetSize:0,alpha:.58,targetAlpha:.58,active:false,mode:'off',seen:false,glow:0,ring:0,ringAlpha:0};
 const pointer={x:innerWidth/2,y:innerHeight/2};
 const pan={x:0,y:0,tx:0,ty:0,scale:1,targetScale:1,vx:0,vy:0,vs:0};
 // Independent camera pull: preserve the board's navigation/overview coordinates.
 const pull={value:1,velocity:0,energy:0};
 function pullBoard(distance){pull.energy=Math.min(1,pull.energy+Math.abs(distance)/130)}
 function updatePull(dt){
  if(reduced.matches){pull.value=1;pull.velocity=pull.energy=0;return}
  if(stage!=='open'||viewer.open)return;
  const seconds=dt/1000;
  pull.energy*=Math.exp(-seconds/.12);
  const travel=Math.hypot(pan.tx-pan.x,pan.ty-pan.y);
  const tension=Math.max(pull.energy,Math.min(1,travel/360));
  const target=1-.115*tension;
  // Substeps keep the lightly underdamped return continuous on slow frames.
  const steps=Math.max(1,Math.ceil(dt/8)),h=seconds/steps;
  for(let i=0;i<steps;i++){
   pull.velocity+=((target-pull.value)*225-pull.velocity*19)*h;
   pull.value+=pull.velocity*h;
  }
 }

 cursor.vx=cursor.vy=0;
 let anchor=null,frame=0,last=0,stage='closed',entry=1,drag=null,suppressClick=false,viewerIndex=0,overview=false,hoverIndex=-1;
 let placementId=0,viewerFromKeyboard=false;
 const ending=createEnding();
 let wheelTime=-Infinity,wheelDirection=0,wheelTravel=0,wheelUsed=true;
 window.addEventListener('wheel',e=>{
  const now=performance.now(),direction=Math.sign(e.deltaY);
  if(now-wheelTime>90||direction!==wheelDirection){wheelTravel=0;wheelUsed=false}
  wheelTime=now;wheelDirection=direction;wheelTravel+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
 },{capture:true,passive:true});
 const cells=[],buttons=[];
 const positions=Array.from({length:64},(_,i)=>({i,row:Math.floor(i/8),col:i%8})).filter(p=>(p.row+p.col)%2===0).sort((a,b)=>Math.hypot(a.row-3.5,a.col-3.5)-Math.hypot(b.row-3.5,b.col-3.5));
 const images=new Map(workImages.map((item,i)=>[positions[i].i,{item,index:i}]));
 // Fill unused white squares with shuffled repeats of the existing portfolio.
 const pool=Array.from({length:workImages.length},(_,i)=>i);
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
 let fill=0;
 for(const position of positions){
  if(images.has(position.i)||!pool.length)continue;
  const index=pool[fill++%pool.length];images.set(position.i,{item:workImages[index],index});
 }

 for(let i=0;i<64;i++){
  const row=Math.floor(i/8),col=i%8,data=images.get(i),cell=document.createElement(data?'button':'div');
  cell.className='work-cell '+((row+col)%2?'is-dark':'is-light');cell.dataset.coordinate=String.fromCharCode(65+col)+(8-row);
  if(data){
   const {item,index}=data;cell.type='button';cell.classList.add('has-work');cell.dataset.work=String(index);cell.setAttribute('aria-label',item.project+' — '+item.title);
   const img=document.createElement('img');img.src=item.thumbnail||item.image;img.alt=item.title;img.width=item.width;img.height=item.height;img.loading=index<12?'eager':'lazy';img.decoding='async';
   const caption=document.createElement('span');caption.className='work-tile-caption';caption.textContent=item.title;
   cell.append(img,caption);cell.addEventListener('click',()=>{if(stage==='open'&&!suppressClick)placeWork(index,{index:i},true)});buttons[index]??=cell;
   cell.addEventListener('focus',()=>{if(stage==='open'&&!viewer.open){const pitch=cellSize()*pan.targetScale,period=pitch*8;pan.tx=(3.5-col)*pitch+Math.round((pan.x-(3.5-col)*pitch)/period)*period;pan.ty=(3.5-row)*pitch+Math.round((pan.y-(3.5-row)*pitch)/period)*period;hoverIndex=row*8+col;cursor.seen=false;wake()}});
  }else{cell.setAttribute('aria-hidden','true');}
  cells.push(cell);plane.append(cell);
 }
 const cellSize=()=>Math.min(250,Math.max(155,innerWidth*.18));
 const cursorDiameter=()=>cellSize()*.9,hoverDiameter=()=>cellSize()*.9;
 const space=panel.querySelector('.workboard-space');
 const spatial=createInfiniteBoard(space,images);plane.classList.add('is-spatial');
 let landingRun=0;
 const lattice=document.querySelector('#circle-grid');
 lattice.replaceChildren();lattice.hidden=true;lattice.style.backgroundImage='none';
 const label=document.createElement('span');label.className='workboard-hover-label';label.hidden=true;panel.append(label);
 function constrain(){
  // Keep both ends of the spring in the same periodic coordinate frame.
  const period=cellSize()*pan.targetScale*8;
  for(const axis of ['x','y'])if(Math.abs(pan[axis])>period*1000){const shift=Math.trunc(pan[axis]/period)*period;pan[axis]-=shift;pan['t'+axis]-=shift;if(drag)drag['t'+axis]-=shift}
 }
 function hoverAt(x,y){
  const hit=spatial.hit(x,y),data=images.get(hit.index);hoverIndex=data?hit.index:-1;
  label.hidden=!data||!!drag||viewer.open||stage!=='open';
  if(data){label.textContent=data.item.title;label.style.left=clamp(x+18,16,Math.max(16,innerWidth-280))+'px';label.style.top=clamp(y+28,80,innerHeight-70)+'px'}
  space.style.cursor=data?'pointer':'grab';return data;
 }
 function setCircle(){
  circle.style.left=cursor.x+'px';circle.style.top=cursor.y+'px';circle.style.width=circle.style.height=cursor.size+'px';circle.style.opacity=viewer.open?0:cursor.alpha;
  circle.style.boxShadow=cursor.glow?`0 0 ${8+cursor.glow*18}px ${cursor.glow*6}px rgba(255,255,255,${cursor.glow*.58}),0 0 ${18+cursor.glow*34}px rgba(255,255,255,${cursor.glow*.24})`:'none';
 }
 function wake(){if(!frame){last=performance.now();frame=requestAnimationFrame(tick)}}
 function tick(now){
  frame=0;const dt=Math.min(64,now-last);last=now;const follow=reduced.matches?1:1-Math.exp(-dt/115);
  if(cursor.active){
   if(reduced.matches){cursor.x=cursor.tx;cursor.y=cursor.ty;cursor.vx=cursor.vy=0}
   else{glide(cursor,'x',cursor.tx,'vx',dt/1000,18);glide(cursor,'y',cursor.ty,'vy',dt/1000,18)}
   cursor.size+=(cursor.targetSize-cursor.size)*follow;cursor.alpha+=(cursor.targetAlpha-cursor.alpha)*follow;setCircle();
  }
  if(stage!=='closed'&&stage!=='ending'){
   if(stage==='open'){entry+=(1-entry)*(reduced.matches?1:1-Math.exp(-dt/(coastSeconds*1000)));space.style.opacity=String(entry)}
   if(reduced.matches){pan.x=pan.tx;pan.y=pan.ty;pan.scale=pan.targetScale;pan.vx=pan.vy=pan.vs=0}
   else{
    const response=1-Math.exp(-dt/(coastSeconds*1000));
    pan.x+=(pan.tx-pan.x)*response;pan.y+=(pan.ty-pan.y)*response;pan.scale+=(pan.targetScale-pan.scale)*response;
   }
   updatePull(dt);
   const interactive=stage==='open'&&!drag&&!viewer.open;
   // Scale translation and tile pitch together, around the viewport center.
   const cameraPan={x:pan.x*pull.value,y:pan.y*pull.value,scale:pan.scale*pull.value};
   spatial.render(cameraPan,cellSize(),entry,interactive?hoverIndex:-1,interactive&&cursor.seen?pointer:null);
   if(stage==='open'&&!drag&&!viewer.open&&cursor.seen)hoverAt(pointer.x,pointer.y);
  }
  if(cursor.active||(stage!=='closed'&&stage!=='ending'))frame=requestAnimationFrame(tick);
 }
 function animate(ms,update,easing=ease){return new Promise(resolve=>{const start=performance.now(),length=reduced.matches?1:easing===inertialEase?inertialDuration(ms):easing===coastEase?coastDuration(ms):ms;function step(now){const t=clamp((now-start)/length,0,1);update(reduced.matches?1:easing(t,ms));if(t<1)requestAnimationFrame(step);else resolve()}requestAnimationFrame(step)})}
 const landingEase=t=>t*t*t*(t*(t*6-15)+10);
 function prepareLattice(cx,cy){
  pull.value=1;pull.velocity=pull.energy=0;
  const pitch=cellSize(),aligned=spatial.alignCellCenter(cx,cy,pitch,1);
  pan.x=pan.tx=aligned.x;pan.y=pan.ty=aligned.y;pan.scale=pan.targetScale=1;pan.vx=pan.vy=pan.vs=0;
  lattice.hidden=false;spatial.mount(lattice);spatial.presentation(0,0);
  spatial.render(pan,pitch,1,-1,null);
  lattice.style.opacity='1';lattice.style.maskImage='none';lattice.style.filter='none';
 }
 async function followCircle(){
  const id=++landingRun,r=circle.getBoundingClientRect();
  anchor={x:innerWidth/2,y:innerHeight/2,size:cursorDiameter()};
  stage='landing';cursor.active=false;cursor.mode='landing';
  Object.assign(cursor,{x:r.left+r.width/2,y:r.top+r.height/2,size:r.width,alpha:1,glow:0,vx:0,vy:0});
  const start={x:cursor.x,y:cursor.y,size:cursor.size};
  prepareLattice(anchor.x,anchor.y);
  window.dispatchEvent(new Event('opening:dashboard-start'));
  // Pin the pawn disc in the central square before the lattice lights up.
  await animate(420,t=>{
   if(id!==landingRun)return;
   cursor.x=start.x+(anchor.x-start.x)*t;cursor.y=start.y+(anchor.y-start.y)*t;
   cursor.size=start.size+(anchor.size-start.size)*t;cursor.alpha=1;cursor.glow=0;setCircle();
  },landingEase);
  if(id!==landingRun)return;
  await animate(650,t=>{
   if(id!==landingRun)return;
   const pulse=t<.6?landingEase(t/.6):1-.65*landingEase((t-.6)/.4);
   cursor.glow=1.3*pulse;cursor.alpha=1;setCircle();
  },t=>t);
  if(id!==landingRun)return;
  await animate(1250,t=>{
   if(id!==landingRun)return;
   const pulse=t<.3?landingEase(t/.3):t<.55?1:1-landingEase((t-.55)/.45);
   spatial.presentation(0,pulse);spatial.render(pan,cellSize(),1,-1,null);
   cursor.glow=.455*(1-t);cursor.alpha=1-.42*landingEase(clamp((t-.55)/.45,0,1));setCircle();
  },t=>t);
  if(id!==landingRun)return;
  cursor.glow=0;stage='closed';cursor.mode='circle';setCircle();await open();
 }
 async function settleCircle(){
  landingRun++;if(stage==='landing')stage='closed';lattice.hidden=true;lattice.style.opacity='0';spatial.mount(space);spatial.presentation(1,0);
  if(!anchor)return;cursor.active=false;cursor.mode='settling';delete document.body.dataset.cursor;
  const start={x:cursor.x,y:cursor.y,size:cursor.size};
  await animate(200,t=>{cursor.x=start.x+(anchor.x-start.x)*t;cursor.y=start.y+(anchor.y-start.y)*t;cursor.size=start.size+(anchor.size-start.size)*t;setCircle()});cursor.mode='off';
 }
 async function open(){
  if(stage!=='closed'||cursor.mode!=='circle')return;
  stage='opening';cursor.mode='dashboard';cursor.targetSize=cursorDiameter();cursor.targetAlpha=.42;entry=0;
  window.dispatchEvent(new Event('opening:dashboard-start'));onOpen();panel.style.opacity='0';panel.hidden=false;panel.inert=true;
  // The preceding lattice is already gone. Reuse its surface and coordinates.
  spatial.mount(space);spatial.presentation(1,0);lattice.hidden=true;lattice.style.opacity='0';
  spatial.ready.then(failed=>{panel.dataset.imageErrors=String(failed)});
  panel.style.clipPath='none';space.style.opacity='1';spatial.render(pan,cellSize(),1,-1,null);wake();
  await animate(650,t=>{entry=t;panel.style.opacity=String(t)},landingEase);
  panel.style.opacity='';panel.inert=false;stage='open';resumeCursor();wheelUsed=true;
  window.dispatchEvent(new Event('opening:dashboard-ready'));document.querySelector('#workboard-title').focus({preventScroll:true});
 }
 async function close(){
  if(stage!=='open'||viewer.open)return;stage='closing';wheelUsed=true;panel.inert=true;cursor.targetSize=cursorDiameter();cursor.targetAlpha=.58;
  label.hidden=true;window.dispatchEvent(new Event('opening:dashboard-start'));
  await animate(380,t=>{entry=1-t;panel.style.opacity=String(1-t)});
  panel.hidden=true;panel.style.opacity='';stage='closed';cursor.mode='circle';onClose();window.dispatchEvent(new Event('opening:dashboard-closed'));
 }
 function openWork(index){
  viewerIndex=(index+workImages.length)%workImages.length;const item=workImages[viewerIndex];
  const img=document.querySelector('#work-full-image');img.src=item.image;img.alt=item.title;
  document.querySelector('#work-detail-title').textContent=item.title;
  label.hidden=true;
  const opening=!viewer.open;if(opening)viewer.showModal();
  revealDetailContents(opening);
 }
 function resumeCursor(){
  cursor.vx=cursor.vy=0;
  cursor.mode='dashboard';cursor.active=true;cursor.glow=cursor.ring=cursor.ringAlpha=0;
  cursor.tx=pointer.x;cursor.ty=pointer.y;cursor.targetSize=cursorDiameter();cursor.targetAlpha=.42;
  setCircle();wake();
 }
 async function openEnding(){
  if(stage!=='open'||viewer.open||drag)return;
  stage='ending-opening';wheelUsed=true;panel.inert=true;label.hidden=true;
  pan.tx=pan.x;pan.ty=pan.y;pan.vx=pan.vy=pan.vs=0;cursor.active=false;cursor.mode='ending';
  const alpha=cursor.alpha;
  document.body.dataset.view='ending';document.body.dataset.opening='ending-transition';
  await ending.open(t=>{
   const fade=Math.min(1,t*3);panel.style.opacity=String(1-fade);
   panel.style.transform=`translateY(${-32*fade}px)`;cursor.alpha=alpha*(1-fade);setCircle();
  });
  panel.hidden=true;stage='ending';document.body.dataset.opening='ending';
  document.querySelector('#announcement').textContent='흰 폰이 공중에 멈췄습니다. 연락처: hy66004405@gmail.com';
 }
 async function closeEnding(){
  if(stage!=='ending')return;
  stage='ending-closing';wheelUsed=true;panel.hidden=false;wake();
  document.body.dataset.opening='ending-transition';
  await ending.close(t=>{panel.style.opacity=String(t);panel.style.transform=`translateY(${-32*(1-t)}px)`});
  stage='open';panel.inert=false;panel.style.opacity='';panel.style.transform='';
  document.body.dataset.view='dashboard';resumeCursor();
  window.dispatchEvent(new Event('opening:dashboard-ready'));document.querySelector('#workboard-title').focus({preventScroll:true});
 }
 function cancelPlacement(){placementId++;stage='open';panel.inert=false;resumeCursor()}
 async function placeWork(index,selection,keyboard=false){
  if(stage!=='open'||viewer.open)return;
  const id=++placementId;viewerFromKeyboard=keyboard;stage='placing';panel.inert=true;label.hidden=true;
  cursor.active=false;cursor.mode='placing';drag=null;
  // Stop board inertia so the pawn lands on the exact square that was clicked.
  pan.tx=pan.x;pan.ty=pan.y;pan.vx=pan.vy=pan.vs=0;pan.targetScale=pan.scale;
  const start={x:cursor.x,y:cursor.y,size:cursor.size,alpha:cursor.alpha};
  const landedSize=cursorDiameter();
  cursor.glow=reduced.matches?0:.14;cursor.alpha=.68;setCircle();
  await animate(280,t=>{
   if(id!==placementId)return;
   const target=spatial.center(selection),lift=reduced.matches?0:Math.sin(Math.PI*t);
   cursor.x=start.x+(target.x-start.x)*t;cursor.y=start.y+(target.y-start.y)*t-lift*12;
   cursor.size=landedSize;cursor.glow=reduced.matches?0:.14+.86*t;cursor.ring=cursor.ringAlpha=0;cursor.alpha=.68+.3*t;setCircle();
  },t=>1-Math.pow(1-t,2));
  if(id!==placementId)return;
  cursor.glow=cursor.ring=cursor.ringAlpha=0;cursor.mode='placed';stage='open';panel.inert=false;
  openWork(index);setCircle();
 }
 panel.addEventListener('pointerdown',e=>{
  if(stage!=='open'||e.button!==0||e.target.closest('.workboard-toolbar,.workboard-footer'))return;
  drag={x:e.clientX,y:e.clientY,tx:pan.tx,ty:pan.ty,moved:false,id:e.pointerId};suppressClick=false;
 });
 window.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch'&&!drag)return;
  pointer.x=e.clientX;pointer.y=e.clientY;cursor.seen=true;
  if(cursor.active){cursor.tx=pointer.x;cursor.ty=pointer.y;cursor.targetSize=cursor.mode==='dashboard'?(stage==='open'&&images.has(spatial.hit(e.clientX,e.clientY).index)?hoverDiameter():cursorDiameter()):cursorDiameter();wake()}
  if(!drag)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.hypot(dx,dy)>5){drag.moved=true;suppressClick=true;panel.classList.add('is-dragging');if(!panel.hasPointerCapture(e.pointerId))panel.setPointerCapture(e.pointerId)}
  if(drag.moved){const x=drag.tx+dx,y=drag.ty+dy;pullBoard(Math.hypot(x-pan.tx,y-pan.ty));pan.tx=x;pan.ty=y;constrain();wake()}
 });
 const endDrag=()=>{if(!drag)return;const moved=drag.moved;drag=null;panel.classList.remove('is-dragging');if(moved)setTimeout(()=>suppressClick=false,0)};
 window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);
 document.documentElement.addEventListener('pointerleave',()=>{cursor.seen=false;hoverIndex=-1;label.hidden=true});
 panel.addEventListener('wheel',e=>{
  if(viewer.open)return;e.preventDefault();if(stage!=='open')return;
  const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;
  pullBoard(Math.hypot(e.deltaX,e.deltaY)*unit*2.2);
  pan.tx-=(e.deltaX+(e.shiftKey?e.deltaY:0))*unit*2.2;pan.ty-=(e.shiftKey?0:e.deltaY)*unit*2.2;constrain();wake();
 },{passive:false});
 space.addEventListener('click',e=>{if(stage==='open'&&!suppressClick&&!e.target.closest('.has-work')){const hit=spatial.hit(e.clientX,e.clientY),data=images.get(hit.index);if(data)placeWork(data.index,hit)}});
 window.addEventListener('click',e=>{if(cursor.mode==='circle'&&document.body.dataset.scene==='circle'&&!e.target.closest('button,a,dialog'))open()});
 window.addEventListener('keydown',e=>{
  if(stage==='ending'){
   if(['ArrowUp','PageUp','Escape'].includes(e.key)||(e.key===' '&&e.shiftKey)){e.preventDefault();closeEnding()}
   return;
  }
  if(stage==='placing'){if(e.key==='Escape'){e.preventDefault();cancelPlacement()}return}
  if(viewer.open){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();openWork(viewerIndex+(e.key==='ArrowRight'?1:-1))}return}
  if(stage!=='open')return;
  if(!e.repeat&&(e.key==='PageUp'||e.key===' '&&e.shiftKey)&&!e.target.closest('button,a,input,textarea,select')){e.preventDefault();close();return}
  if(e.key==='Escape'){e.preventDefault();close()}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();pullBoard(170);pan.tx+=e.key==='ArrowLeft'?170:e.key==='ArrowRight'?-170:0;pan.ty+=e.key==='ArrowUp'?170:e.key==='ArrowDown'?-170:0;constrain();wake()}
 });
 document.querySelector('#workboard-back').onclick=close;
 document.querySelector('#workboard-ending').onclick=openEnding;
 document.querySelector('#ending-back').onclick=closeEnding;
 ending.root.addEventListener('wheel',e=>{e.preventDefault();if(!e.ctrlKey&&e.deltaY<0&&wheelTravel<= -1&&!wheelUsed)closeEnding()},{passive:false});
 let endingTouchY=0;
 ending.root.addEventListener('touchstart',e=>{endingTouchY=e.touches[0].clientY},{passive:true});
 ending.root.addEventListener('touchmove',e=>{if(e.touches[0].clientY-endingTouchY>28){e.preventDefault();closeEnding()}},{passive:false});
 document.querySelector('#workboard-fit').onclick=e=>{if(stage!=='open')return;overview=!overview;pan.targetScale=overview?Math.min(innerWidth-48,innerHeight-180)/(cellSize()*8):1;pan.tx=pan.ty=0;e.currentTarget.textContent=overview?'가까이 보기 ↗':'넓게 보기 ↙';constrain();wake()};
 viewer.addEventListener('click',e=>{
  if(e.target===viewer||e.target===detailShell){viewer.close();return}
  if(e.target!==detailImage||!detailImage.naturalWidth||!detailImage.naturalHeight)return;
  const box=detailImage.getBoundingClientRect(),scale=Math.min(box.width/detailImage.naturalWidth,box.height/detailImage.naturalHeight);
  const width=detailImage.naturalWidth*scale,height=detailImage.naturalHeight*scale;
  const left=box.left+(box.width-width)/2,top=box.top+(box.height-height)/2;
  if(e.clientX<left||e.clientX>left+width||e.clientY<top||e.clientY>top+height)viewer.close();
 });
 viewer.addEventListener('close',()=>{cancelDetailReveal();resumeCursor();if(viewerFromKeyboard)buttons[viewerIndex]?.focus({preventScroll:true});else document.querySelector('#workboard-title').focus({preventScroll:true})});
 reduced.addEventListener('change',()=>{if(reduced.matches)cancelDetailReveal()});
 window.addEventListener('opening:circle-ready',followCircle);
 window.addEventListener('opening:dashboard',open);
 window.addEventListener('resize',()=>{pointer.x=clamp(pointer.x,0,innerWidth);pointer.y=clamp(pointer.y,0,innerHeight);if(cursor.active){cursor.tx=pointer.x;cursor.ty=pointer.y}spatial.resize();plane.style.setProperty('--cell-size',cellSize()+'px');if(overview)pan.targetScale=Math.min(innerWidth-48,innerHeight-180)/(cellSize()*8);constrain();wake()});
 plane.style.setProperty('--cell-size',cellSize()+'px');
 return {settleCircle,open,close,updateAnchor(next){if(cursor.mode==='landing'||stage==='opening')return true;anchor=next;if(cursor.mode==='circle')cursor.targetSize=cursorDiameter();return cursor.active||cursor.mode==='landing'||stage==='opening'},gridCellSize:cellSize,isOpen:()=>stage!=='closed'};
}
