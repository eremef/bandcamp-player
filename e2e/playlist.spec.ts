import { test, expect } from './fixtures';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'playlist-item',
            type: 'album' as const,
            token: 'playlist-token',
            purchaseDate: '2026-09-30T10:00:00.000Z',
            album: {
                id: 'playlist-album',
                title: 'Playlist Album',
                artist: 'Playlist Artist',
                artistId: 'playlist-artist',
                artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/playlist',
                trackCount: 2,
                tracks: [
                    {
                        id: 'playlist-track-1',
                        title: 'Playlist Track One',
                        artist: 'Playlist Artist',
                        artistId: 'playlist-artist',
                        album: 'Playlist Album',
                        duration: 180,
                        artworkUrl: '',
                        streamUrl: 'https://mock.stream/playlist-one.mp3',
                        bandcampUrl: '',
                        isCached: true,
                    },
                    {
                        id: 'playlist-track-2',
                        title: 'Playlist Track Two',
                        artist: 'Playlist Artist',
                        artistId: 'playlist-artist',
                        album: 'Playlist Album',
                        duration: 200,
                        artworkUrl: '',
                        streamUrl: 'https://mock.stream/playlist-two.mp3',
                        bandcampUrl: '',
                        isCached: true,
                    },
                ],
            },
        },
    ],
    totalCount: 1,
    lastUpdated: '2026-09-30T10:00:00.000Z',
};

test.describe('Playlist Lifecycle', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async () => mockCollection);
        }, MOCK_COLLECTION);

        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginButton.isVisible()) {
            await loginButton.click();
        }
        await expect(collectionButton).toBeVisible({ timeout: 15000 });
        await collectionButton.click();
        await window.getByTitle('Refresh').click();
        await expect(window.getByText('Playlist Album')).toBeVisible({ timeout: 10000 });
    });

    test('creates a playlist and adds collection tracks', async ({ window }) => {
        const playlistName = `Playlist E2E ${Date.now()}`;
        await window.getByRole('button', { name: 'Create Playlist' }).click();
        const nameInput = window.getByPlaceholder('Playlist name...');
        await nameInput.fill(playlistName);
        await nameInput.press('Enter');

        const playlistButton = window.getByRole('button', { name: new RegExp(playlistName) });
        await expect(playlistButton).toBeVisible({ timeout: 10000 });

        const albumCard = window.getByTestId('album-card').filter({ hasText: 'Playlist Album' });
        await albumCard.click({ button: 'right' });
        const contextMenu = albumCard.locator('div[class*="menu"]').filter({ hasText: 'Play Now' });
        await contextMenu.getByRole('button', { name: 'Add to Playlist', exact: true }).click();

        const modalHeading = window.getByRole('heading', { name: 'Add to Playlist', exact: true });
        await expect(modalHeading).toBeVisible();
        const playlistModal = window.locator('div[class*="modal"]').filter({ has: modalHeading });
        await playlistModal.getByRole('button', { name: new RegExp(playlistName) }).click();

        await playlistButton.click();
        await expect(window.getByRole('heading', { level: 1 })).toContainText(playlistName);
        await expect(window.getByText('Playlist Track One', { exact: true })).toBeVisible();
        await expect(window.getByText('Playlist Track Two', { exact: true })).toBeVisible();
    });
});
