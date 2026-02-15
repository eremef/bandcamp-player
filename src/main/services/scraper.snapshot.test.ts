// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScraperService } from './scraper.service';
import { AuthService } from './auth.service';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('axios');
vi.mock('./auth.service');

describe('ScraperService Snapshots', () => {
    let scraper: ScraperService;
    let mockAuthService: any;
    let mockAxios: any;

    const fixturesDir = path.join(__dirname, '__fixtures__');

    beforeEach(() => {
        // Setup mocks
        mockAuthService = {
            getUser: vi.fn(),
            getSessionCookies: vi.fn(),
        };
        (AuthService as any).mockImplementation(() => mockAuthService);

        mockAxios = {
            get: vi.fn(),
            post: vi.fn(),
            create: vi.fn().mockReturnThis(),
        };
        (axios.create as any).mockReturnValue(mockAxios);

        scraper = new ScraperService(mockAuthService);
    });

    const loadFixture = (filename: string): string => {
        return fs.readFileSync(path.join(fixturesDir, filename), 'utf-8');
    };

    describe('fetchCollection (Snapshot)', () => {
        it('should parse collection_simple.html correctly', async () => {
            mockAuthService.getUser.mockReturnValue({
                isAuthenticated: true,
                user: { profileUrl: 'https://bandcamp.com/testuser', id: '12345' }
            });
            mockAuthService.getSessionCookies.mockResolvedValue('session=123');

            const htmlContent = loadFixture('collection_simple.html');
            mockAxios.get.mockResolvedValue({ data: htmlContent });
            // Mock empty fetchMore response to avoid loops
            mockAxios.post.mockResolvedValue({ data: { items: [] } });

            const collection = await scraper.fetchCollection(true);

            expect(collection.items).toHaveLength(2); // 2 from script (DOM fallback skipped if script succeeds)

            // Check Item 1 (Album from Script)
            const album1 = collection.items.find(i => i.id === '1001');
            expect(album1).toBeDefined();
            expect(album1?.type).toBe('album');
            expect(album1?.album?.title).toBe('Test Album 1');
            expect(album1?.album?.artist).toBe('Test Artist 1');
            expect(album1?.album?.trackCount).toBe(10);

            // Check Item 2 (Track from Script with "gift given")
            const track1 = collection.items.find(i => i.id === '2001');
            expect(track1).toBeDefined();
            expect(track1?.type).toBe('track');
            expect(track1?.track?.title).toBe('Test Track 1'); // cleaned
            expect(track1?.track?.artist).toBe('Test Artist 2');
        });
    });

    describe('getAlbumDetails (Snapshot)', () => {
        it('should parse album_simple.html correctly', async () => {
            mockAuthService.getSessionCookies.mockResolvedValue('session=123');

            const htmlContent = loadFixture('album_simple.html');
            mockAxios.get.mockResolvedValue({ data: htmlContent });

            const album = await scraper.getAlbumDetails('https://testartist.bandcamp.com/album/test-album');

            expect(album).not.toBeNull();
            expect(album?.title).toBe('Test Album');
            expect(album?.artist).toBe('Test Artist');
            expect(album?.artistId).toBe('999');
            expect(album?.trackCount).toBe(3);

            // Check tracks
            const t1 = album?.tracks.find(t => t.trackNumber === 1);
            expect(t1?.title).toBe('Track One');
            expect(t1?.streamUrl).toBe('https://stream.bandcamp.com/track/101');

            const t3 = album?.tracks.find(t => t.trackNumber === 3);
            expect(t3?.title).toBe('Track Three (No Stream)');
            expect(t3?.streamUrl).toBe('');
        });
    });


});
