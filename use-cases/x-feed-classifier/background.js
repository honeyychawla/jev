import {DEFAULTS,cleanSettings,normalizePost,normalizeFeedback,cacheMaterial,localClassify,buildJevRequest,parseJevResponse,allowedFeed} from './lib/engine.js';
import {loadPreview} from './lib/media.js';
import {API,API_ORIGIN,validOpenRouterKey} from './lib/provider.js';
const ready=Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
let lock=Promise.resolve(),running=0,generation=0;const waiters=[],jobs=new Map(),controllers=new Set();
function exclusive(fn){const p=lock.then(fn);lock=p.catch(()=>{});return p;}
async function limited(fn){if(running>=2)await new Promise(resolve=>waiters.push(resolve));else running++;try{return await fn();}finally{const next=waiters.shift();if(next)next();else running--;}}
async function state(){
  await ready;const [l,s]=await Promise.all([chrome.storage.local.get(['settings','openRouterRememberedKey','feedback','overrides','revision']),chrome.storage.session.get(['openRouterApiKey','calls','lastError','cooldown'])]);
  return {settings:cleanSettings({...DEFAULTS,...l.settings}),hasKey:!!(s.openRouterApiKey||l.openRouterRememberedKey),rememberKey:!!l.openRouterRememberedKey,feedbackCount:normalizeFeedback(l.feedback).length,calls:s.calls||0,lastError:s.lastError||'',cooldown:s.cooldown||0};
}
async function hash(v){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function invalidate(){generation++;for(const c of controllers)c.abort();}
async function broadcast(){const tabs=await chrome.tabs.query({url:['https://x.com/*','https://twitter.com/*']});await Promise.allSettled(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'REFRESH'})));}
async function publishStatus(){const s=await state();if(chrome.action?.setBadgeText){await chrome.action.setBadgeText({text:s.settings.enabled&&!s.hasKey?'!':''});await chrome.action.setBadgeBackgroundColor({color:'#6f5b2e'});}}
async function api(post,settings,key,feedback=[],signal){
  const images=[];let evidence='Visible text, quote, link preview and image alt text';
  if(settings.analyzeImages&&post.images.length&&await chrome.permissions.contains({origins:['https://pbs.twimg.com/*']})){
    const results=await Promise.allSettled(post.images.map(url=>loadPreview(url,AbortSignal.any([signal,AbortSignal.timeout(5000)]))));
    for(const r of results)if(r.status==='fulfilled')images.push(r.value);
    evidence+=images.length?` + ${images.length} image preview${images.length>1?'s':''}`:'; image previews could not be loaded';
  }
  if(post.hasVideo)evidence+='; full video and audio not analyzed';
  const body=buildJevRequest(post,settings,feedback,images);
  const res=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',redirect:'error',signal});
  if(!res.ok){
    const messages={401:'OpenRouter rejected the key. Reconnect using an OpenRouter API key.',403:'OpenRouter denied access to Jev. Check the key and your account settings.',402:'Your OpenRouter account needs credits, or this key has reached its spending limit.',404:'OpenRouter could not find the configured Jev model. Check that Jev is available.',429:'OpenRouter is limiting requests. Wait a moment, then retry.'};
    const error=new Error(messages[res.status]||`OpenRouter returned HTTP ${res.status}. Open Sift and retry.`);
    const retry=res.headers?.get('retry-after');const seconds=Number(retry)||((Date.parse(retry)-Date.now())/1000);
    error.cooldown=res.status===429?Math.min(300000,Math.max(30000,(seconds||60)*1000)):30000;throw error;
  }
  const data=await res.json();
  if(data?.error)throw new Error('OpenRouter could not complete the Jev request. Check your OpenRouter activity and retry.');
  return parseJevResponse(data,settings,{...post,evidence});
}
function unavailable(post,settings,message){
  if(settings.basicFallback)return {...localClassify(post,settings),fallback:true,note:message};
  return {label:'context',action:'unavailable',source:'unavailable',confidence:null,reasons:[message],evidence:'Jev has not classified this post.'};
}
async function classify(raw){
  const post=normalizePost(raw),start=generation,s=await state();if(!s.settings.enabled)return {paused:true};
  const l=await chrome.storage.local.get(['overrides','feedback','revision']);const override=l.overrides?.[post.url];
  if(override&&['read','skip'].includes(override.action))return {label:override.action==='read'?'read':'offtopic',action:override.action,source:'you',confidence:null,reasons:['Your preference for this post.'],evidence:'You chose this verdict.'};
  if(!s.hasKey)return unavailable(post,s.settings,'Connect Jev in the Sift popup to classify your feed.');
  const fp=await hash(cacheMaterial(post,s.settings,l.revision||0));
  const {cache={}}=await chrome.storage.session.get('cache');if(cache[fp])return cache[fp];
  if(jobs.has(fp))return jobs.get(fp);
  const job=limited(async()=>{
    const reserved=await exclusive(async()=>{
      const current=await state();if(start!==generation||!current.settings.enabled)return {paused:true};
      if(current.cooldown>Date.now())return {error:current.lastError||'Jev is temporarily unavailable. Retry from the popup.'};
      if(current.calls>=current.settings.sessionLimit)return {error:'Session check limit reached. Open settings to reset usage or raise the limit.'};
      const [session,local]=await Promise.all([chrome.storage.session.get('openRouterApiKey'),chrome.storage.local.get('openRouterRememberedKey')]);
      const key=session.openRouterApiKey||local.openRouterRememberedKey;if(!key)return {error:'Reconnect Jev in the Sift popup.'};
      await chrome.storage.session.set({calls:current.calls+1});return {key};
    });
    if(reserved.paused)return {paused:true};
    if(reserved.error)return unavailable(post,s.settings,reserved.error);
    const controller=new AbortController();controllers.add(controller);
    try{
      const result=await api(post,s.settings,reserved.key,normalizeFeedback(l.feedback),AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]));
      if(start!==generation)return {paused:true};
      await exclusive(async()=>{const {cache={}}=await chrome.storage.session.get('cache');cache[fp]=result;await chrome.storage.session.set({cache:Object.fromEntries(Object.entries(cache).slice(-400)),lastError:'',cooldown:0});});
      return result;
    }catch(error){
      if(start!==generation)return {paused:true};
      const message=error.name==='TimeoutError'?'Jev took too long. Open Sift and retry.':error.message==='Failed to fetch'?'Cannot reach Jev. Check your connection and retry.':error.message;
      await exclusive(()=>chrome.storage.session.set({lastError:message,cooldown:Date.now()+(error.cooldown||30000)}));
      return unavailable(post,s.settings,message);
    }finally{controllers.delete(controller);}
  }).finally(()=>jobs.delete(fp));jobs.set(fp,job);return job;
}
async function connect(m){
  if(!validOpenRouterKey(m.key))throw new Error('Enter an OpenRouter API key beginning with sk-or-. A direct TypeSafe key will not work here.');
  if(!await chrome.permissions.contains({origins:[API_ORIGIN]}))throw new Error('Allow OpenRouter access to connect Jev.');
  const s=await state(),key=m.key.trim();const controller=new AbortController();controllers.add(controller);const start=generation;
  try{await api(normalizePost({text:'This short beginner tutorial explains how to use an AI assistant to summarize your own notes and check its sources.'}),s.settings,key,[],AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]));if(start!==generation)throw new Error('Settings changed during connection. Please connect again.');}finally{controllers.delete(controller);}
  invalidate();await exclusive(async()=>{
    if(m.remember===true)await chrome.storage.local.set({openRouterRememberedKey:key});else await chrome.storage.local.remove('openRouterRememberedKey');
    await chrome.storage.session.set({openRouterApiKey:key,lastError:'',cooldown:0,cache:{},calls:0});
  });await publishStatus();await broadcast();return {ok:true};
}
async function handle(m,sender){
  if(sender.id!==chrome.runtime.id)throw new Error('Untrusted sender.');const own=sender.url?.startsWith(chrome.runtime.getURL(''));
  if(!own&&!allowedFeed(sender.url))throw new Error('Sift is inactive on this page.');
  if(m.type==='STATE'){const s=await state();return own?s:{settings:s.settings,hasKey:s.hasKey};}
  if(m.type==='CLASSIFY')return classify(m.post);
  if(m.type==='OPEN'){await chrome.runtime.openOptionsPage();return {ok:true};}
  if(m.type==='FEEDBACK'){
    const p=normalizePost(m.post);if(!p.url||!['read','skip','reset'].includes(m.action))throw new Error('This post cannot be corrected.');
    invalidate();await exclusive(async()=>{
      const {overrides={},feedback=[],revision=0}=await chrome.storage.local.get(['overrides','feedback','revision']);
      if(m.action==='reset')delete overrides[p.url];else overrides[p.url]={action:m.action};
      const examples=normalizeFeedback(feedback).filter(x=>x.text!==p.text.slice(0,800));
      if(m.action!=='reset'&&p.text.trim())examples.push({text:p.text.slice(0,800),decision:m.action});
      await chrome.storage.local.set({overrides:Object.fromEntries(Object.entries(overrides).slice(-500)),feedback:examples.slice(-20),revision:revision+1});
    });await broadcast();return {ok:true};
  }
  if(!own)throw new Error('Only Sift settings may change configuration.');
  if(m.type==='CONNECT')return connect(m);
  if(m.type==='SETTINGS'||m.type==='PAUSE'){
    invalidate();await exclusive(async()=>{const s=await state();await chrome.storage.local.set({settings:cleanSettings(m.type==='PAUSE'?{...s.settings,enabled:!s.settings.enabled}:{...s.settings,...m.settings})});});await publishStatus();await broadcast();return {ok:true};
  }
  if(m.type==='DISCONNECT'){
    invalidate();await exclusive(async()=>{await chrome.storage.local.remove('openRouterRememberedKey');await chrome.storage.session.remove(['openRouterApiKey','cache','cooldown','lastError']);});await publishStatus();await broadcast();return {ok:true};
  }
  if(m.type==='RETRY'||m.type==='RESET_USAGE'){
    invalidate();await exclusive(()=>chrome.storage.session.remove(m.type==='RESET_USAGE'?['calls','cooldown','lastError']:['cooldown','lastError']));await broadcast();return {ok:true};
  }
  if(m.type==='RESET_FEEDBACK'){
    invalidate();await exclusive(async()=>{const {revision=0}=await chrome.storage.local.get('revision');await chrome.storage.local.set({feedback:[],overrides:{},revision:revision+1});});await broadcast();return {ok:true};
  }
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{handle(m,sender).then(result=>respond({ok:true,result}),error=>respond({ok:false,error:error.message}));return true;});
chrome.runtime.onInstalled.addListener(async()=>{
  await ready;
  await exclusive(async()=>{
    const {settings}=await chrome.storage.local.get('settings');
    await chrome.storage.local.set({settings:cleanSettings({...DEFAULTS,...settings})});
    // Never send a credential saved for TypeSafe to a different provider.
    await chrome.storage.local.remove('rememberedKey');
    await chrome.storage.session.remove(['apiKey','cache','lastError','cooldown']);
  });
  await publishStatus();
});
chrome.runtime.onStartup?.addListener(()=>publishStatus().catch(()=>{}));
