import test from 'node:test';
import assert from 'node:assert/strict';
import { forbiddenControl, allowedPage, DominosBrowser, cartControlAllowed } from '../dominos-browser.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
test('payment, final order, and COD controls are blocked by code', () => {
  for (const label of ['Pay ₹499', 'Proceed to Payment', 'Place Order', 'Confirm my order', 'Submit order', 'Cash on delivery', 'UPI', 'Complete order', 'Order Now', 'Confirm', 'Continue', 'Proceed ₹200', 'Buy now']) assert.equal(forbiddenControl(label), true, label);
  for (const label of ['Add +', 'View Cart', 'Choose size / crust', 'Medium', 'Decrease quantity by one', 'Checkout']) assert.equal(forbiddenControl(label), false, label);
});
test('browser navigation is restricted to Domino’s India HTTPS pages', () => {
  assert.equal(allowedPage('https://pizzaonline.dominos.co.in/cart'), true);
  for (const url of ['https://dominos.co.in.attacker.test', 'http://pizzaonline.dominos.co.in', 'https://example.com', 'javascript:alert(1)', 'https://dominos.co.in@attacker.test']) assert.equal(allowedPage(url), false, url);
});
test('cart additions use the full menu instead of ambiguous recommendation buttons', () => {
  assert.equal(cartControlAllowed('Add more items',true,false),true);
  assert.equal(cartControlAllowed('Decrease quantity by one',true,false),true);
  assert.equal(cartControlAllowed('Add',true,false),false);
  assert.equal(cartControlAllowed('Breads & More',true,false),false);
  assert.equal(cartControlAllowed('Add +',false,false),true);
  assert.equal(cartControlAllowed('₹109 Update',true,true),true);
});
test('restoring history does not resurrect an item removed from the latest cart', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'slice-test-'));
  try {
    await mkdir(path.join(root,'data'));
    await writeFile(path.join(root,'data/dominos-history.json'),JSON.stringify({activity:[{result:{cartItems:[{name:'Sprite',variant:'475ml',cartQuantity:1}]}}],knownCart:[]}));
    const browser=new DominosBrowser({root,apiKey:'test-only'});
    assert.deepEqual(browser.state().cartItems,[]);
    assert.equal(browser.state().connected,false);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('closing the ordering window reports disconnected instead of a stale handoff', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'slice-test-'));
  try {
    const browser=new DominosBrowser({root,apiKey:'test-only'});
    browser.status='handoff';
    browser.page={isClosed:()=>true,url:()=> 'https://pizzaonline.dominos.co.in/cart'};
    assert.equal(browser.state().connected,false);
    assert.equal(browser.state().status,'disconnected');
    assert.equal(browser.state().busy,false);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('task timing includes browser startup failures and stops on error', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'slice-test-'));
  try {
    const browser=new DominosBrowser({root,apiKey:'test-only'});
    browser.connect=async()=>{throw new Error('Test browser could not start');};
    await browser.run('Show the menu',()=>{});
    const timing=browser.state().taskTiming;
    assert.ok(timing.startedAt>0);
    assert.ok(timing.endedAt>=timing.startedAt);
    assert.ok(timing.durationMs>=0);
    assert.equal(timing.outcome,'error');
    assert.equal(browser.state().busy,false);
    const restored=new DominosBrowser({root,apiKey:'test-only'});
    assert.deepEqual(restored.state().taskTiming,timing);
  } finally { await rm(root,{recursive:true,force:true}); }
});
