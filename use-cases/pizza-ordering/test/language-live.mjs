import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {DominosBrowser} from '../dominos-browser.mjs';
import {sizeReplyOptions} from '../order-understanding.mjs';
const app=new URL('../',import.meta.url);
const cfg=JSON.parse(await readFile(new URL('local-config.json',app),'utf8'));
const key=process.env.OPENROUTER_API_KEY||parseEnv(await readFile(cfg.keyFile,'utf8')).OPENROUTER_API_KEY;
await mkdir(new URL('../data/qa/',import.meta.url),{recursive:true,mode:0o700});
const history=JSON.parse(await readFile(new URL('data/dominos-history.json',app),'utf8'));
const line=(name,size,quantity)=>({name,variant:`${size} | New Hand Tossed`,cartQuantity:quantity,fromCart:true});
const f2=line('Farmhouse','Large',2),m1=line('Margherita','Large',1);
const wants=(name,size,quantity)=>({name,size,quantity});
const cases=[
 ['digits','3 margaritas, large',[],[wants('Margherita','large',3)]],
 ['words','Three large farmhouses',[],[wants('Farmhouse','large',3)]],
 ['small alias','Two farmhouse small',[],[wants('Farmhouse','regular',2)]],
 ['reordered','farmhouse large 2',[],[wants('Farmhouse','large',2)]],
 ['attached digit','2margarita large',[],[wants('Margherita','large',2)]],
 ['multiplication','2 x large Farmhouse',[],[wants('Farmhouse','large',2)]],
 ['polite','can i get two large farmhouse pizzas pls',[],[wants('Farmhouse','large',2)]],
 ['abbreviation','2 med farmhouse',[],[wants('Farmhouse','medium',2)]],
 ['capitalization','TWO LARGE MARGHERITAS!!!',[],[wants('Margherita','large',2)]],
 ['typo','2 large margareta',[],[wants('Margherita','large',2)]],
 ['set existing','3 large farmhouses',[f2],[wants('Farmhouse','large',3)]],
 ['add existing','add 2 large farmhouse',[f2],[wants('Farmhouse','large',4)]],
 ['another','another one please',[f2],[wants('Farmhouse','large',3)]],
 ['quantity correction','actually make it 3',[f2],[wants('Farmhouse','large',3)]],
 ['size correction','actually make it medium',[f2],[wants('Farmhouse','medium',2)]],
 ['subtract','remove one farmhouse',[f2],[wants('Farmhouse','large',1)]],
 ['remove','remove the farmhouse',[f2],[]],
 ['clear','remove all the items from the cart',[f2,m1],[]],
 ['zero','make the farmhouse quantity zero',[f2],[]],
 ['mixed','2margarita large also remove farmhouse',[f2],[wants('Margherita','large',2)]],
 ['two sizes','2 large margheritas and 1 medium farmhouse',[],[wants('Margherita','large',2),wants('Farmhouse','medium',1)]],
 ['drink volume','add one Sprite 475ml',[],[wants('Sprite 475ml','single',1)]],
 ['side','add two garlic breadsticks',[],[wants('Garlic Breadsticks','single',2)]],
 ['dessert','one choco lava cake',[],[wants('Choco Lava Cake','single',1)]],
 ['missing size','3 farmhouse pizza',[],null,'size'],
 ['fraction','1.5 large farmhouse',[],null,'quantity'],
 ['subtraction without cart','minus 2 large farmhouse',[],null,'target'],
 ['over limit','99 large farmhouse pizzas',[],null,'quantity'],
 ['unavailable','one large pineapple pizza',[],null,'product'],
 ['review',"that's all. show my cart and total",[f2],[wants('Farmhouse','large',2)],null,'review'],
 ['follow-up','large',[],[wants('Farmhouse','large',3)],null,'edit',{request:'3 farmhouse pizza',question:'What size for 3 Farmhouse: regular (small), medium, or large?'}],
];
if(process.argv.includes('--extra')){
 cases.splice(0);
 const pending={request:'3 farmhouse pizza',field:'size',options:sizeReplyOptions,question:'What size for 3 Farmhouse? 1 = regular (small), 2 = medium, 3 = large.'};
 cases.push(
  ['size option digit','2',[],[wants('Farmhouse','medium',3)],null,'edit',pending],
  ['size option word','two',[],[wants('Farmhouse','medium',3)],null,'edit',pending],
  ['size option ordinal','second',[],[wants('Farmhouse','medium',3)],null,'edit',pending],
  ['clarification correction','make that 2 large',[],[wants('Farmhouse','large',2)],null,'edit',pending],
  ['new request replaces pending','one large margherita',[],[wants('Margherita','large',1)],null,'edit',pending],
  ['couple','a couple of large farmhouses',[],[wants('Farmhouse','large',2)]],
  ['dozen','a dozen large margheritas',[],[wants('Margherita','large',12)]],
  ['uppercase shorthand','2 L FARMHOUSE',[],[wants('Farmhouse','large',2)]],
  ['fullwidth number','２ large Farmhouse',[],[wants('Farmhouse','large',2)]],
  ['retain unrelated','make the farmhouse medium',[f2,m1],[wants('Farmhouse','medium',2),wants('Margherita','large',1)]],
  ['two same item sizes','one small farmhouse and two large farmhouse',[],[wants('Farmhouse','regular',1),wants('Farmhouse','large',2)]],
  ['cancel pending','cancel that',[],[],null,'cancel',pending],
  ['extra toppings are not ignored','one large farmhouse with extra cheese',[],null,'customization'],
  ['too many operations','one large farmhouse and one large margherita and one medium peppy paneer and one regular veg extravaganza and one garlic breadsticks and one choco lava cake and one Sprite 475ml',[],null,'count'],
 );
}
if(process.argv.includes('--numbers')){
 const words=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
 for(let n=1;n<=20;n++)for(const word of [String(n),words[n-1]])cases.push([`quantity ${word}`,`${word} large farmhouse`,[],[wants('Farmhouse','large',n)]]);
}
const wanted=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const selected=wanted?cases.filter(c=>c[0]===wanted):cases;
const results=[];let next=0;
async function worker(){
 while(next<selected.length){
  const [name,message,cart,expected,clarification,intent,pending]=selected[next++];
  const controller=new DominosBrowser({root:new URL('../data/qa/language-only-no-cart/',import.meta.url).pathname,apiKey:key});
  controller.knownMenu=new Map(history.knownMenu.map(p=>[p.name,p]));
  controller.knownCart=new Map(cart.map((p,i)=>[String(i),p]));
  controller.lastTouched=cart.slice(0,1).map(p=>({name:p.name,size:'large',crust:'New Hand Tossed',quantity:p.cartQuantity}));
  controller.pendingRequest=pending||null;
  let result;
  try {
   const plan=await controller.interpret(message);
   const actual=plan.desired.map(({name,size,quantity})=>({name,size,quantity})).sort((a,b)=>(a.name+a.size).localeCompare(b.name+b.size));
   const sorted=expected?.toSorted((a,b)=>(a.name+a.size).localeCompare(b.name+b.size));
   const passed=clarification?plan.clarification?.field===clarification:!plan.clarification&&JSON.stringify(actual)===JSON.stringify(sorted)&&(!intent||plan.intent===intent);
   result={name,message,passed,expected,clarificationExpected:clarification,intentExpected:intent,actual,clarification:plan.clarification,intent:plan.intent,operations:plan.operations,activity:controller.activity};
   console.log(JSON.stringify({name,passed,...(!passed?{actual,clarification:plan.clarification,intent:plan.intent,decisions:controller.activity.map(a=>a.answers)}:{})}));
  } catch(e){result={name,message,passed:false,error:e.message};console.log(JSON.stringify(result));}
  results.push(result);
 }
}
await Promise.all([worker(),worker(),worker()]);
const report={testedAt:new Date().toISOString(),model:'typesafe/jev-1.14',cases:results.length,passed:results.filter(r=>r.passed).length,results};
await writeFile(new URL(wanted?'../data/qa/language-one.json':process.argv.includes('--extra')?'../data/qa/language-extra-results.json':'../data/qa/language-results.json',import.meta.url),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({cases:report.cases,passed:report.passed}));
process.exitCode=report.passed===report.cases?0:1;
