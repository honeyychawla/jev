import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { waitForOrderingPage, canReportUnavailable, readableBrowserError } from '../browser-readiness.mjs';
import { DominosBrowser } from '../dominos-browser.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('readiness follows the visible page across redirects and late rendering', async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const origin = 'https://pizzaonline.dominos.co.in';
  try {
    await page.route(`${origin}/**`, route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/expired-cart') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>Redirecting…</p><script>setTimeout(()=>location.replace("/home-guest/6585R"),50)</script>' });
      const html = pathname.startsWith('/home-guest') ? '<h2>What are you craving for?</h2><button>Veg Pizza</button>'
        : pathname === '/login' ? '<input type="tel" placeholder="Mobile number">'
        : pathname === '/cart/empty' ? '<h1>Your cart is empty</h1>'
        : pathname === '/cart/populated' ? '<h2>Bill Details</h2><section><h3>Margherita</h3><p>Regular | New Hand Tossed</p><span style="cursor:pointer">−</span><b>1</b><span>+</span><p>₹109</p></section>'
        : pathname === '/menu' ? '<h2 style="display:none">Hidden first heading</h2><main id="menu"></main><script>setTimeout(()=>{document.querySelector("main").innerHTML=`<div class="card-botm-gradient"><h2>Margherita</h2><span class="pizza-price">₹109</span><button>Add +</button></div>`},100)</script>'
        : '<div>Loading…</div>';
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    });
    await t.test('hidden first heading and delayed menu do not cause startup timeout', async () => {
      await page.goto(`${origin}/menu`);
      assert.equal(await waitForOrderingPage(page, 3000), 'menu');
    });
    await t.test('expired cart redirect is recognized as home instead of waiting for bill details', async () => {
      await page.goto(`${origin}/expired-cart`);
      assert.equal(await waitForOrderingPage(page, 3000), 'home');
    });
    await t.test('sign-in becomes a human handoff instead of timeout', async () => {
      await page.goto(`${origin}/login`);
      assert.equal(await waitForOrderingPage(page, 3000), 'handoff');
    });
    await t.test('both empty and populated carts are ready states', async () => {
      await page.goto(`${origin}/cart/empty`);
      assert.equal(await waitForOrderingPage(page, 3000), 'cart');
      await page.goto(`${origin}/cart/populated`);
      assert.equal(await waitForOrderingPage(page, 3000), 'cart');
    });
    await t.test('cart recommendations are not mistaken for a loaded cart',async()=>{
      await page.route(`${origin}/cart/recommendations-first`,route=>route.fulfill({contentType:'text/html',body:'<div class="card-botm-gradient"><h2>Margherita</h2><span class="pizza-price">₹109</span></div><script>setTimeout(()=>document.body.insertAdjacentHTML("beforeend","<h2>Bill Details</h2>"),200)</script>'}));
      await page.goto(`${origin}/cart/recommendations-first`);
      assert.equal(await waitForOrderingPage(page,3000),'cart');
      assert.equal(await page.getByText('Bill Details',{exact:true}).isVisible(),true);
    });
    await t.test('non-button plus and minus cart controls are both available to Jev', async () => {
      const root=await mkdtemp(path.join(tmpdir(),'slice-quantity-controls-'));
      try {
        await page.goto(`${origin}/cart/populated`);
        const controller=new DominosBrowser({root,apiKey:'test-only'}); controller.page=page;
        controller.knownMenu.set('Margherita',{name:'Margherita'});
        const observation=await controller.observe();
        assert.ok(observation.actions.some(a=>a.label==='Increase quantity by one'&&!a.blocked));
        assert.ok(observation.actions.some(a=>a.label==='Decrease quantity by one'&&!a.blocked));
      } finally {await rm(root,{recursive:true,force:true});}
    });
    await t.test('a genuinely stalled page stops with an understandable error', async () => {
      await page.goto(`${origin}/stalled`);
      await assert.rejects(waitForOrderingPage(page, 200), /Domino’s has not finished loading/);
    });
    await t.test('real textless cart icons retain the correct product and variant',async()=>{
      const root=await mkdtemp(path.join(tmpdir(),'dominos-font-icons-'));
      try {
        await page.goto(`${origin}/cart/populated`);
        await page.setContent('<h2>Bill Details</h2>'+['Large','Regular'].map(size=>`<div class="cart-product-info-layout-row"><div class="product-info"><span class="popular-menu-header"><span>Farmhouse</span></span><div class="cart-item-description">${size} | New Hand Tossed</div></div><div class="selected-info"><div class="cart-item-cta"><div class="btn cta-edit"><span class="anim-ico-minus" style="display:inline-block;width:20px;height:20px"></span><span class="item-quantity">2</span><span class="jfi-add-v2 add-black fs-8" style="display:inline-block;width:20px;height:20px"></span></div></div><div class="product-price">₹1398</div></div></div>`).join(''));
        const controller=new DominosBrowser({root,apiKey:'test-only'});controller.page=page;controller.knownMenu.set('Farmhouse',{name:'Farmhouse'});
        const o=await controller.observe();
        for(const size of ['Large','Regular']){
          const plus=o.actions.filter(a=>a.label==='Increase quantity by one'&&a.variant===`${size} | New Hand Tossed`);
          assert.equal(plus.length,1);assert.equal(plus[0].product,'Farmhouse');assert.equal(plus[0].cartQuantity,2);assert.equal(plus[0].blocked,false);
        }
        assert.equal(o.cartItems.length,2);
        assert.deepEqual(o.cartItems.map(p=>p.cartQuantity),[2,2]);
      } finally {await rm(root,{recursive:true,force:true});}
    });
    await t.test('a reset guest cart keeps a persisted recovery copy instead of losing items', async () => {
      const root = await mkdtemp(path.join(tmpdir(),'slice-cart-recovery-'));
      try {
        await page.goto(`${origin}/menu`); await waitForOrderingPage(page,3000);
        const controller = new DominosBrowser({root,apiKey:'test-only'});
        controller.page = page;
        const oldItem = {name:'Farmhouse',variant:'Large | New Hand Tossed',cartQuantity:2};
        controller.knownCart.set('Farmhouse',oldItem);
        await controller.observe(); await controller.observe();
        assert.deepEqual(controller.state().cartItems,[]);
        assert.deepEqual(controller.state().savedCart,[oldItem]);
        assert.equal(controller.state().cartRecoveryNeeded,true);
        const restored = new DominosBrowser({root,apiKey:'test-only'});
        assert.deepEqual(restored.state().savedCart,[oldItem]);
        assert.equal(restored.state().cartRecoveryNeeded,true);
      } finally { await rm(root,{recursive:true,force:true}); }
    });
  } finally { await browser.close(); }
});

test('a home or login page cannot establish that a menu item is unavailable', () => {
  assert.equal(canReportUnavailable({products:[]}),false);
  assert.equal(canReportUnavailable({products:[{name:'Margherita'}]}),true);
});

test('browser errors keep implementation stack traces out of chat', () => {
  assert.equal(readableBrowserError(new Error('locator.waitFor: Timeout 30000ms exceeded.\nCall log: ...')), 'The Domino’s page changed or closed before the next step. Check the current cart, then send your request again.');
  assert.equal(readableBrowserError(new Error('OpenRouter HTTP 401: invalid key')), 'OpenRouter HTTP 401: invalid key');
});
