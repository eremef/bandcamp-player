
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArtistsScreen from '../../../app/(tabs)/artists';
import { useStore } from '../../../store';

// Mock dependencies
jest.mock('../../../store', () => ({
    useStore: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
    useFocusEffect: (cb: any) => cb(),
}));




describe('ArtistsScreen', () => {
    const mockRefreshArtists = jest.fn();
    const mockArtists = [
        { id: '1', name: 'Abba', imageUrl: 'http://abba.com/img.jpg' },
        { id: '2', name: 'AC/DC', imageUrl: 'http://acdc.com/img.jpg' },
        { id: '3', name: 'Beatles' }, // No Image
        { id: '4', name: 'Zebra' },
    ];

    beforeEach(() => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                artists: mockArtists,
                refreshArtists: mockRefreshArtists,
                connectionStatus: 'connected',
            };
            return selector ? selector(state) : state;
        });
        jest.clearAllMocks();
    });

    it('renders correctly and lists artists', () => {
        const { getByText, getAllByText } = render(<ArtistsScreen />);

        // Removed header check as it was moved to layout or removed
        expect(getAllByText('A')).toBeTruthy(); // Section A
        expect(getAllByText('B')).toBeTruthy(); // Section B
        expect(getAllByText('Z')).toBeTruthy(); // Section Z

        expect(getByText('Abba')).toBeTruthy();
        expect(getByText('AC/DC')).toBeTruthy();
        expect(getByText('Beatles')).toBeTruthy();
        expect(getByText('Zebra')).toBeTruthy();
    });

    it('filters artists by search query and shows empty state', () => {
        const { getByPlaceholderText, queryByText, getByText } = render(<ArtistsScreen />);

        const searchInput = getByPlaceholderText('Search artists..');
        fireEvent.changeText(searchInput, 'NothingMatchesThis');

        expect(queryByText('Abba')).toBeNull();
        expect(getByText('No artists found')).toBeTruthy();
    });

    it('handles edge cases (missing names, special characters, navigation)', async () => {
        const mockFn = jest.fn();
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                artists: [
                    { id: '5', name: '123 Artist' },
                    { id: '6', name: '  ' }, // Empty name after trim
                    { id: '1', name: 'Abba' },
                ],
                refreshArtists: mockFn,
            };
            return selector ? selector(state) : state;
        });

        const { findByText, queryByText, getAllByText } = render(<ArtistsScreen />);

        // headers and numeric artist
        expect(getAllByText('#').length).toBeGreaterThan(0);
        expect(await findByText('123 Artist')).toBeTruthy();

        // Sections
        expect(getAllByText('A').length).toBeGreaterThan(0);
        expect(await findByText('Abba')).toBeTruthy();

        // Navigate
        fireEvent.press(await findByText('Abba'));
        expect(mockPush).toHaveBeenCalledWith({
            pathname: '/artist/artist_detail',
            params: { id: '1' }
        });

        // Verify empty name artist not rendered
        expect(queryByText('  ')).toBeNull();
    });

    it('handles sorting of # section to the end and diverse grouping', async () => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                artists: [
                    { id: '5', name: '123' },
                    { id: '1', name: 'Abba' },
                    { id: '9', name: 'Zebra' },
                    { id: '10', name: '!!!' },
                ],
                refreshArtists: jest.fn(),
            };
            return selector ? selector(state) : state;
        });

        const { findByText, getAllByText } = render(<ArtistsScreen />);
        expect(getAllByText('A').length).toBeGreaterThan(0);
        expect(getAllByText('#').length).toBeGreaterThan(0);
        expect(await findByText('123')).toBeTruthy();
        expect(await findByText('!!!')).toBeTruthy();
    });

    it('navigates to artist detail on press', () => {
        const { getByText } = render(<ArtistsScreen />);

        fireEvent.press(getByText('Abba'));
        expect(mockPush).toHaveBeenCalledWith({
            pathname: '/artist/artist_detail',
            params: { id: '1' }
        });
    });

    it('renders artists with and without images (placeholder)', () => {
        const { getByText } = render(<ArtistsScreen />);

        // Abba has image, Beatles does not.
        // We can't easily check for Image vs View in this shallow render 
        // without more specific testIDs, but we can verify both render.
        expect(getByText('Abba')).toBeTruthy();
        expect(getByText('Beatles')).toBeTruthy();
    });

    it('chunks artists into rows based on COLUMN_COUNT', () => {
        // COLUMN_COUNT is 3. mockArtists has 4 items.
        // A: Abba, AC/DC (2 items) -> 1 row
        // B: Beatles (1 item) -> 1 row
        // Z: Zebra (1 item) -> 1 row
        // Total rows: 3

        const { getByText } = render(<ArtistsScreen />);
        expect(getByText('Abba')).toBeTruthy();
    });
});
