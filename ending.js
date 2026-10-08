import * as THREE from 'three';
import { createPiece } from './models.js?v=5';
import { inertialEase,inertialDuration,coastProgress,coastDuration } from './motion.js?v=6';

const smooth=t=>t*t*t*(t*(t*6-15)+10);
const clamp=t=>Math.max(0,Math.min(1,t));
export function createEnding(){
 const root=document.querySelector('#ending'),contact=root.querySelector('.ending-contact');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer,scene,camera,pawn,progress=0,coastFrame=0;
 function init(){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=false;renderer.setClearColor(0x111111,0);
  renderer.domElement.setAttribute('aria-hidden','true');root.querySelector('.ending-scene').append(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(28,innerWidth/innerHeight,.1,40);
  camera.position.set(0,.9,7.5);camera.lookAt(0,.2,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x343434,1.4));
  const key=new THREE.DirectionalLight(0xffffff,3.1);key.position.set(-3,5,5);scene.add(key);
  const rim=new THREE.DirectionalLight(0xffffff,2.4);rim.position.set(3,2,-3);scene.add(rim);
  pawn=createPiece('pawn','white');scene.add(pawn);
 }
 function draw(t){
  progress=t;
  root.style.opacity=String(smooth(clamp(t/.26)));
  pawn.position.y=4.4*(1-t);
  pawn.rotation.z=-.09*(1-t);
  const reveal=smooth(clamp((t-.65)/.35));
  contact.style.opacity=String(reveal);contact.style.transform=`translateY(${(1-reveal)*12}px)`;
  renderer.render(scene,camera);
 }
 function transition(from,to,ms,onFrame){
  return new Promise(resolve=>{
   const start=performance.now(),duration=reduced.matches?1:inertialDuration(ms);
   function frame(now){
    const t=clamp((now-start)/duration),motion=inertialEase(t,ms);draw(from+(to-from)*motion);onFrame?.(motion);
    if(t<1)requestAnimationFrame(frame);else resolve();
   }
   requestAnimationFrame(frame);
  });
 }
 window.addEventListener('resize',()=>{
  if(!renderer)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();if(!root.hidden)draw(progress);
 });
 return {
  root,
  async open(onFrame){
   init();cancelAnimationFrame(coastFrame);draw(0);root.hidden=false;root.inert=true;
   await new Promise(resolve=>{
    const start=performance.now();let released=false;
    function frame(now){
     const elapsed=now-start,t=reduced.matches?1:coastProgress(elapsed,800);draw(t);onFrame?.(t);
     if(!released&&(reduced.matches||elapsed>=coastDuration(800))){released=true;root.inert=false;root.querySelector('a').focus({preventScroll:true});resolve()}
     if(!reduced.matches)coastFrame=requestAnimationFrame(frame);
    }
    coastFrame=requestAnimationFrame(frame);
   });
  },
  async close(onFrame){cancelAnimationFrame(coastFrame);root.inert=true;await transition(progress,0,440,onFrame);root.hidden=true}
 };
}
