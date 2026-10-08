import * as THREE from 'three';
import { glide } from './motion.js?v=6';

export function createPawnFollower(model,{camera,canvas}){
 const rig=new THREE.Group(),center=new THREE.Vector3(0,.55,0),identity=new THREE.Quaternion();
 rig.position.copy(center);
 for(const child of [...model.children]){child.position.sub(center);rig.add(child)}
 model.add(rig);
 const pointer=new THREE.Vector2(),anchor=new THREE.Vector2();
 const manual=new THREE.Quaternion(),target=new THREE.Quaternion(),hover=new THREE.Quaternion();
 const localCamera=new THREE.Quaternion(),delta=new THREE.Quaternion(),axis=new THREE.Vector3();
 const spin=new THREE.Vector3(),sampleSpin=new THREE.Vector3();
 const previousRotation=new THREE.Quaternion(),frameRotation=new THREE.Quaternion();
 const ray=new THREE.Raycaster(),near=new THREE.Vector3(),far=new THREE.Vector3();
 const motion={x:0,y:0,xVelocity:0,yVelocity:0};
 const hoverMotion={x:0,y:0,xVelocity:0,yVelocity:0};
 function resetHover(){anchor.copy(pointer);Object.assign(hoverMotion,{x:0,y:0,xVelocity:0,yVelocity:0})}
 let mode='paused',dragPointer=null,lastX=0,lastY=0,heldX=0,heldY=0;
 function locate(event){pointer.set(THREE.MathUtils.clamp(event.clientX/innerWidth*2-1,-1,1),THREE.MathUtils.clamp(1-event.clientY/innerHeight*2,-1,1))}
 function hitPawn(){
  model.updateWorldMatrix(true,true);camera.updateMatrixWorld();
  near.set(pointer.x,pointer.y,-1).unproject(camera);far.set(pointer.x,pointer.y,1).unproject(camera);
  ray.ray.set(near,far.sub(near).normalize());
  return ray.intersectObject(model,true).length>0;
 }
 window.addEventListener('pointerdown',event=>{
  if(mode!=='following'||dragPointer!==null||event.pointerType==='touch'||event.button!==0||!event.target?.closest?.('.world'))return;
  locate(event);if(!hitPawn())return;
  dragPointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;
  manual.copy(rig.quaternion);resetHover();
  spin.set(0,0,0);
  heldX=motion.x;heldY=motion.y;motion.xVelocity=motion.yVelocity=0;
  canvas.style.cursor='grabbing';
  try{canvas.setPointerCapture(dragPointer)}catch{}
  event.preventDefault();
 });
 window.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch')return;
  locate(event);
  if(dragPointer!==event.pointerId)return;
  const dx=event.clientX-lastX,dy=event.clientY-lastY;
  lastX=event.clientX;lastY=event.clientY;
  const distance=Math.hypot(dx,dy);if(!distance)return;
  // Accumulate unrestricted turns around the camera's axes. Convert those
  // axes into the tilted model's space so the pawn stays under the hand.
  model.getWorldQuaternion(localCamera).invert().multiply(camera.quaternion);
  axis.set(dy,dx,0).normalize().applyQuaternion(localCamera);
  delta.setFromAxisAngle(axis,distance*.012);
  manual.premultiply(delta).normalize();
 },{passive:true});
 function finishDrag(event){
  if(dragPointer===null||(event?.pointerId!==undefined&&event.pointerId!==dragPointer))return;
  const id=dragPointer;dragPointer=null;manual.copy(rig.quaternion);resetHover();canvas.style.cursor='grab';
  if(event?.type!=='pointerup')spin.set(0,0,0);
  try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}catch{}
 }
 window.addEventListener('pointerup',finishDrag);
 window.addEventListener('pointercancel',finishDrag);
 canvas.addEventListener('lostpointercapture',finishDrag);
 window.addEventListener('blur',()=>finishDrag());
 function update(dt,reduced){
  if(mode==='paused')return;
  const following=mode==='following',dragging=dragPointer!==null;
  previousRotation.copy(rig.quaternion);
  if(reduced||!following)spin.set(0,0,0);
  else if(!dragging){
   // Integrate the visible release velocity, retaining the pose as it settles.
   const speed=spin.length(),decay=Math.exp(-4.6*dt);
   if(speed>.003){
    axis.copy(spin).divideScalar(speed);
    delta.setFromAxisAngle(axis,speed*(1-decay)/4.6);
    manual.premultiply(delta).normalize();
    spin.multiplyScalar(decay);
   }else spin.set(0,0,0);
  }
  if(!following)target.identity();
  else if(dragging||reduced)target.copy(manual);
  else{
   // Smooth unwrapped angles first, so a quick full turn cannot collapse
   // into the quaternion's shortest path back to the starting pose.
   glide(hoverMotion,'x',(pointer.x-anchor.x)*Math.PI,'xVelocity',dt,8);
   glide(hoverMotion,'y',-(pointer.y-anchor.y)*Math.PI,'yVelocity',dt,8);
   const x=hoverMotion.x,y=hoverMotion.y;
   // Hover follows screen directions even after a full manual turn.
   model.getWorldQuaternion(localCamera).invert().multiply(camera.quaternion);
   hover.setFromEuler(new THREE.Euler(y,x,0,'YXZ'));
   hover.premultiply(localCamera).multiply(localCamera.clone().invert());
   target.copy(manual).premultiply(hover);
  }
  if(following&&!dragging&&!reduced)rig.quaternion.copy(target);
  else rig.quaternion.slerp(target,reduced?1:1-Math.exp(-dt*(dragging?14:6)));
  if(dragging&&!reduced&&dt>0){
   // Sample actual rendered rotation: pausing the hand also removes the fling.
   frameRotation.copy(rig.quaternion).multiply(previousRotation.invert()).normalize();
   if(frameRotation.w<0)frameRotation.set(-frameRotation.x,-frameRotation.y,-frameRotation.z,-frameRotation.w);
   const sinHalf=Math.hypot(frameRotation.x,frameRotation.y,frameRotation.z);
   if(sinHalf>1e-7){
    const speed=Math.min(12,2*Math.atan2(sinHalf,frameRotation.w)/dt);
    sampleSpin.set(frameRotation.x,frameRotation.y,frameRotation.z).multiplyScalar(speed/sinHalf);
   }else sampleSpin.set(0,0,0);
   spin.lerp(sampleSpin,1-Math.exp(-24*dt));
  }
  const targets=dragging?{x:heldX,y:heldY}:{x:following&&!reduced?pointer.x*.16:0,y:following&&!reduced?pointer.y*.1:0};
  for(const [key,value] of Object.entries(targets)){
   if(reduced){motion[key]=value;motion[key+'Velocity']=0}
   else glide(motion,key,value,key+'Velocity',dt,8);
  }
  rig.position.set(motion.x,center.y+motion.y,0);
 }
 function capture(){return {quaternion:rig.quaternion.clone(),position:rig.position.clone(),motion:{...motion}}}
 function morph(pose,progress){rig.quaternion.slerpQuaternions(pose.quaternion,identity,progress);rig.position.lerpVectors(pose.position,center,progress)}
 function resume(pose){
  Object.assign(motion,pose.motion,{xVelocity:0,yVelocity:0});
  manual.copy(pose.quaternion);resetHover();
  spin.set(0,0,0);
  rig.quaternion.copy(pose.quaternion);rig.position.copy(pose.position);mode='following';
 }
 return {update,capture,morph,resume,activate(){manual.copy(rig.quaternion);resetHover();spin.set(0,0,0);mode='following'},settle(){finishDrag();spin.set(0,0,0);mode='settling'},pause(){finishDrag();spin.set(0,0,0);mode='paused'},get dragging(){return dragPointer!==null},get offset(){return {x:rig.position.x,y:rig.position.y-center.y}}};
}
