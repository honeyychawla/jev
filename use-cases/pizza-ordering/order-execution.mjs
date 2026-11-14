import {canonical,crustOf,sizeOf,lineIdentity,planDifference} from './order-understanding.mjs';
const close = a => /^Close (?:dialog|customization\/dialog)$/i.test(a.label);
const viewCart = a => /^View Cart$/i.test(a.label);
const matchesLine = (a,line) => a.product===line?.name && (!a.variant || lineIdentity({name:a.product,variant:a.variant})===lineIdentity(line));
export function executionChoices(plan, observation, cart, verified) {
  const allowed=observation.actions.filter(a=>!a.blocked);
  if(!plan) return {phase:'Inspect the existing cart before interpreting an order. Do not change any items.',actions:observation.modal?allowed.filter(close):allowed.filter(viewCart),complete:false};
  if(plan.clarification)return {phase:'Clarification required before any changes.',actions:[],complete:false,unavailable:plan.clarification.message};
  if(['menu','clarify','cancel'].includes(plan.intent))return {phase:'Read only. No cart changes requested.',actions:[],complete:true};
  if(!verified&&!observation.modal&&allowed.some(viewCart))return {phase:'Verify the real cart rows after the last change.',actions:allowed.filter(viewCart),complete:false};
  if(plan.intent==='edit'&&!plan.operations.some(op=>op.mode==='clear')){
    const names=new Set([...plan.touched.map(p=>p.name),...plan.operations.map(op=>op.targetLine?.name).filter(Boolean)]);
    const baseline=(plan.baseline||[]).filter(p=>!names.has(p.name)).map(p=>[lineIdentity(p),p.quantity]).sort();
    const untouched=cart.filter(p=>!names.has(p.name)).map(p=>[lineIdentity(p),p.cartQuantity]).sort();
    if(JSON.stringify(baseline)!==JSON.stringify(untouched))return {phase:'An unrelated cart item changed during this task.',actions:[],complete:false,unavailable:'An unrelated item changed in the cart while this task was running. Please review the cart and send your request again.'};
  }
  const difference=planDifference(plan,cart);
  if(!difference){
    if(observation.modal)return {phase:'Target cart reached. Close the dialog without modifying it.',actions:allowed.filter(close),complete:false};
    if(plan.finish&&!observation.onCartPage&&allowed.some(viewCart))return {phase:'Open the final cart for review.',actions:allowed.filter(viewCart),complete:false};
    return {phase:'The real cart matches the complete target, including quantities and variants.',actions:[],complete:verified||!cart.length};
  }
  const {kind,source,target}=difference;
  const phase=`${kind}: ${target.quantity} × ${target.size} ${target.name}, ${target.crust}. Current matching quantity ${source?.quantity||0}.`;
  if(observation.modal){
    if(allowed.some(a=>/^Remove$/i.test(a.label)))return {phase,actions:allowed.filter(a=>kind==='decrease'&&/^Remove$/i.test(a.label)||close(a)),complete:false,difference};
    if(allowed.some(a=>/^Repeat Last(?: Customisation)?$/i.test(a.label)))return {phase,actions:allowed.filter(a=>kind==='increase'&&/^Repeat Last(?: Customisation)?$/i.test(a.label)||kind==='add'&&/^Add New(?: Customisation)?$/i.test(a.label)),complete:false,difference};
    const selects=allowed.filter(a=>a.inputType==='radio');
    const sizeOptions=selects.filter(a=>/\b(?:Regular|Small|Medium|Large)\b/i.test(a.label));
    const crustOptions=selects.filter(a=>!sizeOptions.includes(a));
    const sizeMatch=sizeOptions.find(a=>sizeOf(a.label.replace(/^Select\s+/,''))===target.size);
    const crustMatch=crustOptions.find(a=>canonical(a.label.replace(/^Select\s+/,''))===canonical(target.crust));
    if(sizeOptions.length&&!sizeMatch)return {phase,actions:[],complete:false,difference,unavailable:`${target.name} does not offer ${target.size.replace('_',' ')} on this menu.`};
    if(crustOptions.length&&!crustMatch)return {phase,actions:[],complete:false,difference,unavailable:`${target.crust} is not available for this ${target.name}.`};
    if(sizeMatch&&!sizeMatch.checked)return {phase,actions:[sizeMatch],complete:false,difference};
    if(crustMatch&&!crustMatch.checked)return {phase,actions:[crustMatch],complete:false,difference};
    // Never treat a still-loading customization dialog as permission to add.
    if(!sizeOptions.length&&target.size!=='single')return {phase,actions:[],complete:false,difference,waiting:true};
    return {phase,actions:allowed.filter(a=>(kind==='change'?/Update/i.test(a.label):/Add\s*\+/i.test(a.label))&&(!a.product||a.product===target.name)),complete:false,difference};
  }
  if(observation.onCartPage){
    const actions=kind==='add' ? allowed.filter(a=>/^Add more items$/i.test(a.label))
      : allowed.filter(a=>matchesLine(a,source)&&(a.variant||cart.filter(p=>p.name===source?.name).length===1)&& (kind==='increase'?/^Increase quantity by one$/i.test(a.label):kind==='decrease'?/^Decrease quantity by one$/i.test(a.label):/^Customi[sz]e$/i.test(a.label)));
    return {phase,actions,complete:false,difference};
  }
  if(kind!=='add'&&allowed.some(viewCart))return {phase,actions:allowed.filter(viewCart),complete:false,difference};
  const product=observation.products.find(p=>p.name===target.name);
  if(!product)return {phase,actions:allowed.filter(a=>!a.product&&!/^(?:Increase|Decrease|Add\s*\+|View Cart|Toggle)/i.test(a.label)&&a.inputType!=='checkbox'),complete:false,difference};
  // Editing a menu size while another variant exists opens UPDATE and replaces
  // that existing pizza. Start a new customization through + / Add New instead.
  if(kind==='add'&&cart.some(p=>p.name===target.name))return {phase:`Add a NEW ${target.size} ${target.name} without changing the existing variant.`,actions:allowed.filter(a=>a.product===target.name&&/^Increase quantity by one$/i.test(a.label)),complete:false,difference};
  const correctVariant=sizeOf(product.variant)===target.size&&canonical(crustOf(product.variant))===canonical(target.crust);
  return {phase,actions:allowed.filter(a=>a.product===target.name&&(correctVariant?/^(?:Add\s*\+|Increase quantity by one)$/i.test(a.label):/^(?:Choose size \/ crust:|Customize pizza)/i.test(a.label))),complete:false,difference};
}

export function loopKey(observation,cart){
  return JSON.stringify({url:observation.url,modal:observation.modal,cart:cart.map(p=>[lineIdentity(p),p.cartQuantity]).sort(),options:observation.actions.filter(a=>a.inputType).map(a=>[a.label,a.checked]),products:observation.products.map(p=>[p.name,p.variant,p.cartQuantity])});
}
