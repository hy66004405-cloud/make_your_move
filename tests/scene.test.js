import test from 'node:test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {openingPosition,createPiece,createBoard,squarePosition} from '../models.js';
import {categories} from '../content.js';
test('Italian opening retains 32 pieces, with exactly seven developed menu pieces',()=>{
 const p=openingPosition();assert.equal(p.length,32);assert.equal(new Set(p.map(x=>x.square)).size,32);
 assert.deepEqual(p.filter(x=>x.active).map(x=>x.square).sort(),['c3','c4','c5','c6','e4','e5','f3']);
 const active=p.filter(x=>x.active);assert.equal(active.filter(x=>x.type==='pawn').length,3);assert.equal(active.filter(x=>x.type==='bishop').length,2);assert.equal(active.filter(x=>x.type==='knight').length,2);
 for(const x of active)assert.ok(categories[x.category]);
 assert.equal(p.find(x=>x.id==='e1').square,'e1');assert.equal(p.find(x=>x.id==='e8').square,'e8');
});
test('Every chess piece is solid finite geometry, including both colors',()=>{
 for(const type of ['pawn','bishop','knight','rook','queen','king'])for(const color of ['white','black']){
  const model=createPiece(type,color);const box=new THREE.Box3().setFromObject(model);assert.ok(box.max.y>.9);assert.ok(box.min.y>=0);assert.ok(box.max.x-box.min.x>.4);
  for(const m of model.children){assert.equal(m.isMesh,true);assert.ok(m.geometry.attributes.normal);assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));assert.equal(m.material.wireframe,false)}
 }
});
test('Board has 64 solid tiles, dark a1, light h1, and independent fade materials',()=>{
 const b=createBoard();assert.equal(b.children.length,65);
 const a1=squarePosition('a1');const h1=squarePosition('h1');
 const a=b.children.find(m=>m.position.x===a1.x&&m.position.z===a1.z);const h=b.children.find(m=>m.position.x===h1.x&&m.position.z===h1.z);
 assert.ok(a.material.color.r<h.material.color.r);
 const p1=createPiece('pawn','white'),p2=createPiece('pawn','white');p1.userData.materials[0].opacity=0;assert.equal(p2.userData.materials[0].opacity,1);
});
test('All three collections contain usable detail content',()=>{
 assert.equal(Object.keys(categories).length,3);
 for(const [key,c] of Object.entries(categories)){
  assert.equal(c.items.length,key==='taste'?18:3);
  for(const item of c.items){
   for(const k of ['title','tag','art','description'])assert.ok(item[k]?.length>0);
   if(key==='taste'){assert.equal(item.kind,'pinterest');assert.ok(existsSync(new URL('../'+item.image,import.meta.url)));assert.match(item.source,/^https:\/\/www\.pinterest\.com\/pin\/\d+\/$/)}
   else for(const k of ['role','process'])assert.ok(item[k]?.length>0);
  }
 }
});
