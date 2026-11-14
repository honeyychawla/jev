// Capture Chrome's existing surface without Playwright's screenshot preparation,
// CSS changes, viewport clipping, or caret hiding on the visible ordering page.
const sessions = new WeakMap();

export async function captureViewport(page, quality = 60) {
  let session = sessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
    session.catch(() => { if (sessions.get(page) === session) sessions.delete(page); });
  }
  let timer;
  try {
    const result = await Promise.race([
      session.then(client => client.send('Page.captureScreenshot', {
        format: 'jpeg', quality, fromSurface: true, captureBeyondViewport: false,
      })),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Live screen capture timed out.')), 4000); }),
    ]);
    return Buffer.from(result.data, 'base64');
  } finally { clearTimeout(timer); }
}
