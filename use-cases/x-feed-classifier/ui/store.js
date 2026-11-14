import {DEFAULTS,cleanSettings} from '../lib/engine.js';
export const isExtension=!!globalThis.chrome?.runtime?.id;
const initial=()=>({settings:{...DEFAULTS},hasKey:false,rememberKey:false,feedbackCount:0,calls:0,lastError:'',cooldown:0});
export async function send(type,payload={}){
  if(isExtension){const r=await chrome.runtime.sendMessage({type,...payload});if(!r?.ok)throw new Error(r?.error||'Reload the extension and refresh X.');return r.result;}
  let s;try{s={...initial(),...JSON.parse(localStorage.getItem('sift-preview-v2')||'{}')};}catch{s=initial();}
  if(type==='STATE')return s;
  if(type==='PAUSE')s.settings.enabled=!s.settings.enabled;
  if(type==='SETTINGS')s.settings=cleanSettings({...s.settings,...payload.settings});
  if(type==='CONNECT')throw new Error('Load Sift in Chrome to connect Jev.');
  if(type==='RESET_USAGE')s.calls=0;
  if(type==='RESET_FEEDBACK')s.feedbackCount=0;
  if(type==='DISCONNECT')s.hasKey=false;
  localStorage.setItem('sift-preview-v2',JSON.stringify(s));return {ok:true};
}
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const mark=()=>'<span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
export function toast(text){const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');clearTimeout(globalThis.toastTimer);globalThis.toastTimer=setTimeout(()=>el.classList.remove('show'),3000);}
