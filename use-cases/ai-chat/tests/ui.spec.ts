import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Every test is offline with respect to providers, even when the developer has supplied a key.
  await page.route('**/api/status', route => route.fulfill({ json: { configured: false, model: 'jev-1.13', emojiCount: 4000, baseCount: 1900, envPath: '/local/emote/.env', provider: 'OpenRouter' } }));
  await page.route('**/api/suggest', route => {
    const { text } = route.request().postDataJSON();
    return route.fulfill({ json: { text, emojis: [{ id: 'pizza', family: 'pizza', emoji: '🍕', label: 'pizza', group: 'food', subgroup: 'food', tags: [], tone: null }], source: 'local', model: null, elapsedMs: 0 } });
  });
});

test('typing is debounced, emoji insert at the caret, and Escape clears search', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  let calls = 0; page.on('request', req => { if (req.url().endsWith('/api/suggest')) calls++; });
  await page.goto('http://127.0.0.1:5173');
  const input = page.getByRole('textbox', { name: 'Your message' });
  await input.pressSequentially('pizza tonight', { delay: 30 });
  await expect(page.getByRole('button', { name: 'Insert pizza', exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(5, 5));
  await page.getByRole('button', { name: 'Insert pizza', exact: true }).click();
  await expect(input).toHaveValue('pizza🍕 tonight');
  await input.press('!');
  await expect(input).toHaveValue('pizza🍕! tonight');
  await input.press('Escape');
  await expect(input).toBeEmpty();
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('clearing a draft prevents old delayed responses from reappearing', async ({ page }) => {
  await page.route('**/api/suggest', async route => {
    const { text } = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({ json: { text, source: 'local', emojis: [{ id: 'coffee', emoji: '☕', label: 'hot beverage' }], elapsedMs: 800, model: null } }).catch(() => {});
  });
  await page.goto('http://127.0.0.1:5173');
  const input = page.getByRole('textbox', { name: 'Your message' });
  const requested = page.waitForRequest('**/api/suggest');
  await input.fill('coffee'); await requested; await input.fill('');
  await page.waitForTimeout(1000);
  await expect(page.getByRole('button', { name: 'Insert hot beverage', exact: true })).toHaveCount(0);
  await expect(page.getByText('Find the right emoji for what you mean.')).toBeVisible();
});

test('full picker, skin variants, keyboard dismissal and configuration are usable', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'All emoji', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search all emoji' });
  await search.fill('woman technologist');
  await page.getByRole('checkbox', { name: 'Skin tones' }).check();
  await page.getByRole('button', { name: 'Insert woman technologist: medium skin tone', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your message' })).toHaveValue('👩🏽‍💻');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Use a .env file instead', { exact: true }).click();
  await expect(page.getByText('/local/emote/.env', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('key setup masks the key, tests it, clears the field, and reports connection', async ({ page }) => {
  const key = 'sk-or-v1-browser-test-key-not-real';
  let saved = false;
  await page.route('**/api/settings/openrouter', async route => {
    expect(route.request().postDataJSON()).toEqual({ apiKey: key });
    expect(route.request().headers()['x-emote-setup']).toBe('1');
    saved = true;
    await route.fulfill({ json: { configured: true, connectionVerified: true, model: 'jev-1.13', emojiCount: 3963, baseCount: 1923, envPath: '/local/emote/.env', provider: 'OpenRouter' } });
  });
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const field = page.getByLabel('OpenRouter API key', { exact: true });
  await expect(field).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Save & test connection' })).toBeDisabled();
  await field.fill(key);
  await page.getByRole('button', { name: 'Save & test connection' }).click();
  await expect(page.getByRole('status')).toContainText('TypeSafe Jev is ready');
  await expect(field).toBeEmpty();
  expect(saved).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain(key);
  await expect(page.getByRole('button', { name: 'Test saved key' })).toBeVisible();
});

test('rejected keys show a useful error without claiming success', async ({ page }) => {
  await page.route('**/api/settings/openrouter', route => route.fulfill({ status: 401, json: { error: 'OpenRouter rejected this key. Copy a valid API key and try again.' } }));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('OpenRouter API key', { exact: true }).fill('sk-or-v1-browser-test-key-not-real');
  await page.getByRole('button', { name: 'Save & test connection' }).click();
  await expect(page.getByRole('alert')).toContainText('rejected this key');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('provider failure shows a retry and never claims an AI result', async ({ page }) => {
  await page.route('**/api/suggest', route => route.fulfill({ status: 402, json: { error: 'Your OpenRouter account needs credits to use Jev.' } }));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('textbox', { name: 'Your message' }).fill('hello');
  await expect(page.getByRole('alert')).toContainText('needs credits');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

test('phone layout keeps search and matches clear of the emoji floor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Your message' })).toBeInViewport();
  await page.getByRole('textbox', { name: 'Your message' }).fill('pizza');
  await expect(page.getByRole('button', { name: 'Insert pizza', exact: true })).toBeVisible();
  const matches = await page.locator('.matches').boundingBox();
  const floor = await page.locator('.emoji-floor').boundingBox();
  expect(matches!.y + matches!.height).toBeLessThan(floor!.y);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('textbox', { name: 'Your message' })).toBeEmpty();
});

test('matches rise from the pile and a deletion immediately drops them back', async ({ page }) => {
  await page.route('**/api/suggest', route => {
    const { text } = route.request().postDataJSON();
    return route.fulfill({ json: { text, source: 'local', model: null, elapsedMs: 0, emojis: text === 'pizza' ? [{ id: 'pizza', family: 'pizza', emoji: '🍕', label: 'pizza' }] : [] } });
  });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('.fallen-emoji').first().waitFor();
  const input = page.getByRole('textbox', { name: 'Your message' });
  await input.fill('pizza');
  const rising = page.locator('.emoji-rising');
  await expect(rising).toHaveCount(1);
  await rising.evaluate(element => { const animation = element.getAnimations()[0]; animation.pause(); animation.currentTime = 0; });
  const bottom = await rising.boundingBox();
  const floor = await page.locator('.emoji-floor').boundingBox();
  expect(bottom!.y).toBeGreaterThan(floor!.y);
  await rising.evaluate(element => { element.getAnimations()[0].currentTime = 760; });
  const top = await rising.boundingBox();
  expect(bottom!.y - top!.y).toBeGreaterThan(250);
  await rising.evaluate(element => element.getAnimations()[0].finish());
  await expect(rising).toHaveCount(0);
  await expect(page.locator('.match span')).toBeVisible();
  await input.press('Backspace');
  await expect(page.locator('.emoji-dropping')).toHaveCount(1);
  await expect(page.locator('.match')).toHaveCount(0);
  await page.locator('.emoji-dropping').evaluate(element => element.getAnimations()[0].finish());
  await expect(page.locator('.emoji-flight')).toHaveCount(0);
  await expect(page.locator('.fallen-emoji[data-emoji-id="pizza"]')).toBeVisible();
});

test('a mid-flight deletion reverses from the current position without orphan sprites', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  const input = page.getByRole('textbox', { name: 'Your message' });
  await input.fill('pizza');
  const rising = page.locator('.emoji-rising');
  await expect(rising).toHaveCount(1);
  await rising.evaluate(element => { const animation = element.getAnimations()[0]; animation.pause(); animation.currentTime = 290; });
  const before = await rising.boundingBox();
  await input.press('Escape');
  const dropping = page.locator('.emoji-dropping');
  await expect(dropping).toHaveCount(1);
  await dropping.evaluate(element => { const animation = element.getAnimations()[0]; animation.pause(); animation.currentTime = 0; });
  const after = await dropping.boundingBox();
  expect(Math.abs((before!.x + before!.width / 2) - (after!.x + after!.width / 2))).toBeLessThan(3);
  expect(Math.abs((before!.y + before!.height / 2) - (after!.y + after!.height / 2))).toBeLessThan(3);
  const renewedFlight = page.waitForFunction(() => document.querySelector('.emoji-rising'), null, { polling: 'raf', timeout: 3000 });
  await input.fill('pizza again');
  await renewedFlight;
  await expect(dropping).toHaveCount(0);
  await rising.evaluate(element => element.getAnimations()[0].finish());
  await expect(page.locator('.emoji-flight')).toHaveCount(0);
  await expect(page.locator('.match span')).toBeVisible();
  await input.press('Escape');
  await expect(dropping).toHaveCount(1);
  await dropping.evaluate(element => element.getAnimations()[0].finish());
  await expect(page.locator('.emoji-flight')).toHaveCount(0);
});

test('changing meaning replaces matches with simultaneous downward and upward flights', async ({ page }) => {
  await page.route('**/api/suggest', route => {
    const { text } = route.request().postDataJSON();
    const coffee = text.includes('coffee');
    return route.fulfill({ json: { text, source: 'local', model: null, elapsedMs: 0, emojis: [{ id: coffee ? 'coffee' : 'pizza', family: coffee ? 'coffee' : 'pizza', emoji: coffee ? '☕' : '🍕', label: coffee ? 'hot beverage' : 'pizza' }] } });
  });
  await page.goto('http://127.0.0.1:5173');
  const input = page.getByRole('textbox', { name: 'Your message' });
  await input.fill('pizza');
  await expect(page.locator('.emoji-rising')).toHaveCount(1);
  await page.locator('.emoji-rising').evaluate(element => element.getAnimations()[0].finish());
  await expect(page.locator('.emoji-flight')).toHaveCount(0);
  await input.fill('pizza then coffee');
  await expect(page.getByRole('button', { name: 'Insert pizza', exact: true })).toBeVisible();
  await expect(page.locator('.emoji-dropping[data-emoji-id="pizza"]')).toHaveCount(1);
  await expect(page.locator('.emoji-rising[data-emoji-id="coffee"]')).toHaveCount(1);
  await page.locator('.emoji-flight').evaluateAll(elements => elements.forEach(element => element.getAnimations()[0].finish()));
  await expect(page.locator('.emoji-flight')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Insert hot beverage', exact: true })).toBeVisible();
});

test('reduced-motion preference keeps matches instant and skips flights', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173');
  const input = page.getByRole('textbox', { name: 'Your message' });
  await input.fill('pizza');
  await expect(page.locator('.match span')).toBeVisible();
  await expect(page.locator('.emoji-flight')).toHaveCount(0);
  await input.press('Escape');
  await expect(page.locator('.emoji-flight')).toHaveCount(0);
  await expect(page.locator('.fallen-emoji[data-emoji-id="pizza"]')).toBeVisible();
});
