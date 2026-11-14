import {safeImageURL} from './engine.js';
export async function loadPreview(raw,signal){
  const url=safeImageURL(raw);if(!url)throw new Error('Unsupported preview URL.');
  const res=await fetch(url,{credentials:'omit',redirect:'error',signal});
  if(!res.ok||!/^image\/(jpeg|png|webp)(;|$)/i.test(res.headers.get('content-type')||''))throw new Error('Preview is unavailable.');
  const max=3*1024*1024;if(Number(res.headers.get('content-length'))>max)throw new Error('Preview is too large.');
  const reader=res.body.getReader(),parts=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max)throw new Error('Preview is too large.');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bitmap=await createImageBitmap(new Blob(parts));
  try{
    const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height)),canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.7}),bytes=new Uint8Array(await blob.arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
  }finally{bitmap.close();}
}
