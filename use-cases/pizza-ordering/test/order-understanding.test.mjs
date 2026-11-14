import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrderText,operationQuestions,buildOrderPlan,planDifference,cartLines,verifiedSummary,resolveClarificationReply,sizeReplyOptions,quantityNumbers,mentionedMenuNames} from '../order-understanding.mjs';
import {executionChoices,loopKey} from '../order-execution.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DominosBrowser} from '../dominos-browser.mjs';
const menu=[{name:'Farmhouse',variant:'MediumNew Hand Tossed'},{name:'Margherita',variant:'MediumNew Hand Tossed'}];
const observed=(name,size,qty)=>({name,variant:`${size} | New Hand Tossed`,cartQuantity:qty});
const operation=(overrides={})=>({mode:'set',name:'Farmhouse',product:'item_0',target:'new',targetLine:null,size:'large',crust:'default',quantity:3,extras:'none',...overrides});
const plan=(operations,cart=[])=>buildOrderPlan({request:'test request',route:{intent:'edit',finish:'no',count:String(operations.length)},operations,menu,cart:cartLines(cart)});

test('number words, digits, attached names, and units normalize without choosing intent',()=>{
 assert.equal(normalizeOrderText('TWO large farmhouses'),'2 large farmhouses');
 assert.equal(normalizeOrderText('2margarita large'),'2 margarita large');
 assert.equal(normalizeOrderText('one Sprite 475ml'),'1 Sprite 475 ml');
 assert.equal(normalizeOrderText('a couple of large pizzas'),'2 large pizzas');
});
test('an omitted size cannot be selected from a menu default',()=>{
 const q=operationQuestions(menu,[],0,1,'3 farmhouse pizza');
 for(const size of ['regular','medium','large'])assert.equal(Object.hasOwn(q.size.criteria,size),false);
 assert.ok(q.size.criteria.missing);
 assert.ok(q.quantity.criteria.q3);
 assert.equal(q.quantity.criteria.q2,undefined);
});
test('numbered size answers use the displayed options without overwriting quantity',()=>{
 const pending={field:'size',options:sizeReplyOptions};
 for(const answer of ['2','two','option 2','option two','second'])assert.equal(resolveClarificationReply(answer,pending),'medium');
 assert.equal(resolveClarificationReply('make it 2',pending),'make it 2');
 assert.equal(resolveClarificationReply('2',{field:'quantity'}),'2');
});
test('new quantity corrections replace stale evidence and do not count volume or price',()=>{
 const q=operationQuestions(menu,[],0,1,'3 Farmhouse. Clarification reply: make that 2 large','make that 2 large');
 assert.ok(q.quantity.criteria.q2);assert.equal(q.quantity.criteria.q3,undefined);
 assert.deepEqual(quantityNumbers('two Sprite 475ml, price ₹ 100; pizza serves 4'),[2]);
});
test('explicit menu mentions detect dropped items without double-counting nested product names',()=>{
 const items=[{name:'Margherita'},{name:'Cheese Volcano Margherita'},{name:'Farmhouse'}];
 assert.deepEqual(mentionedMenuNames('two Cheese Volcano Margheritas and a Farmhouse',items),['Cheese Volcano Margherita','Farmhouse']);
});
test('an exact menu name does not exclude a second item expressed with a spelling variant',()=>{
 const q=operationQuestions(menu,[],0,2,'2margarita large also remove farmhouse');
 assert.match(q.product.criteria.item_0,/Farmhouse/);
 assert.match(q.product.criteria.item_1,/Margherita/);
});
test('missing size preserves the whole cart and asks a focused question before any mutation',()=>{
 const existing=[observed('Margherita','Large',1)];
 const p=plan([operation({size:'missing'})],existing);
 assert.equal(p.clarification.field,'size');
 assert.match(p.clarification.message,/3 Farmhouse/);
 assert.deepEqual(p.desired,cartLines(existing));
});
test('final quantities, additions and subtraction are exact across all supported counts',()=>{
 for(let current=1;current<=20;current++)for(let amount=0;amount<=20;amount++){
  const cart=[observed('Farmhouse','Large',current)], target=cartLines(cart)[0];
  for(const mode of ['set','add','subtract']){
   const p=plan([operation({mode,quantity:amount,targetLine:target})],cart);
   const expected=mode==='set'?amount:mode==='add'?current+amount:current-amount;
   if(expected<0||expected>20)assert.ok(p.clarification,`${mode} ${current} ${amount}`);
   else {assert.equal(p.clarification,undefined);assert.equal(p.desired[0]?.quantity||0,expected);}
  }
 }
});
test('size correction keeps quantity and all unrelated items',()=>{
 const cart=[observed('Farmhouse','Large',3),observed('Margherita','Medium',2)];
 const p=plan([operation({mode:'change',size:'regular',quantity:'keep',targetLine:cartLines(cart)[0]})],cart);
 assert.deepEqual(p.desired.map(p=>[p.name,p.size,p.quantity]),[['Margherita','medium',2],['Farmhouse','regular',3]]);
 assert.equal(planDifference(p,cart).kind,'change');
});
test('changing onto an existing variant merges quantities without dropping pizzas',()=>{
 const cart=[observed('Farmhouse','Large',3),observed('Farmhouse','Regular',2)];
 const p=plan([operation({mode:'change',size:'regular',quantity:'keep',targetLine:cartLines(cart)[0]})],cart);
 assert.equal(p.desired.length,1);assert.equal(p.desired[0].size,'regular');assert.equal(p.desired[0].quantity,5);
});
test('external changes to unrelated cart items stop instead of overwriting them',()=>{
 const p=plan([operation()]);
 const result=executionChoices(p,{actions:[],modal:false,onCartPage:true},[observed('Margherita','Medium',1)],true);
 assert.match(result.unavailable,/unrelated item changed/);assert.deepEqual(result.actions,[]);
});
test('a wrong quantity, size, crust or unexpected line cannot count as complete',()=>{
 const p=plan([operation()]);
 assert.ok(planDifference(p,[observed('Farmhouse','Large',1)]));
 assert.ok(planDifference(p,[observed('Farmhouse','Medium',3)]));
 assert.ok(planDifference(p,[{name:'Farmhouse',variant:'Large | Cheese Burst',cartQuantity:3}]));
 assert.ok(planDifference(p,[observed('Farmhouse','Large',3),observed('Margherita','Medium',1)]));
 assert.equal(planDifference(p,[observed('Farmhouse','Large',3)]),null);
 assert.match(verifiedSummary(p,[observed('Farmhouse','Large',3)]),/3 × large Farmhouse/);
});
test('increasing a cart row exposes only its plus button, never minus or customization',()=>{
 const cart=[observed('Farmhouse','Large',1)],p=plan([operation()]);
 const actions=[
  {id:'large-plus',label:'Increase quantity by one',product:'Farmhouse',variant:'Large | New Hand Tossed'},
  {id:'small-plus',label:'Increase quantity by one',product:'Farmhouse',variant:'Regular | New Hand Tossed'},
  {id:'minus',label:'Decrease quantity by one',product:'Farmhouse',variant:'Large | New Hand Tossed'},
  {id:'customize',label:'Customise',product:'Farmhouse',variant:'Large | New Hand Tossed'},
 ];
 assert.deepEqual(executionChoices(p,{actions,modal:false,onCartPage:true},cart,true).actions.map(a=>a.id),['large-plus']);
});
test('both live repeat-customization dialog labels are handled without making a new variant',()=>{
 const cart=[observed('Farmhouse','Large',1)],p=plan([operation()]);
 for(const label of ['Repeat Last','Repeat Last Customisation']){
  const selection=executionChoices(p,{modal:true,onCartPage:true,actions:[{id:'repeat',label},{id:'new',label:'Add New'},{id:'close',label:'Close dialog'}]},cart,false);
  assert.deepEqual(selection.actions.map(a=>a.id),['repeat']);
 }
});
test('adding a second size uses Add New and never updates the existing pizza',()=>{
 const cart=[observed('Farmhouse','Large',1)];
 const p=plan([operation({size:'regular',quantity:2})],cart);
 const o={modal:false,onCartPage:false,products:[{name:'Farmhouse',variant:'LargeNew Hand Tossed',cartQuantity:1}],actions:[{id:'plus',label:'Increase quantity by one',product:'Farmhouse'},{id:'size',label:'Choose size / crust: LargeNew Hand Tossed',product:'Farmhouse'}]};
 assert.deepEqual(executionChoices(p,o,cart,true).actions.map(a=>a.id),['plus']);
 const repeat={modal:true,actions:[{id:'repeat',label:'Repeat Last'},{id:'new',label:'Add New'}]};
 assert.deepEqual(executionChoices(p,repeat,cart,false).actions.map(a=>a.id),['new']);
 const configure={modal:true,actions:[{id:'size',label:'Select Regular',inputType:'radio',checked:true},{id:'update',label:'₹259Update',product:'Farmhouse'},{id:'add',label:'₹259Add +',product:'Farmhouse'}]};
 assert.deepEqual(executionChoices(p,configure,cart,false).actions.map(a=>a.id),['add']);
});
test('customization loading and wrong selected sizes cannot lead to Add',()=>{
 const p=plan([operation()]);
 const base={modal:true,onCartPage:false,actions:[{id:'add',label:'₹699Add +',product:'Farmhouse'}]};
 assert.equal(executionChoices(p,base,[],true).waiting,true);
 base.actions.push({id:'regular',label:'Select Regular (Serves 1)',inputType:'radio',checked:true},{id:'large',label:'Select Large (Serves 4)',inputType:'radio',checked:false});
 assert.deepEqual(executionChoices(p,base,[],true).actions.map(a=>a.id),['large']);
});
test('completion is withheld until the real cart has been verified',()=>{
 const p=plan([operation()]),cart=[observed('Farmhouse','Large',3)];
 const o={modal:false,onCartPage:false,products:[],actions:[{id:'view',label:'View Cart'}]};
 assert.equal(executionChoices(p,o,cart,false).complete,false);
 assert.deepEqual(executionChoices(p,o,cart,false).actions.map(a=>a.id),['view']);
 assert.equal(executionChoices(p,{...o,onCartPage:true},cart,true).complete,true);
});
test('an unresolved clarification cannot be resumed as a successful unchanged order',()=>{
 const p=plan([operation({size:'missing'})]);
 const result=executionChoices(p,{actions:[],modal:false,onCartPage:true},[],true);
 assert.equal(result.complete,false);assert.deepEqual(result.actions,[]);
});
test('resuming a saved addition keeps its original target instead of adding the amount again',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'dominos-resume-target-'));
 try {
  const original=[observed('Farmhouse','Large',1)];
  const p=plan([operation({mode:'add',quantity:2})],original);
  const controller=new DominosBrowser({root,apiKey:'test-only'});controller.orderPlan=p;
  await controller.persist();
  const restarted=new DominosBrowser({root,apiKey:'test-only'});
  const difference=planDifference(restarted.orderPlan,[observed('Farmhouse','Large',2)]);
  assert.equal(difference.kind,'increase');assert.equal(difference.target.quantity,3);assert.equal(difference.source.quantity,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('loop fingerprint distinguishes actual quantity progress from a repeated unchanged dialog',()=>{
 const o={url:'https://pizzaonline.dominos.co.in/cart',modal:false,actions:[],products:[]};
 assert.notEqual(loopKey(o,[observed('Farmhouse','Large',1)]),loopKey(o,[observed('Farmhouse','Large',2)]));
 assert.equal(loopKey(o,[observed('Farmhouse','Large',1)]),loopKey({...o},[observed('Farmhouse','Large',1)]));
});
