import { test, expect } from './fixtures';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'playback-album',
            type: 'album' as const,
            token: 'playback-token',
            purchaseDate: '2026-09-30T10:00:00.000Z',
            album: {
                id: 'playback-album-id',
                title: 'Playback Album',
                artist: 'Playback Artist',
                artistId: 'playback-artist-id',
                artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/playback',
                trackCount: 1,
                tracks: [
                    {
                        id: 'playback-track-id',
                        title: 'Playback Track',
                        artist: 'Playback Artist',
                        artistId: 'playback-artist-id',
                        album: 'Playback Album',
                        duration: 180,
                        artworkUrl: '',
                        streamUrl: 'https://mock.stream/playback.mp3',
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

test.describe('Player Controls', () => {
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
        await expect(window.getByText('Playback Album')).toBeVisible({ timeout: 10000 });
    });

    test('shows the main playback controls', async ({ window }) => {
        const playerBar = window.locator('div[class*="playerBar"]');
        await expect(playerBar.getByTestId('player-play-btn')).toBeVisible();
        await expect(playerBar.getByTestId('player-next-btn')).toBeVisible();
        await expect(playerBar.getByTestId('player-prev-btn')).toBeVisible();
        await expect(playerBar.getByTestId('player-shuffle-btn')).toBeVisible();
        await expect(playerBar.getByTitle('Mute').or(playerBar.getByTitle('Unmute'))).toBeVisible();
    });

    test('plays and pauses a selected collection track', async ({ window }) => {
        const albumCard = window.getByTestId('album-card').filter({ hasText: 'Playback Album' });
        await albumCard.getByTitle('Play').click();

        const playerBar = window.locator('div[class*="playerBar"]');
        const playPauseButton = playerBar.getByTestId('player-play-btn');
        await expect(playPauseButton).toHaveAttribute('title', 'Pause');
        await expect(playerBar).toContainText('Playback Track');

        await playPauseButton.click();
        await expect(playPauseButton).toHaveAttribute('title', 'Play');
    });
});
