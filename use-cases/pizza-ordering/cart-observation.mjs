const variantKey = variant => String(variant || '').replace(/[\s|·]/g, '').toLowerCase();
export const cartLineKey = item => `${item.name}|${variantKey(item.variant)}`;

// Domino's menu counter aggregates every size of the product. Only cart rows
// identify the actual quantity of each variant; never turn that aggregate into
// a size-specific cart line.
export function mergeMenuObservation(current, products) {
  return current;
}

export const changesCart = label => /(?:Add\s*\+|Increase quantity|Decrease quantity|Repeat Last|^Remove$|Update)/i.test(label);
export function candidatesForCartCheck(actions, verificationNeeded, modal) {
  const allowed = actions.filter(action => !action.blocked);
  if (verificationNeeded && !modal && allowed.some(action => /^View Cart$/i.test(action.label))) return allowed.filter(action => /^View Cart$/i.test(action.label));
  return allowed;
}
