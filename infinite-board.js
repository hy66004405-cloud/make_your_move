import * as THREE from 'three';
const mod=(n,d)=>((n%d)+d)%d;
const perspectiveStrength=.27,flatRadius=.35;
export function surfaceDepth(nx,ny){
 const distance=Math.max(0,Math.hypot(nx,ny)-flatRadius);
 return perspectiveStrength*distance*distance/(1+distance);
}
export function perspectiveScale(nx,ny){
 // Intersect the camera ray with the same recessed surface used by the mesh.
 let lo=1,hi=32;
 for(let i=0;i<30;i++){
  const scale=(lo+hi)/2;
  if(scale<1+surfaceDepth(nx*scale,ny*scale))lo=scale;else hi=scale;
 }
 return (lo+hi)/2;
}
// Screen coordinates are picked through the perspective camera, not a screen warp.
export function boardPoint(x,y,width,height,tile,scale,panX,panY){
 const px=x-width/2,py=y-height/2,nx=px/(width/2),ny=py/(height/2);
 const lens=perspectiveScale(nx,ny),pitch=tile*scale;
 const bx=(px*lens-panX)/pitch+4,by=(py*lens-panY)/pitch+4;
 const col=Math.floor(bx),row=Math.floor(by);
 return {col,row,u:bx-col,v:by-row,index:mod(row,8)*8+mod(col,8)};
}
export function createInfiniteBoard(host,images){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.setClearColor(0x000000,1);
 const canvas=renderer.domElement;canvas.className='workboard-canvas';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
 const atlas=document.createElement('canvas');atlas.width=atlas.height=innerWidth<=650?2048:4096;
 const ctx=atlas.getContext('2d'),size=atlas.width/8;
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  ctx.fillStyle=(row+col)%2?'#000000':'#272725';ctx.fillRect(col*size,row*size,size,size);
 }
 const texture=new THREE.CanvasTexture(atlas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
 const motion=Array.from({length:64},()=>({x:0,y:0,vx:0,vy:0}));
 const uniforms={imageAmount:{value:1},lineAmount:{value:0},atlas:{value:texture},resolution:{value:new THREE.Vector2(innerWidth,innerHeight)},pan:{value:new THREE.Vector2()},pitch:{value:250},hoverState:{value:Array.from({length:64},()=>new THREE.Vector3())},atlasInset:{value:1/size}};
 const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
  vertexShader:'varying vec2 boardPixel;varying float depth;void main(){boardPixel=vec2(position.x,-position.y);depth=-position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`
   uniform float imageAmount;uniform float lineAmount;uniform sampler2D atlas;uniform vec2 resolution;uniform vec2 pan;uniform float pitch;uniform vec3 hoverState[64];uniform float atlasInset;varying vec2 boardPixel;varying float depth;
   void main(){
    vec2 board=(boardPixel-pan)/pitch+4.;
    vec2 cell=mod(floor(board),8.);vec2 local=fract(board);
    float index=cell.y*8.+cell.x;
    vec3 state=hoverState[int(index+.5)];float hover=state.z;
    // Move the photo inside its fixed square, leaving enough crop for parallax.
    vec2 photo=.5+(local-.5)/(1.+hover*.22)-state.xy*hover;
    photo=clamp(photo,vec2(atlasInset),vec2(1.-atlasInset));
    vec2 imageUV=(cell+photo)/8.;
    vec4 color=texture2D(atlas,vec2(imageUV.x,1.-imageUV.y));
    float edge=max(abs(local.x-.5),abs(local.y-.5))*2.;
    float border=smoothstep(.987-fwidth(edge),.987+fwidth(edge),edge);
    color.rgb*=1.+hover*.1;
    color.rgb=mix(color.rgb,vec3(.94),border*hover*.5);
    color.rgb*=1.-.10*clamp(depth/resolution.y,0.,1.);
    // The image cells and luminous edges share the same interpolated coordinates.
    vec2 edgePixels=min(local,1.-local)/max(fwidth(board),vec2(.00001));
    float edgeDistance=min(edgePixels.x,edgePixels.y);
    float line=1.-smoothstep(.65,1.65,edgeDistance);
    float halo=.24*exp(-edgeDistance*edgeDistance/20.);
    color.rgb=color.rgb*imageAmount+vec3((line+halo)*lineAmount);
    gl_FragColor=vec4(color.rgb,1.);
    #include <colorspace_fragment>
   }`
 });
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,1,100000);
 const surface=new THREE.Mesh(new THREE.BufferGeometry(),material);surface.frustumCulled=false;scene.add(surface);
 function frameSurface(){
  const width=innerWidth,height=innerHeight,distance=height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  camera.aspect=width/height;camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const geometry=new THREE.PlaneGeometry(width*5,height*5,180,140),positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++)positions.setZ(i,-distance*surfaceDepth(positions.getX(i)/(width/2),positions.getY(i)/(height/2)));
  positions.needsUpdate=true;surface.geometry.dispose();surface.geometry=geometry;
 }
 frameSurface();
 const ready=Promise.allSettled([...images].map(async([index,{item}])=>{
  const img=new Image();img.src=item.thumbnail||item.image;await img.decode();
  const fit=Math.max(size/img.naturalWidth,size/img.naturalHeight),w=img.naturalWidth*fit,h=img.naturalHeight*fit;
  const x=index%8*size,y=Math.floor(index/8)*size;ctx.save();ctx.beginPath();ctx.rect(x,y,size,size);ctx.clip();ctx.drawImage(img,x+(size-w)/2,y+(size-h)/2,w,h);ctx.restore();
 })).then(results=>{texture.needsUpdate=true;return results.filter(r=>r.status==='rejected').length});
 let current={tile:250,scale:1,x:0,y:0},lastHoverTime=performance.now();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 return {
  ready,
  alignCellCenter(x,y,tile,scale=1){
   const px=x-innerWidth/2,py=y-innerHeight/2,lens=perspectiveScale(px/(innerWidth/2),py/(innerHeight/2)),pitch=tile*scale;
   return {x:px*lens-pitch/2,y:py*lens-pitch/2};
  },
  mount(target){target.append(canvas)},
  presentation(images,lines){uniforms.imageAmount.value=images;uniforms.lineAmount.value=lines},
  render(pan,tile,entry,hover,pointer){
   const scale=pan.scale,period=tile*scale*8;
   // Rebase only the shader coordinates: long sessions retain numerical precision.
   const x=mod(pan.x+period/2,period)-period/2,y=mod(pan.y+period/2,period)-period/2;
   current={tile,scale,x,y};uniforms.pan.value.set(x,y);uniforms.pitch.value=tile*scale;
   const now=performance.now(),dt=Math.min(64,now-lastHoverTime);lastHoverTime=now;
   const blend=reduced.matches?1:1-Math.exp(-dt/110);
   const hit=pointer?boardPoint(pointer.x,pointer.y,innerWidth,innerHeight,tile,scale,x,y):null;
   const active=hit?(images.has(hit.index)?hit.index:-1):hover;
   const steps=Math.max(1,Math.ceil(dt/8)),step=dt/1000/steps;
   for(let i=0;i<64;i++){
    const state=uniforms.hoverState.value[i],m=motion[i];
    const targetX=!reduced.matches&&hit&&i===active?(hit.u-.5)*.13:0;
    const targetY=!reduced.matches&&hit&&i===active?(hit.v-.5)*.13:0;
    // A damped spring carries a little momentum through direction changes.
    if(reduced.matches){m.x=m.y=m.vx=m.vy=0}
    else for(let s=0;s<steps;s++){
     m.vx+=((targetX-m.x)*170-m.vx*22)*step;m.vy+=((targetY-m.y)*170-m.vy*22)*step;
     m.x+=m.vx*step;m.y+=m.vy*step;
    }
    state.set(m.x,m.y,state.z+((i===active?1:0)-state.z)*blend);
   }
   renderer.render(scene,camera);
  },
  hit(x,y){return boardPoint(x,y,innerWidth,innerHeight,current.tile,current.scale,current.x,current.y)},
  center(selection){
   const pitch=current.tile*current.scale;
   const col=selection.col??selection.index%8+8*Math.round((3.5-selection.index%8-current.x/pitch)/8);
   const row=selection.row??Math.floor(selection.index/8)+8*Math.round((3.5-Math.floor(selection.index/8)-current.y/pitch)/8);
   const bx=(col+.5-4)*pitch+current.x,by=(row+.5-4)*pitch+current.y;
   const distance=camera.position.z,z=-distance*surfaceDepth(bx/(innerWidth/2),by/(innerHeight/2));
   const point=new THREE.Vector3(bx,-by,z).project(camera);
   return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2};
  },
  resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);uniforms.resolution.value.set(innerWidth,innerHeight);frameSurface()}
 };
}
