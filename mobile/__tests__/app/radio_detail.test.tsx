import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import RadioDetailScreen from '../../app/radio_detail';
import { useStore } from '../../store';
import { RadioStation, Track } from '@shared/types';
import { Alert } from 'react-native';

const mockStation: RadioStation = {
    id: 'station-1',
    name: 'Cool Station 1',
    description: 'First cool station description',
    date: '2023-01-01',
    imageUrl: 'https://example.com/img1.jpg',
    streamUrl: 'https://example.com/stream1.mp3',
    duration: 3600,
};

const mockTracks: Track[] = [
    {
        id: 'track-1',
        title: 'Extracted Track 1',
        artist: 'Artist One',
        album: 'Album One',
        duration: 200,
        artworkUrl: 'https://example.com/art1.jpg',
        streamUrl: 'https://example.com/stream1.mp3',
        bandcampUrl: 'https://example.com/track1',
        isCached: false,
    },
    {
        id: 'track-2',
        title: 'Extracted Track 2',
        artist: 'Artist Two',
        album: 'Album Two',
        duration: 300,
        artworkUrl: 'https://example.com/art2.jpg',
        streamUrl: 'https://example.com/stream2.mp3',
        bandcampUrl: 'https://example.com/track2',
        isCached: false,
    },
];

jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({
        id: 'station-1',
        name: 'Cool Station 1',
        description: 'First cool station description',
        date: '2023-01-01',
        imageUrl: 'https://example.com/img1.jpg',
        streamUrl: 'https://example.com/stream1.mp3',
        duration: '3600',
    }),
    useRouter: () => ({
        back: jest.fn(),
        push: jest.fn(),
    }),
    Stack: {
        Screen: () => null,
    },
}));

jest.mock('../../services/MobileScraperService', () => ({
    mobileScraperService: {
        getStationTracks: jest.fn().mockImplementation(() => Promise.resolve(mockTracks)),
    },
}));

jest.mock('../../components/ActionSheet', () => ({
    ActionSheet: ({ visible, title }: any) => {
        const { View, Text } = jest.requireActual('react-native');
        return visible ? (
            <View>
                <Text>{`ActionSheet: ${title}`}</Text>
            </View>
        ) : null;
    },
}));

describe('RadioDetailScreen', () => {
    let mockPlayStation: jest.Mock;
    let mockPlayTrack: jest.Mock;
    let mockExtractRadioTracksToQueue: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlayStation = jest.fn();
        mockPlayTrack = jest.fn();
        mockExtractRadioTracksToQueue = jest.fn();

        jest.spyOn(Alert, 'alert').mockImplementation(() => { });

        useStore.setState({
            radioStations: [mockStation],
            mode: 'standalone',
            playlists: [],
            playStation: mockPlayStation,
            playTrack: mockPlayTrack,
            extractRadioTracksToQueue: mockExtractRadioTracksToQueue,
            addTrackToQueue: jest.fn(),
            addTrackToPlaylist: jest.fn(),
            createPlaylist: jest.fn(),
        } as any);
    });

    it('renders station header details correctly', async () => {
        const { getAllByText, findByText } = render(<RadioDetailScreen />);

        expect(await findByText('First cool station description')).toBeTruthy();
        expect(getAllByText('Cool Station 1').length).toBeGreaterThan(0);
        expect(await findByText(/2023-01-01/)).toBeTruthy();
        expect(await findByText('Play Full Mix')).toBeTruthy();
    });

    it('fetches and displays extracted tracks using playlist-style layout', async () => {
        const { findByText } = render(<RadioDetailScreen />);

        expect(await findByText('Extracted Track 1')).toBeTruthy();
        expect(await findByText('Artist One')).toBeTruthy();
        expect(await findByText('Extracted Track 2')).toBeTruthy();
        expect(await findByText('Artist Two')).toBeTruthy();
    });

    it('plays full mix when Play Full Mix is pressed', async () => {
        const { getByTestId, findByText } = render(<RadioDetailScreen />);
        await findByText('Play Full Mix');
        const playBtn = getByTestId('play-mix-btn');
        await act(async () => {
            fireEvent.press(playBtn);
        });

        expect(mockPlayStation).toHaveBeenCalledWith(expect.objectContaining({
            id: 'station-1',
            name: 'Cool Station 1',
        }));
    });

    it('extracts tracks when Play Extracted Tracks is pressed', async () => {
        const { getByTestId, findByText } = render(<RadioDetailScreen />);
        await findByText('Play Extracted Tracks');
        const extractBtn = getByTestId('play-extracted-btn');
        await act(async () => {
            fireEvent.press(extractBtn);
        });

        expect(mockExtractRadioTracksToQueue).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'station-1', name: 'Cool Station 1' }),
            false
        );
    });
});
