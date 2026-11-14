import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMenuObservation,candidatesForCartCheck,changesCart} from '../cart-observation.mjs';
const regular={name:'Margherita',variant:'Regular | New Hand Tossed',cartQuantity:1};
const large={name:'Margherita',variant:'Large | New Hand Tossed',cartQuantity:1};
test('aggregate menu counter cannot turn one regular plus one large into two large',()=>{
  assert.deepEqual(mergeMenuObservation([regular,large],[{...large,cartQuantity:2}]),[regular,large]);
});
test('a menu size selection cannot erase or create verified cart lines',()=>{
  assert.deepEqual(mergeMenuObservation([large],[{...large,cartQuantity:0}]),[large]);
  assert.deepEqual(mergeMenuObservation([],[{...large,cartQuantity:3}]),[]);
});
test('unverified cart must be reviewed before further mutations',()=>{
  const actions=[{id:'cart',label:'View Cart'},{id:'add',label:'Add +'},{id:'pay',label:'Pay',blocked:true}];
  assert.deepEqual(candidatesForCartCheck(actions,true,false),[actions[0]]);
  assert.deepEqual(candidatesForCartCheck(actions,true,true),actions.slice(0,2));
  assert.deepEqual(candidatesForCartCheck(actions,false,false),actions.slice(0,2));
});
test('cart mutations invalidate previously verified quantities',()=>{
  for(const label of ['₹459 Add +','Increase quantity by one','Decrease quantity by one','Repeat Last Customisation','Remove','₹109 Update'])assert.equal(changesCart(label),true,label);
  for(const label of ['View Cart','Select Large','Add more items'])assert.equal(changesCart(label),false,label);
});
