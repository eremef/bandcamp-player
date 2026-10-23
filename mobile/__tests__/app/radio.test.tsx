import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import RadioScreen from '../../app/(tabs)/radio';
import { useStore } from '../../store';
import { RadioStation } from '@shared/types';
import { Alert } from 'react-native';

jest.mock('../../components/ActionSheet', () => ({
    ActionSheet: ({ visible, title, actions }: any) => {
        const { View, Text, TouchableOpacity } = jest.requireActual('react-native');
        return visible ? (
            <View>
                <Text>{`ActionSheet: ${title}`}</Text>
                {actions.map((a: any) => (
                    <TouchableOpacity key={a.text} onPress={a.onPress}>
                        <Text>{a.text}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        ) : null;
    },
}));

const mockStations: RadioStation[] = [
    {
        id: 'station-1',
        name: 'Cool Station 1',
        description: 'First cool station',
        date: '2023-01-01',
        imageUrl: 'https://example.com/img1.jpg',
        streamUrl: 'https://example.com/stream1.mp3',
        duration: 3600
    },
    {
        id: 'station-2',
        name: 'Awesome Station 2',
        description: 'Second awesome station',
        date: '2023-02-01',
        imageUrl: '',
        streamUrl: 'https://example.com/stream2.mp3',
        duration: 7200
    }
];

const mockPlaylists = [
    { id: 'pl-1', name: 'My Playlist', trackCount: 5, tracks: [] }
];

describe('RadioScreen', () => {
    let mockPlayStation: jest.Mock;
    let mockAddStationToQueue: jest.Mock;
    let mockAddStationToPlaylist: jest.Mock;
    let mockCreatePlaylist: jest.Mock;
    let mockRefreshRadio: jest.Mock;
    let mockSetRadioSearchQuery: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlayStation = jest.fn();
        mockAddStationToQueue = jest.fn();
        mockAddStationToPlaylist = jest.fn();
        mockCreatePlaylist = jest.fn();
        mockRefreshRadio = jest.fn();
        mockSetRadioSearchQuery = jest.fn();

        jest.spyOn(Alert, 'alert').mockImplementation(() => { });

        useStore.setState({
            radioStations: mockStations,
            playlists: mockPlaylists as any,
            radioSearchQuery: '',
            playStation: mockPlayStation,
            addStationToQueue: mockAddStationToQueue,
            addStationToPlaylist: mockAddStationToPlaylist,
            createPlaylist: mockCreatePlaylist,
            refreshRadio: mockRefreshRadio,
            setRadioSearchQuery: mockSetRadioSearchQuery,
        } as any);
    });

    it('renders list of radio stations correctly', async () => {
        const { getByText } = await render(<RadioScreen />);

        expect(getByText('Cool Station 1')).toBeTruthy();
        expect(getByText('Awesome Station 2')).toBeTruthy();
        expect(getByText(/First cool station/i)).toBeTruthy();
        // Since Awesome Station 2 has duration 7200, it formats as 2h 0m
        expect(getByText(/2h 0m/)).toBeTruthy();
    });

    it('shows empty state when no stations', async () => {
        useStore.setState({ radioStations: [] } as any);
        const { getByText } = await render(<RadioScreen />);
        expect(getByText('No radio stations found')).toBeTruthy();
    });

    it('filters stations by search query', async () => {
        useStore.setState({ radioSearchQuery: 'awesome' } as any);
        const { getByText, queryByText } = await render(<RadioScreen />);

        expect(getByText('Awesome Station 2')).toBeTruthy();
        expect(queryByText('Cool Station 1')).toBeNull();
    });

    it('navigates to radio_detail on press', async () => {
        const { getByText } = await render(<RadioScreen />);
        await fireEvent.press(getByText('Cool Station 1'));
        const { mockPush } = require('expo-router');
        expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
            pathname: '/radio_detail',
            params: expect.objectContaining({ id: 'station-1', name: 'Cool Station 1' }),
        }));
    });

    it('long press opens ActionSheet with correct options', async () => {
        const { getByText, getAllByText } = await render(<RadioScreen />);

        // Trigger long press
        await fireEvent(getByText('Cool Station 1'), 'onLongPress');

        // We should see action sheet options
        expect(getByText('Play Next')).toBeTruthy();
        expect(getAllByText('Add to Queue').length).toBeGreaterThan(0);
        expect(getAllByText('Add to Playlist').length).toBeGreaterThan(0);
        expect(getByText('Cancel')).toBeTruthy();
    });

    it('Add to Queue works from ActionSheet', async () => {
        const { getByText, getAllByText } = await render(<RadioScreen />);
        await fireEvent(getByText('Cool Station 1'), 'onLongPress');

        // Target the Mix "Add to Queue" option (first occurrence)
        await fireEvent.press(getAllByText('Add to Queue')[0]);
        expect(mockAddStationToQueue).toHaveBeenCalledWith(mockStations[0], false);
    });

    it('Play Next works from ActionSheet', async () => {
        const { getByText } = await render(<RadioScreen />);
        await fireEvent(getByText('Cool Station 1'), 'onLongPress');

        await fireEvent.press(getByText('Play Next'));
        expect(mockAddStationToQueue).toHaveBeenCalledWith(mockStations[0], true);
    });

    it('Add to Playlist flow', async () => {
        const { getByText, getAllByText } = await render(<RadioScreen />);
        await fireEvent(getByText('Cool Station 1'), 'onLongPress');

        // Click Mix "Add to Playlist" (first occurrence)
        await fireEvent.press(getAllByText('Add to Playlist')[0]);

        // Playlist selection modal should open
        expect(getByText('My Playlist')).toBeTruthy();
        expect(getByText('Create New Playlist')).toBeTruthy(); // verify button exists

        await fireEvent.press(getByText('My Playlist'));
        expect(mockAddStationToPlaylist).toHaveBeenCalledWith('pl-1', mockStations[0]);
        expect(Alert.alert).toHaveBeenCalledWith('Success', 'Added to playlist');
    });

    it('Create new playlist flow', async () => {
        const { getByText, getAllByText, getByPlaceholderText } = await render(<RadioScreen />);
        await fireEvent(getByText('Cool Station 1'), 'onLongPress');
        await fireEvent.press(getAllByText('Add to Playlist')[0]);

        await fireEvent.press(getByText('Create New Playlist'));

        const input = getByPlaceholderText('Playlist Name');
        await fireEvent.changeText(input, 'New PL');
        await fireEvent.press(getByText('Create'));

        expect(mockCreatePlaylist).toHaveBeenCalledWith('New PL');
    });

    it('handles pull to refresh', async () => {
        const { getByTestId } = await render(<RadioScreen />);
        const list = getByTestId('radio-list');

        await act(async () => {
            await list.props.refreshControl.props.onRefresh();
        });

        expect(mockRefreshRadio).toHaveBeenCalled();
    });

    it('updates search query on text change', async () => {
        const { getByPlaceholderText } = await render(<RadioScreen />);
        const searchInput = getByPlaceholderText('Search radio shows...');

        await fireEvent.changeText(searchInput, 'test query');
        expect(mockSetRadioSearchQuery).toHaveBeenCalledWith('test query');
    });
});
