import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DominosBrowser } from '../dominos-browser.mjs';

test('live screen shares concurrent captures without changing cart, activity, or saved files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dominos-live-screen-'));
  try {
    const browser = new DominosBrowser({root,apiKey:'test-only'});
    let captures = 0;
    browser.page = { isClosed:()=>false, url:()=> 'https://pizzaonline.dominos.co.in/menu', context:()=>({newCDPSession:async()=>({send:async()=>{captures++;return {data:Buffer.from('fixture-frame').toString('base64')};}})}) };
    const before = browser.state();
    const [first, second] = await Promise.all([browser.frame(),browser.frame()]);
    assert.equal(captures,1);
    assert.equal(first,second);
    assert.ok(first.capturedAt>0);
    assert.deepEqual(browser.state(),before);
    assert.equal(browser.images.size,0);
    assert.deepEqual(await readdir(root),[]);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('closing the browser or leaving the allowed site never returns a cached frame as live', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dominos-live-screen-'));
  try {
    const browser = new DominosBrowser({root,apiKey:'test-only'});
    assert.equal(await browser.frame(),null);
    let closed=false, url='https://pizzaonline.dominos.co.in/menu';
    browser.page={isClosed:()=>closed,url:()=>url,context:()=>({newCDPSession:async()=>({send:async()=>({data:Buffer.from('fixture-frame').toString('base64')})})})};
    assert.ok(await browser.frame());
    closed=true; assert.equal(await browser.frame(),null);
    closed=false; url='https://example.com'; assert.equal(await browser.frame(),null);
  } finally {await rm(root,{recursive:true,force:true});}
});
