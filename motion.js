// Measured from the latest reference video: displacement retains ~55% per 100 ms.
// One exponential follower gives an immediate response and a continuous settling tail.
const clamp=value=>Math.max(0,Math.min(1,value));
export const coastSeconds=.17;
const responseMs=coastSeconds*1000;
export const coastDuration=()=>-responseMs*Math.log(.3);
export const coastProgress=elapsed=>1-Math.exp(-Math.max(0,elapsed)/responseMs);
export const coastEase=value=>coastProgress(clamp(value)*coastDuration());
export const inertialDuration=base=>Math.max(800,Math.min(base,1150));
export function inertialEase(value,base=400){
 const span=inertialDuration(base),end=Math.exp(-span/responseMs);
 return (1-Math.exp(-clamp(value)*span/responseMs))/(1-end);
}
export function glide(object,key,target,velocityKey,seconds,frequency){
 const offset=object[key]-target,step=(object[velocityKey]+frequency*offset)*seconds,decay=Math.exp(-frequency*seconds);
 object[key]=target+(offset+step)*decay;
 object[velocityKey]=(object[velocityKey]-frequency*step)*decay;
}
