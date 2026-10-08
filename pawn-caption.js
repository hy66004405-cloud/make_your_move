export function createPawnCaption(element){
 const hello=element.querySelector('[data-pawn-hello]');
 const move=element.querySelector('[data-pawn-move]');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let animations=[],labelTimer=0,finishTimer=0,run=0;
 function clear(){clearTimeout(labelTimer);clearTimeout(finishTimer);animations.forEach(animation=>animation.cancel());animations=[]}
 function show(event){
  ++run;clear();element.hidden=false;element.setAttribute('aria-hidden','false');
  window.dispatchEvent(new Event('opening:pawn-caption-active'));
  element.setAttribute('aria-label','Hello, player.');
  element.style.opacity='1';element.style.transform='translateY(-50%)';
  const easing='cubic-bezier(.22,.68,.22,1)';
  const entrance=reduced.matches?1:300;
  const hold=500;
  const departure=reduced.matches?1:400;
  const firstDuration=entrance+hold+departure;
  animations.push(hello.animate([
   {opacity:0,transform:reduced.matches?'translateX(0)':'translateX(24px)',offset:0,easing},
   {opacity:1,transform:'translateX(0)',offset:entrance/firstDuration},
   {opacity:1,transform:'translateX(0)',offset:(entrance+hold)/firstDuration,easing:'cubic-bezier(.45,.05,.8,.65)'},
   {opacity:0,transform:reduced.matches?'translateX(0)':'translateX(-100%)',offset:1}
  ],{duration:firstDuration,delay:250,easing:'linear',fill:'both'}));
  const nextAt=250+firstDuration;
  animations.push(move.animate([
   {opacity:0,transform:reduced.matches?'translateX(0)':'translateX(24px)'},
   {opacity:1,transform:'translateX(0)'}
  ],{duration:reduced.matches?150:900,delay:nextAt,easing,fill:'both'}));
  labelTimer=setTimeout(()=>element.setAttribute('aria-label','Make your move!'),nextAt);
  const current=run;
  if(!event?.detail?.restored)finishTimer=setTimeout(()=>{
   if(current!==run)return;hide();
   window.dispatchEvent(new Event('opening:caption-complete'));
  },nextAt+(reduced.matches?150:900)+800);
 }
 function hide(){
  if(element.hidden)return;
  window.dispatchEvent(new Event('opening:pawn-caption-inactive'));
  const current=++run;clearTimeout(labelTimer);clearTimeout(finishTimer);element.setAttribute('aria-hidden','true');
  const exit=element.animate([
   {opacity:getComputedStyle(element).opacity,transform:'translateY(-50%) translateX(0)'},
   {opacity:0,transform:`translateY(-50%) translateX(${reduced.matches?0:-16}px)`}
  ],{duration:reduced.matches?1:220,easing:'cubic-bezier(.22,.68,.22,1)',fill:'forwards'});
  animations.push(exit);
  exit.onfinish=()=>{if(current!==run)return;element.hidden=true;clear()};
 }
 function place(x,y){
  if(element.hidden)return;
  if(innerWidth<=650){
   element.style.left='24px';element.style.top=(innerHeight*.78)+'px';
   element.style.width=(innerWidth-48)+'px';return;
  }
  const gap=innerWidth<=650?14:26;
  const left=Math.min(x+gap,innerWidth-112);
  element.style.left=left+'px';element.style.top=y+'px';
  element.style.width=Math.max(96,Math.min(1320,innerWidth-left-20))+'px';
 }
 window.addEventListener('opening:pawn-ready',show);
 for(const event of ['opening:circle-start','opening:board-start','opening:side-start'])window.addEventListener(event,hide);
 return {hide,place,get visible(){return !element.hidden}};
}
