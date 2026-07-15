import { test } from './fixtures';
test.describe('Debug Artist Link', () => {
  let app: any;
  let window: any;

  test.beforeEach(async ({ electronApp, window: win }) => {
    app = electronApp;
    window = win;



  });

  test.afterEach(async () => {
    if (app) await app.close();
  });

  test('should not show artist not found', async () => {
    // Navigate to collection
    await window.click('text=Collection');

    // Wait for the mock items to render
    await window.waitForTimeout(1000);

    // Find the first AlbumCard artist link
    const el = window.locator('p[title="Go to artist"]').first();
    const artistName = await el.innerText();
    console.log('Clicked artist:', artistName);

    // Click it (need to force or evaluate since it might be an overlay issue)
    await el.evaluate((node: any) => node.click());

    await window.waitForTimeout(1000);

    // Check if Artist not found appears
    const notFound = window.locator('text=Artist not found');
    if (await notFound.isVisible()) {
      console.log('ARTIST NOT FOUND APPEARED!');
      const content = await window.locator('body').innerText();
      console.log('Body content:\n', content);
    } else {
      console.log('ARTIST FOUND SUCCESSFULLY');
      const content = await window.locator('body').innerText();
      console.log('Body content instead:\n', content);
    }
  });
});
