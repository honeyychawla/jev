import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {DominosBrowser} from '../dominos-browser.mjs';
import {cartLines} from '../order-understanding.mjs';
const app=new URL('../',import.meta.url);
const cfg=JSON.parse(await readFile(new URL('local-config.json',app),'utf8'));
const key=process.env.OPENROUTER_API_KEY||parseEnv(await readFile(cfg.keyFile,'utf8')).OPENROUTER_API_KEY;
await mkdir(new URL('../data/qa/',import.meta.url),{recursive:true,mode:0o700});
const history=JSON.parse(await readFile(new URL('data/dominos-history.json',app),'utf8'));
const resume=process.argv.includes('--resume');
const previous=resume?JSON.parse(await readFile(new URL('../data/qa/e2e-results.json',import.meta.url),'utf8')):null;
const root=previous?.root||new URL(`../data/qa/e2e-${Date.now()}/`,import.meta.url).pathname;
await mkdir(root,{recursive:true});
const controller=new DominosBrowser({root,apiKey:key});
controller.knownMenu=new Map(history.knownMenu.map(p=>[p.name,p]));
const item=(name,size,quantity)=>({name,size,quantity});
const cases=[
 ['3 farmhouse pizza',[],'clarification'],
 ['large',[item('Farmhouse','large',3)]],
 ['make it 2',[item('Farmhouse','large',2)]],
 ['one more',[item('Farmhouse','large',3)]],
 ['actually make them small',[item('Farmhouse','regular',3)]],
 ['remove 2 farmhouses',[item('Farmhouse','regular',1)]],
 ['3 margaritas, large',[item('Farmhouse','regular',1),item('Margherita','large',3)]],
 ['remove the farmhouse',[item('Margherita','large',3)]],
 ['2 small margheritas and 1 large margherita',[item('Margherita','large',1),item('Margherita','regular',2)]],
 ["that's all",[item('Margherita','large',1),item('Margherita','regular',2)],'review'],
 ['remove all items',[]],
 ['add one Garlic Breadsticks and one Choco Lava Cake and one Sprite 475ml',[item('Choco Lava Cake','single',1),item('Garlic Breadsticks','single',1),item('Sprite 475ml','single',1)]],
 ['remove everything from the cart',[]],
];
const results=previous?previous.results.filter(r=>r.passed):[];
const startAt=results.length;
try {
 await controller.connect();
 for(let caseIndex=startAt;caseIndex<cases.length;caseIndex++){
  const [message,expected,status]=cases[caseIndex];
  const before=controller.activity.length;
  await controller.run(message,(type,a)=>{if(type==='activity'&&['clicked','stopped','error'].includes(a.status))console.log(JSON.stringify({message,status:a.status,choice:a.choice,target:a.target?.label,error:a.error}));},resume&&caseIndex===startAt);
  const actual=cartLines(controller.state().cartItems).map(({name,size,quantity})=>({name,size,quantity})).sort((a,b)=>(a.name+a.size).localeCompare(b.name+b.size));
  const passed=JSON.stringify(actual)===JSON.stringify(expected.toSorted((a,b)=>(a.name+a.size).localeCompare(b.name+b.size)))&&(status==='clarification'?controller.status==='clarification':status==='review'?['checkout','handoff'].includes(controller.status):controller.status==='ready');
  results.push({message,passed,actual,expected,status:controller.status,error:controller.error,plan:controller.orderPlan,calls:controller.activity.length-before,resumed:resume&&caseIndex===startAt,recoveryNeeded:controller.cartRecoveryNeeded});
  console.log(JSON.stringify({result:true,...results.at(-1)}));
  if(!passed){
   const dom=await controller.page.evaluate(()=>[...document.querySelectorAll('.modal-mask,.cart-product-info-layout-row')].filter(e=>e.getClientRects().length).map(e=>e.outerHTML));
   await writeFile(new URL('../data/qa/e2e-failure-dom.json',import.meta.url),JSON.stringify(dom,null,2));
   break;
  }
 }
} finally {
 await writeFile(new URL('../data/qa/e2e-results.json',import.meta.url),JSON.stringify({root,cases:results.length,passed:results.filter(r=>r.passed).length,results},null,2));
 await controller.close();
}
process.exitCode=results.length===cases.length&&results.every(r=>r.passed)?0:1;
