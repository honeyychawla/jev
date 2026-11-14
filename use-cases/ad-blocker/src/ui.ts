export function element<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
export async function request(message: object) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension could not complete this action.');
  return response;
}
export function notice(message: string, error = false) {
  const node = element('notice'); node.textContent = message; node.classList.toggle('error', error); node.hidden = !message;
}
export function run(button: HTMLButtonElement, task: () => Promise<void>) {
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true; button.setAttribute('aria-busy', 'true'); notice('');
    try { await task(); } catch (e) { notice((e as Error).message, true); }
    finally { busy = false; button.removeAttribute('aria-busy'); }
  });
}
