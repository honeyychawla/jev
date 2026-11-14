// Runs in the ordering page. Read visible content, never assume a destination
// URL survived Domino's client-side session/login redirects.
export function orderingPageReady() {
  const visible = element => {
    if (!element) return false;
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const body = document.body?.innerText || '';
  const privateInput = [...document.querySelectorAll('input')].some(element => visible(element) &&
    (/tel|password/.test(element.type) || /otp|mobile|phone|address|pincode|pin code|password/i.test(`${element.placeholder} ${element.getAttribute('aria-label') || ''}`)));
  if (privateInput || [...document.querySelectorAll('iframe')].some(element => visible(element) && /captcha/i.test(`${element.title} ${element.src}`))) return 'handoff';
  if (/\/cart(?:\/|$)/.test(location.pathname) && /Bill Details|(?:your\s+)?cart\s+is\s+empty|empty\s+cart/i.test(body)) return 'cart';
  // Recommendations may render before cart rows. They cannot establish that
  // the cart is ready to read or change.
  if (!/\/cart(?:\/|$)/.test(location.pathname) && [...document.querySelectorAll('.card-botm-gradient')].some(element => visible(element) && element.querySelector('h2')?.innerText?.trim() && element.querySelector('.pizza-price')?.innerText?.trim())) return 'menu';
  if (/\/home(?:-guest)?(?:\/|$)/.test(location.pathname) && /Veg Pizza|Pizza Mania|What are you craving/i.test(body)) return 'home';
  if ([...document.querySelectorAll('[role="dialog"],.modal-mask')].some(element => visible(element) && /location|address|sign.?in|log.?in|verify/i.test(element.innerText))) return 'handoff';
  return false;
}

export async function waitForOrderingPage(page, timeout = 20000) {
  try {
    const result = await page.waitForFunction(orderingPageReady, null, { timeout, polling: 100 });
    const kind = await result.jsonValue();
    await result.dispose();
    return kind;
  } catch (error) {
    if (page.isClosed()) throw new Error('The Domino’s browser was closed. Send your message again to reopen it.');
    if (error.name === 'TimeoutError') throw new Error('Domino’s has not finished loading. Your cart was not changed by this check. Reopen the ordering browser or try again.');
    throw error;
  }
}

export const canReportUnavailable = observation => Boolean(observation.products?.length);
export const readableBrowserError = error => {
  const message = String(error?.message || error).replace(/\u001b\[[0-9;]*m/g, '');
  if (/locator\.(?:waitFor|click)|waiting for .*locator|Execution context was destroyed|Target page, context or browser has been closed/i.test(message)) {
    return 'The Domino’s page changed or closed before the next step. Check the current cart, then send your request again.';
  }
  if (error?.name === 'TimeoutError') return 'Domino’s did not finish opening the next page. Check the ordering browser and try again when it has loaded.';
  return message;
};
