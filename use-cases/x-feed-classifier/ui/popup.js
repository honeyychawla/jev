import {send,isExtension,esc,mark,toast} from './store.js';
import {PROFILE} from '../lib/engine.js';
import {API_ORIGIN,KEY_URL} from '../lib/provider.js';
const root=document.getElementById('popup');let state,screen='home',busy=false;
function status(){return !state.settings.enabled?'Paused':!state.hasKey?'Connect Jev to start':state.lastError?'Jev needs attention':state.calls>=state.settings.sessionLimit?'Session limit reached':'Jev connected';}
function render(){
  root.innerHTML=`<header><div class="brand">${mark()}<strong>sift.</strong></div><span>Powered by Jev</span></header><main>
  ${screen==='home'?`<div class="toggle-row"><div><h1>Your AI feed</h1><p id="enabled-status">${state.settings.enabled?'Find your next thing to learn.':'Your feed is unchanged.'}</p></div><button id="pause" class="switch" role="switch" aria-label="Enable extension" aria-checked="${state.settings.enabled}"><span></span></button></div>
  <div class="connection ${state.hasKey&&!state.lastError?'connected':''}"><strong>${status()}</strong><p>${!state.hasKey?'Jev is not connected. Add your OpenRouter key to get personal recommendations.':state.lastError?esc(state.lastError):!state.settings.enabled?'Turn Sift on to resume checking posts.':state.calls>=state.settings.sessionLimit?'Open Settings to reset usage or raise your limit.':'Judging posts for your AI interests as you scroll.'}</p><button id="connect-open" class="${state.hasKey?'text-button':'primary'}">${state.hasKey?'Jev connection':'Connect Jev'}</button>${state.hasKey&&state.lastError?'<button class="text-button" id="retry">Retry checks</button>':''}</div>
  <div class="legend" aria-label="Reading decisions"><div><span aria-hidden="true">👍</span><b>Explore</b></div><div><span aria-hidden="true">👎</span><b>Skip</b></div><div><span aria-hidden="true">🤔</span><b>Unclear</b></div></div><p class="hint">Tap a post’s emoji for the reason or to correct it. The number below is Jev’s decision confidence.</p>
  <div class="profile-summary"><h2>Made for your curiosity</h2><p>AI tools, beginner explanations, creative ideas, practical workflows and related discoveries.</p></div><button id="settings-open" class="row-button">Settings <span aria-hidden="true">→</span></button>
  ${state.settings.basicFallback?'<p class="hint">Basic estimates are enabled when Jev is unavailable. They show no percentage.</p>':''}`:''}
  ${screen==='connect'?`<button id="back" class="text-button back">← Back</button><h1>Connect Jev</h1><p>Use your OpenRouter API key for Jev 1.14. Sift will test the connection before saving it.</p><form id="connect-form"><label for="api-key">OpenRouter API key <a href="${KEY_URL}" target="_blank" rel="noreferrer">Get a key ↗</a></label><input id="api-key" type="password" required minlength="20" maxlength="500" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…"><label class="check"><input id="remember" type="checkbox" ${state.rememberKey?'checked':''}>Remember on this device</label><p class="hint">${state.rememberKey?'Your saved key is stored locally, not encrypted or synced.':'Unchecked: key clears when Chrome closes. Remembered keys are stored locally, not encrypted or synced.'}</p><p class="hint">Visible post text, your interests and relevant corrections are sent through OpenRouter to TypeSafe’s Jev model. Image previews are sent only if you enable them in settings. API charges apply to your OpenRouter account.</p><button id="connect" class="primary" type="submit">Test & connect</button><p id="connect-message" role="status"></p></form>${state.hasKey?'<button id="disconnect" class="text-button">Disconnect and remove key</button>':''}`:''}
  ${screen==='settings'?`<button id="back" class="text-button back">← Back</button><h1>Settings</h1><form id="settings-form"><label for="profile">What you want to discover</label><textarea id="profile" rows="5" maxlength="1200" required>${esc(state.settings.profile)}</textarea><button id="default-profile" class="text-button" type="button">Restore AI-tinkerer profile</button><label class="check"><input id="adjacent" type="checkbox" ${state.settings.includeAdjacent?'checked':''}>Include things close to AI</label><label for="mode">Feed appearance</label><select id="mode"><option value="highlight">Emoji + confidence</option><option value="dim">Also highlight reads and dim skips</option><option value="strike">Also cross out likely bait</option></select><label class="check"><input id="images" type="checkbox" ${state.settings.analyzeImages?'checked':''}>Analyze image previews with Jev</label><p class="hint">Experimental. Sends up to two post images or video posters to Jev. It does not watch videos or hear audio.</p><label class="check"><input id="basic" type="checkbox" ${state.settings.basicFallback?'checked':''}>Use basic estimates when Jev is unavailable</label><label for="session-limit">Feed checks per Chrome session</label><select id="session-limit">${[50,100,200,500,1000].map(n=>`<option value="${n}" ${state.settings.sessionLimit===n?'selected':''}>${n}</option>`).join('')}</select><p class="hint">${state.calls} checks used. Cached posts don’t use another call.</p><button type="submit" class="primary">Save settings</button><p id="settings-message" role="status"></p></form><div class="maintenance"><button id="reset-usage" class="text-button">Reset usage</button><button id="reset-feedback" class="text-button">Reset learned preferences (${state.feedbackCount})</button></div>`:''}
  </main>`;
  if(screen==='settings')root.querySelector('#mode').value=state.settings.mode;
}
async function reload(){state=await send('STATE');render();}
root.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||(b.type==='submit'&&b.form)||busy)return;
  try{
    if(b.id==='connect-open'){screen='connect';render();root.querySelector('#api-key').focus();}
    if(b.id==='settings-open'){screen='settings';render();root.querySelector('h1').setAttribute('tabindex','-1');root.querySelector('h1').focus();}
    if(b.id==='back'){screen='home';await reload();}
    if(b.id==='pause'){busy=true;await send('PAUSE');await reload();root.querySelector('#pause').focus();}
    if(b.id==='disconnect'){busy=true;await send('DISCONNECT');screen='home';await reload();}
    if(b.id==='retry'){busy=true;await send('RETRY');await reload();toast('Retrying visible posts.');}
    if(b.id==='default-profile')root.querySelector('#profile').value=PROFILE;
    if(b.id==='reset-usage'||b.id==='reset-feedback'){busy=true;await send(b.id==='reset-usage'?'RESET_USAGE':'RESET_FEEDBACK');await reload();toast(b.id==='reset-usage'?'Usage reset.':'Corrections cleared.');}
  }catch(error){toast(error.message);}finally{busy=false;}
});
root.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button[type="submit"]'),message=e.target.querySelector('[role="status"]');button.disabled=true;
  try{
    if(e.target.id==='connect-form'){
      if(!isExtension)throw new Error('Load Sift in Chrome to connect Jev.');
      const key=root.querySelector('#api-key').value.trim(),remember=root.querySelector('#remember').checked;button.textContent='Testing Jev…';
      if(!await chrome.permissions.request({origins:[API_ORIGIN]}))throw new Error('Allow OpenRouter API access to connect.');
      await send('CONNECT',{key,remember});root.querySelector('#api-key').value='';screen='home';await reload();toast('Jev connected. Your feed will update.');
    }else if(e.target.id==='settings-form'){
      const analyzeImages=root.querySelector('#images').checked;
      if(isExtension&&analyzeImages&&!await chrome.permissions.request({origins:['https://pbs.twimg.com/*']}))throw new Error('Allow post-image access to enable image analysis.');
      const settings={profile:root.querySelector('#profile').value,includeAdjacent:root.querySelector('#adjacent').checked,mode:root.querySelector('#mode').value,analyzeImages,basicFallback:root.querySelector('#basic').checked,sessionLimit:Number(root.querySelector('#session-limit').value)};
      await send('SETTINGS',{settings});screen='home';await reload();toast('Settings saved.');
    }
  }catch(error){message.textContent=error.message;message.className='error';button.disabled=false;button.textContent=e.target.id==='connect-form'?'Test & connect':'Save settings';if(root.querySelector('#api-key'))root.querySelector('#api-key').value='';}finally{busy=false;}
});
try{await reload();}catch{root.innerHTML='<main><h1>Reload Sift</h1><p>Open chrome://extensions and reload Sift, then refresh X.</p></main>';}
