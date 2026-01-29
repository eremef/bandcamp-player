import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from './store';
import { act } from '@testing-library/react';

// Mock the window.electron object since the store calls it directly
const mockElectron = {
    auth: {
        login: vi.fn(),
        logout: vi.fn(),
        checkSession: vi.fn(),
        onAuthChanged: vi.fn(),
    },
    player: {
        play: vi.fn(),
        pause: vi.fn(),
        togglePlay: vi.fn(),
        getState: vi.fn(),
        onStateChanged: vi.fn(),
        onTrackChanged: vi.fn(),
        onTimeUpdate: vi.fn(),
    },
    collection: {
        fetch: vi.fn(),
    },
    playlist: {
        getAll: vi.fn(),
    }
};

// Assign to window
Object.defineProperty(window, 'electron', {
    value: mockElectron,
    writable: true
});

describe('useStore', () => {
    beforeEach(() => {
        useStore.setState({
            auth: { isAuthenticated: false, user: null },
            player: {
                isPlaying: false,
                currentTrack: null,
                currentTime: 0,
                duration: 0,
                volume: 0.8,
                isMuted: false,
                repeatMode: 'off',
                isShuffled: false,
                queue: { items: [], currentIndex: -1 },
            }
        });
        vi.clearAllMocks();
    });

    it('should set auth state', () => {
        const authData = {
            isAuthenticated: true,
            user: {
                id: '1',
                username: 'test',
                profileUrl: 'http://test.com'
            }
        };

        act(() => {
            useStore.getState().setAuth(authData);
        });

        expect(useStore.getState().auth).toEqual(authData);
    });

    it('should update player state', () => {
        act(() => {
            useStore.getState().setPlayerState({ isPlaying: true });
        });

        expect(useStore.getState().player.isPlaying).toBe(true);
    });

    it('should call electron.auth.login on login', async () => {
        const mockAuthResult = {
            isAuthenticated: true,
            user: { id: '1', username: 'test', profileUrl: '' }
        };
        mockElectron.auth.login.mockResolvedValue(mockAuthResult);
        // Mock dependent fetches
        mockElectron.collection.fetch.mockResolvedValue({ items: [], totalCount: 0 });
        mockElectron.playlist.getAll.mockResolvedValue([]);

        await act(async () => {
            await useStore.getState().login();
        });

        expect(mockElectron.auth.login).toHaveBeenCalled();
        expect(useStore.getState().auth).toEqual(mockAuthResult);
    });
});
