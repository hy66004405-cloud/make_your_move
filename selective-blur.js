import * as THREE from 'three';

// Occlusion-aware blur: inactive pieces and a gradual falloff toward board edges.
export function createSelectiveBlur(renderer, scene, pieces, board) {
 const color = new THREE.WebGLRenderTarget(1, 1, {type:THREE.HalfFloatType, samples:2});
 const mask = new THREE.WebGLRenderTarget(1, 1);
 const white = new THREE.MeshBasicMaterial({color:0xffffff, toneMapped:false});
 const black = new THREE.MeshBasicMaterial({color:0x000000, toneMapped:false});
 const boardFalloff = new THREE.ShaderMaterial({
  vertexShader:`varying vec2 boardPosition;void main(){vec4 world=modelMatrix*vec4(position,1.);boardPosition=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}`,
  fragmentShader:`varying vec2 boardPosition;void main(){float edge=max(abs(boardPosition.x),abs(boardPosition.y))/4.08;float blur=smoothstep(.38,1.,edge)*.85;gl_FragColor=vec4(vec3(blur),1.);}`,
  toneMapped:false
 });
 const entries=[];
 board.traverse(o=>{if(o.isMesh)entries.push({mesh:o,original:o.material,mask:boardFalloff})});
 pieces.forEach(p=>p.model.children.forEach(o=>{if(o.isMesh)entries.push({mesh:o,original:o.material,mask:p.glow?black:white})}));
 const material=new THREE.ShaderMaterial({
  uniforms:{image:{value:color.texture},selection:{value:mask.texture},pixel:{value:new THREE.Vector2()},amount:{value:1}},
  vertexShader:'varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`
   uniform sampler2D image;uniform sampler2D selection;uniform vec2 pixel;uniform float amount;varying vec2 uvScreen;
   void main(){
    vec4 sharp=texture2D(image,uvScreen);vec4 soft=vec4(0.);float total=0.;
    for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){
     vec2 offset=vec2(float(x),float(y));float w=exp(-dot(offset,offset)/3.);
     soft+=texture2D(image,uvScreen+offset*pixel)*w;total+=w;
    }}
    float m=texture2D(selection,uvScreen).r;
    gl_FragColor=mix(sharp,soft/total,m*amount);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,depthTest:false,depthWrite:false
 });
 const screen=new THREE.Scene();screen.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
 const camera2D=new THREE.Camera();let width=0,height=0;
 return {
  render(camera,amount=1){
   if(amount<.005){renderer.setRenderTarget(null);renderer.render(scene,camera);return}
   const size=renderer.getDrawingBufferSize(new THREE.Vector2());
   if(size.x!==width||size.y!==height){width=size.x;height=size.y;color.setSize(width,height);mask.setSize(width,height);material.uniforms.pixel.value.set(1.45*renderer.getPixelRatio()/width,1.45*renderer.getPixelRatio()/height)}
   renderer.setRenderTarget(color);renderer.render(scene,camera);
   const glowVisibility=pieces.map(p=>p.glow?.visible);
   const shadows=renderer.shadowMap.enabled;
   try {
    pieces.forEach(p=>{if(p.glow)p.glow.visible=false});
    entries.forEach(e=>e.mesh.material=e.mask);
    renderer.shadowMap.enabled=false;renderer.setRenderTarget(mask);renderer.render(scene,camera);
   } finally {
    entries.forEach(e=>e.mesh.material=e.original);
    pieces.forEach((p,i)=>{if(p.glow)p.glow.visible=glowVisibility[i]});renderer.shadowMap.enabled=shadows;
    renderer.setRenderTarget(null);
   }
   material.uniforms.amount.value=amount;
   renderer.render(screen,camera2D);
  }
 };
}
