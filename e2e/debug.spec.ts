import { test, expect } from './fixtures';

test('dump collection dom', async ({ window, electronApp }) => {
    // Mirror offline-mode setup
    const MOCK_COLLECTION = {
        items: [
            {
                id: 'item-1', type: 'album' as const, token: 'tok-1',
                purchaseDate: new Date().toISOString(),
                album: {
                    id: 'ma-1', title: 'Cached Album', artist: 'Cached Artist',
                    artistId: 'artist-cached', artworkUrl: '',
                    bandcampUrl: 'https://mock.bandcamp.com/album/cached',
                    trackCount: 1,
                    tracks: [
                        { id: 'mt-1', title: 'Cached Track', artist: 'Cached Artist', artistId: 'artist-cached', album: 'Cached Album', duration: 180, artworkUrl: '', streamUrl: 'https://mock.stream/cached.mp3', bandcampUrl: '', isCached: true }
                    ],
                },
                isCached: true
            }
        ],
        totalCount: 1,
        lastUpdated: new Date().toISOString(),
    };

    await electronApp.evaluate(({ ipcMain, webContents }, mockCollection) => {
        ipcMain.removeHandler('collection:fetch');
        ipcMain.removeHandler('collection:refresh');
        ipcMain.handle('collection:fetch', async () => mockCollection);
        ipcMain.handle('collection:refresh', async () => mockCollection);

        // Mock cache to return the cached track so the badge displays properly
        ipcMain.removeHandler('cache:get-cached-tracks');
        ipcMain.handle('cache:get-cached-tracks', async () => [
            { id: 'mt-1', albumId: 'ma-1' }
        ]);

        // Trigger the renderer store to fetch the mocked cached tracks
        const wc = webContents.getAllWebContents()[0];
        if (wc) {
            wc.send('cache:on-stats-updated', { trackCount: 1, totalBytes: 1000 });
        }
    }, MOCK_COLLECTION);

    const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
    const collectionBtn = window.getByTestId('nav-collection');

    if (await loginBtn.isVisible()) {
        await loginBtn.click();
    }
    await expect(collectionBtn).toBeVisible({ timeout: 15000 });

    await window.evaluate(async () => {
        await window.electron.settings.set({
            collectionSortKey: 'default',
            collectionSortDirection: 'desc',
            collectionFilterAlbums: true,
            collectionFilterTracks: true,
            collectionFilterWishlist: true,
        });
    });

    await collectionBtn.click();


    try {
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 5000 });
        //console.log("Album card IS VISIBLE!");
    } catch (e) {
        console.log("Album card not visible, dumping DOM...");
        const html = await window.evaluate(() => document.body.innerHTML);
        const fs = require('fs');
        fs.writeFileSync('dom-dump.html', html);
        console.log("DOM_DUMP_SAVED_TO_FILE");
        throw e;
    }
});
