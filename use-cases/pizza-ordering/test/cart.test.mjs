import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDecision, validateAnswers, routeQuestions } from '../decisions.mjs';
import { pricedCart } from '../menu.mjs';
const original = [{ id: 'p1', menuId: 'mushroom', size: 'large', quantity: 2 }];
test('prices use the menu and integer cents; changing size preserves quantity', () => {
  const result = applyDecision('change', { target: 'p1', item: 'unchanged', size: 'medium', quantity: 'unspecified', quantity_mode: 'keep' }, original);
  assert.equal(pricedCart(result.cart).total, 3000);
  assert.equal(original[0].size, 'large');
  assert.equal(result.cart[0].quantity, 2);
});
test('add merges identical lines, and remove subtracts or removes whole line', () => {
  const a = applyDecision('add', { item: 'mushroom', size: 'large', quantity: '1' }, original);
  assert.equal(a.cart.length, 1); assert.equal(a.cart[0].quantity, 3);
  const b = applyDecision('remove', { target: 'p1', remove_count: '1' }, a.cart);
  assert.equal(b.cart[0].quantity, 2);
  assert.deepEqual(applyDecision('remove', { target: 'p1', remove_count: 'all' }, b.cart).cart, []);
});
test('invalid options or excessive quantities preserve the entire cart', () => {
  for (const d of [{ item: 'mushroom', size: 'regular', quantity: '1' }, { item: 'mushroom', size: 'large', quantity: '10' }, { item: 'unknown', size: 'large', quantity: '1' }]) {
    const r = applyDecision('add', d, original); assert.equal(r.changed, false); assert.deepEqual(r.cart, original);
  }
});
test('changing into an existing identical line merges quantities without losing items', () => {
  const r = applyDecision('change', { target: 'p1', item: 'unchanged', size: 'medium', quantity: 'unspecified', quantity_mode: 'keep' }, [...original, { id: 'p2', menuId: 'mushroom', size: 'medium', quantity: 3 }]);
  assert.equal(r.cart.length, 1); assert.equal(r.cart[0].quantity, 5); assert.equal(pricedCart(r.cart).total, 7500);
});
test('invalid or incomplete Jev responses fail closed', () => {
  const q = routeQuestions();
  assert.throws(() => validateAnswers(q, {}), /no decisions/);
  assert.throws(() => validateAnswers(q, { model: 'other-model', answers: {} }), /unexpected model/);
  assert.throws(() => validateAnswers(q, { model: 'typesafe/jev-1.14', answers: { action: { type: 'choice', choice: 'purchase' } } }), /invalid action/);
  assert.throws(() => validateAnswers(q, { model: 'typesafe/jev-1.14', answers: { action: { type: 'choice', choice: 'add', confidence: 2 } } }), /confidence/);
});
