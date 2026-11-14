import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {DEFAULTS,MODEL,normalizePost,buildJevRequest,parseJevResponse} from '../lib/engine.js';
import {CASES} from './cases.js';
const key=process.env.OPENROUTER_API_KEY;if(!key)throw new Error('Set OPENROUTER_API_KEY in your local shell before running this paid, live evaluation. Never paste it into a report.');
const rows=[];
for(const example of CASES){
 const post=normalizePost(example),start=performance.now();
 const response=await fetch('https://openrouter.ai/api/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(buildJevRequest(post,DEFAULTS)),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Stopped at ${example.name}: HTTP ${response.status}. No automatic retry or extra charges.`);
 const body=await response.json(),r=parseJevResponse(body,DEFAULTS,post);rows.push({name:example.name,expected:example.expected,actual:r.action,confidence:r.confidence,latencyMs:Math.round(performance.now()-start),usage:body.usage,model:r.model});
 console.log(`${example.name}: expected ${example.expected}, got ${r.action}`);
}
const useful=rows.filter(r=>r.expected==='read'),skipped=rows.filter(r=>r.actual==='skip'),latencies=rows.map(r=>r.latencyMs).sort((a,b)=>a-b);
const report={model:MODEL,time:new Date().toISOString(),cases:rows.length,agreement:rows.filter(r=>r.actual===r.expected).length/rows.length,falseSkipRate:useful.filter(r=>r.actual==='skip').length/useful.length,skipPrecision:skipped.length?skipped.filter(r=>r.expected==='skip').length/skipped.length:null,unsureRate:rows.filter(r=>r.actual==='unsure').length/rows.length,p95LatencyMs:latencies[Math.ceil(latencies.length*.95)-1],inputTokens:rows.reduce((n,r)=>n+(r.usage?.input_tokens||0),0),rows};
await fs.mkdir(new URL('../.qa/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../.qa/live-evaluation.json',import.meta.url),JSON.stringify(report,null,2));console.log('Saved .qa/live-evaluation.json. Review false skips and uncertain cases before changing thresholds.');
