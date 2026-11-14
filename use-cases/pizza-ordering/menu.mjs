export const MENU = [
  { id: 'mushroom', name: 'Mushroom pizza', kind: 'pizza', description: 'Roasted mushrooms, mozzarella, garlic & thyme', sizes: { small: 1200, medium: 1500, large: 1800 } },
  { id: 'margherita', name: 'Margherita pizza', kind: 'pizza', description: 'Tomato, fresh mozzarella & basil', sizes: { small: 1000, medium: 1300, large: 1600 } },
  { id: 'pepperoni', name: 'Pepperoni pizza', kind: 'pizza', description: 'Pepperoni, mozzarella & tomato', sizes: { small: 1300, medium: 1600, large: 1900 } },
  { id: 'lemonade', name: 'Lemonade', kind: 'drink', description: 'Still lemonade · 330 ml', sizes: { regular: 400 } },
  { id: 'sparkling_water', name: 'Sparkling water', kind: 'drink', description: 'Sparkling mineral water · 330 ml', sizes: { regular: 300 } },
];
export function pricedCart(cart) {
  const items = cart.map(line => {
    const menuItem = MENU.find(item => item.id === line.menuId);
    if (!menuItem || !Number.isInteger(menuItem.sizes[line.size]) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) throw new Error('Invalid cart item.');
    const unitPrice = menuItem.sizes[line.size];
    return { ...line, name: menuItem.name, kind: menuItem.kind, unitPrice, lineTotal: unitPrice * line.quantity };
  });
  return { items, subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0), total: items.reduce((sum, item) => sum + item.lineTotal, 0), currency: 'USD', quantity: items.reduce((sum, item) => sum + item.quantity, 0) };
}
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
