(() => {
  if(globalThis.__siftLoaded)return;globalThis.__siftLoaded=true;
  const states=new Map(),treatments=['sift-read','sift-slop','sift-muted'];
  let settings={enabled:true,mode:'highlight'},timer,active=0,lastURL=location.href,refreshId=0;
  const allowed=()=>!/^\/(i\/(chat|grok)|messages|settings|compose|login|account|notifications)(\/|$)/.test(location.pathname);
  const ask=async(type,payload={})=>{const r=await chrome.runtime.sendMessage({type,...payload});if(!r?.ok)throw new Error(r?.error||'Reload X to reconnect Sift.');return r.result;};
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
  function extract(article){
    const texts=[...article.querySelectorAll('[data-testid="tweetText"]')].filter(n=>n.closest('article')===article);
    const quoted=n=>!!n.closest('[data-testid="quoteTweet"],[data-testid="quoteTweet-container"]');
    const main=texts.find(n=>!quoted(n));
    const cards=[...article.querySelectorAll('[data-testid="card.wrapper"]')];
    const photos=[...article.querySelectorAll('[data-testid="tweetPhoto"] img')];
    const video=article.querySelector('video');
    const images=[...photos.map(n=>n.currentSrc||n.src),video?.poster,...[...article.querySelectorAll('[data-testid="videoPlayer"] img')].map(n=>n.currentSrc||n.src)].filter(Boolean);
    const link=article.querySelector('a[href*="/status/"]:has(time)');
    return {url:link?.href||'',text:main?.innerText||'',quotedText:texts.filter(n=>n!==main).map(n=>n.innerText).join('\n'),cardText:[...new Set(cards.map(n=>n.innerText))].join('\n'),altText:photos.map(n=>n.alt).filter(s=>s&&!/^(image|photo|gif)$/i.test(s)).join('\n'),hasMedia:!!(photos.length||video||article.querySelector('[data-testid="videoPlayer"]')),hasVideo:!!(video||article.querySelector('[data-testid="videoPlayer"]')),images:[...new Set(images)].slice(0,2),truncated:!!article.querySelector('[data-testid="tweet-text-show-more-link"]')};
  }
  function position(article){
    const host=article.querySelector(':scope > .sift-verdict');if(!host)return;
    const a=article.getBoundingClientRect(),name=article.querySelector('[data-testid="User-Name"]')?.getBoundingClientRect();
    const controls=[...article.querySelectorAll('[data-testid="caret"],[data-testid="grokActions"]')].map(n=>n.getBoundingClientRect()).filter(r=>r.top<a.top+60);
    const bottom=Math.max(a.top+26,name?.bottom||0,...controls.map(r=>r.bottom));
    const top=Math.max(10,Math.min(86,bottom-a.top+5));host.style.top=top+'px';
    const texts=[...article.querySelectorAll('[data-testid="tweetText"]')];
    for(const text of texts){text.classList.remove('sift-corner-room');const b=text.getBoundingClientRect();if(b.top<a.top+top+50&&b.bottom>a.top+top&&b.right>a.right-62)text.classList.add('sift-corner-room');}
    const media=article.querySelector('[data-testid="tweetPhoto"],[data-testid="videoPlayer"]');if(media&&!texts.length)media.classList.add('sift-media-room');
  }
  const sizes=new ResizeObserver(entries=>{for(const e of entries)position(e.target);});
  function removeBadge(article){article.querySelector(':scope > .sift-verdict')?.remove();for(const n of article.querySelectorAll('.sift-corner-room,.sift-media-room'))n.classList.remove('sift-corner-room','sift-media-room');}
  function restore(article){removeBadge(article);article.classList.remove(...treatments,'sift-positioned');sizes.unobserve(article);}
  function treatment(article,state){
    article.classList.remove(...treatments);const r=state.result;
    if(!settings.enabled||settings.mode==='highlight'||!r||state.revealed)return;
    if(r.action==='read')article.classList.add('sift-read');
    if(r.action==='skip'&&settings.mode==='dim')article.classList.add('sift-muted');
    if(r.label==='slop'&&settings.mode==='strike')article.classList.add('sift-slop');
  }
  const titles={read:'Worth exploring',skip:'Skip this',unsure:'Needs a closer look',unavailable:'Connect or retry Jev'};
  function badge(article,state,result){
    removeBadge(article);if(getComputedStyle(article).position==='static')article.classList.add('sift-positioned');
    const host=node('div',null,'sift-verdict'),root=host.attachShadow({mode:'open'}),style=node('style');
    style.textContent=`:host{position:absolute;inset-inline-end:12px;z-index:4;display:block;width:40px;font:13px/1.45 system-ui,sans-serif;color:inherit}*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #70b5ee;outline-offset:3px}.marker{display:flex;align-items:center;flex-direction:column;justify-content:center;gap:2px;min-height:48px;width:40px;padding:2px;border:0;border-radius:6px;background:transparent;color:inherit}.marker:hover{background:#8899aa20}.emoji{font:28px/32px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}.confidence{font:600 11px/14px system-ui;font-variant-numeric:tabular-nums}.pending{opacity:.55}.details{position:absolute;inset-inline-end:0;top:54px;width:min(280px,calc(100vw - 60px));padding:16px;border:1px solid #727a80;border-radius:10px;color:CanvasText;background:Canvas;color-scheme:light dark;box-shadow:0 6px 20px #0003;overflow-wrap:anywhere}.details[hidden]{display:none}h3{font-size:15px;line-height:1.4;margin:0 22px 8px 0}p{margin:8px 0;font-size:12px}.meta{opacity:.8;font-size:11px}.close{position:absolute;right:8px;top:7px;border:0;background:none;color:inherit;padding:3px 8px;font-size:20px}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.actions button{border:1px solid #727a80;border-radius:5px;padding:7px;background:transparent;color:inherit;font-size:11px}.actions button:hover{background:#8899aa20}.note{font-size:11px}.message{margin:0;color:inherit}`;
    root.append(style);const action=result?.action||'pending',title=result?titles[action]||titles.unsure:'Checking with Jev';
    const hasConfidence=result?.source==='jev'&&Number.isFinite(result.confidence),score=hasConfidence?Math.round(result.confidence*100)+'%':'—';
    const icon=result?(action==='read'?'👍':action==='skip'?'👎':action==='unavailable'?'🔌':'🤔'):'⏳';
    const reason=result?.reasons?.join(' ')||'A decision is on its way.';
    const source=result?.source==='jev'?'Jev':result?.source==='you'?'Your preference':result?.source==='local'?'Basic estimate — not Jev':'Not classified';
    const button=node('button',null,'marker'+(!result?' pending':''));button.type='button';button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',`${title}. ${hasConfidence?score+' Jev decision confidence. ':''}${source}. ${reason}`);button.title=button.getAttribute('aria-label')+' Click for details.';
    const emoji=node('span',icon,'emoji'),confidence=node('span',score,'confidence');emoji.setAttribute('aria-hidden','true');confidence.setAttribute('aria-hidden','true');button.append(emoji,confidence);
    const details=node('section',null,'details');details.hidden=true;details.setAttribute('aria-label','Sift decision details');
    const close=node('button','×','close');close.type='button';close.setAttribute('aria-label','Close details');
    details.append(close,node('h3',title),node('p',reason),node('p',hasConfidence?`${source} · ${score} confidence in its read/skip/unsure choice. This is not a truth or quality percentage.`:source,'meta'));
    if(result?.evidence)details.append(node('p',result.evidence,'meta'));
    if(result?.hasVideo)details.append(node('p','A poster can help identify the topic. It cannot establish what happens in the whole video.','meta'));
    const actions=node('div',null,'actions'),message=node('p',null,'message');message.setAttribute('role','status');
    const actionButton=(label,handler)=>{const b=node('button',label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await handler();}catch(e){message.textContent=e.message;b.disabled=false;}});actions.append(b);return b;};
    if(action==='unavailable')actionButton('Open Jev setup',()=>ask('OPEN'));
    if(result&&state.post.url){
      actionButton('Useful to me',()=>ask('FEEDBACK',{post:state.post,action:'read'}));actionButton('Not for me',()=>ask('FEEDBACK',{post:state.post,action:'skip'}));
      if(result.source==='you')actionButton('Undo my choice',()=>ask('FEEDBACK',{post:state.post,action:'reset'}));
      details.append(node('p','Your choices personalize future Jev checks.','note'));
    }
    if(result?.action==='skip'&&settings.mode!=='highlight')actionButton('Show normally',async()=>{state.revealed=!state.revealed;treatment(article,state);hide();});
    details.append(actions,message);
    const hide=()=>{details.hidden=true;button.setAttribute('aria-expanded','false');host.style.zIndex='4';};
    button.addEventListener('click',()=>{const open=details.hidden;details.hidden=!open;button.setAttribute('aria-expanded',String(open));host.style.zIndex=open?'20':'4';if(open)close.focus();});
    close.addEventListener('click',()=>{hide();button.focus();});root.addEventListener('keydown',e=>{if(e.key==='Escape'){hide();button.focus();e.stopPropagation();}});
    root.append(button,details);host.addEventListener('click',e=>e.stopPropagation());article.append(host);sizes.observe(article);position(article);
  }
  document.addEventListener('click',e=>{for(const [article]of states){const host=article.querySelector(':scope > .sift-verdict');if(host&&!e.composedPath().includes(host)){const root=host.shadowRoot;root.querySelector('.details').hidden=true;root.querySelector('.marker').setAttribute('aria-expanded','false');host.style.zIndex='4';}}});
  const visible=new IntersectionObserver(entries=>{for(const entry of entries){const s=states.get(entry.target);if(s)s.visible=entry.isIntersecting;}setTimeout(pump,120);},{rootMargin:'180px'});
  function scan(){
    if(!allowed()||!settings.enabled){for(const [article]of states)restore(article);states.clear();visible.disconnect();return;}
    for(const [article]of states)if(!article.isConnected){restore(article);visible.unobserve(article);states.delete(article);}
    for(const article of document.querySelectorAll('article[data-testid="tweet"]')){
      if(article.closest('[role="dialog"]'))continue;
      const post=extract(article),fingerprint=JSON.stringify(post),old=states.get(article);
      if(old?.fingerprint===fingerprint){if(old.result&&!article.querySelector(':scope > .sift-verdict'))badge(article,old,old.result);position(article);continue;}
      restore(article);visible.unobserve(article);
      if(!post.text&&!post.quotedText&&!post.cardText&&!post.hasMedia){states.delete(article);continue;}
      states.set(article,{post,fingerprint,done:false,loading:false,visible:false});visible.observe(article);
    }pump();
  }
  function pump(){
    if(!settings.enabled||!allowed())return;
    const queue=[...states].filter(([a,s])=>a.isConnected&&s.visible&&!s.done&&!s.loading).sort(([a],[b])=>Math.abs(a.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top));
    for(const [article,s]of queue){if(active>=2)break;s.loading=true;active++;badge(article,s,null);
      ask('CLASSIFY',{post:s.post}).then(result=>{
        if(states.get(article)!==s||!article.isConnected||!settings.enabled||!allowed())return;
        if(result.paused){s.done=false;return;}s.done=true;s.result=result;badge(article,s,result);treatment(article,s);
      }).catch(()=>{if(states.get(article)===s&&settings.enabled){s.done=true;s.result={action:'unavailable',source:'unavailable',reasons:['Reload X to reconnect the updated extension.']};badge(article,s,s.result);}}).finally(()=>{s.loading=false;active--;setTimeout(pump,100);});
    }
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(scan,80);}
  async function refresh(){const id=++refreshId;try{const s=await ask('STATE');if(id!==refreshId)return;settings=s.settings;for(const [article]of states)restore(article);states.clear();visible.disconnect();schedule();}catch{if(!allowed())scan();}}
  chrome.runtime.onMessage.addListener(m=>{if(m.type==='REFRESH')refresh();});
  new MutationObserver(records=>{if(records.some(r=>{if(r.target.closest?.('.sift-verdict'))return false;if(r.type==='characterData')return !!r.target.parentElement?.closest('article[data-testid="tweet"]');if(r.type==='attributes')return !!r.target.closest('article[data-testid="tweet"]');return [...r.addedNodes,...r.removedNodes].some(n=>!(n.nodeType===1&&n.matches?.('.sift-verdict')));} ))schedule();}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','data-testid','src','poster','alt']});
  setInterval(()=>{if(lastURL!==location.href){lastURL=location.href;refresh();schedule();}},500);refresh();
})();
