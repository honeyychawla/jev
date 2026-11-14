import {REASONS} from '../lib/engine.js';
export function fixtureResponse(action='read',reason='tool',options={}){
 const choice=(keys,pick,p=.94)=>({type:'choice',choice:pick,confidence:(keys.length*p-1)/(keys.length-1),probabilities:Object.fromEntries(keys.map(k=>[k,k===pick?p:(1-p)/(keys.length-1)]))});
 return {id:'gen-dec-test',provider:'TypeSafe',model:'typesafe/jev-1.14-20261014',answers:{decision:choice(['read','skip','unsure'],action,options.probability??.94),relevance:choice(['direct','adjacent','unrelated','unclear'],options.relevance||'direct'),value:{type:'score',score:action==='read'?2.4:1,confidence:.8},bait:{type:'noul',noul:reason==='bait'?.95:.02},missing:{type:'noul',noul:options.missing??.05},reason:choice(Object.keys(REASONS),reason)},usage:{input_tokens:1000,output_tokens:30,cost:0.000042}};
}
