import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PlaylistSelectionModal } from './PlaylistSelectionModal';

// Mock Lucide icons
jest.mock('lucide-react-native', () => ({
    X: () => 'X-Icon',
}));

describe('PlaylistSelectionModal', () => {
    const mockPlaylists = [
        {
            id: '1',
            name: 'Chill Vibes',
            tracks: [
                { id: '1', title: 'T1', artist: 'A1', duration: 100 } as any,
                { id: '2', title: 'T2', artist: 'A2', duration: 200 } as any
            ],
            trackCount: 2,
            totalDuration: 300,
            createdAt: '',
            updatedAt: ''
        },
        {
            id: '2',
            name: 'Gym Mix',
            tracks: [],
            trackCount: 0,
            totalDuration: 0,
            createdAt: '',
            updatedAt: ''
        },
    ];
    const mockOnClose = jest.fn();
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders correctly when visible', () => {
        const { getByText } = render(
            <PlaylistSelectionModal
                visible={true}
                onClose={mockOnClose}
                onSelect={mockOnSelect}
                playlists={mockPlaylists}
            />
        );

        expect(getByText('Add to Playlist')).toBeTruthy();
        expect(getByText('Chill Vibes')).toBeTruthy();
        expect(getByText('2 tracks')).toBeTruthy();
        expect(getByText('Gym Mix')).toBeTruthy();
        expect(getByText('0 tracks')).toBeTruthy();
    });

    it('renders empty state message', () => {
        const { getByText } = render(
            <PlaylistSelectionModal
                visible={true}
                onClose={mockOnClose}
                onSelect={mockOnSelect}
                playlists={[]}
            />
        );

        expect(getByText('No playlists available')).toBeTruthy();
    });

    it('calls onSelect when a playlist is pressed', () => {
        const { getByText } = render(
            <PlaylistSelectionModal
                visible={true}
                onClose={mockOnClose}
                onSelect={mockOnSelect}
                playlists={mockPlaylists}
            />
        );

        fireEvent.press(getByText('Chill Vibes'));
        expect(mockOnSelect).toHaveBeenCalledWith('1');
    });
});
