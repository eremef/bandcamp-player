
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ConnectedDevicesModal from './ConnectedDevicesModal';
import { useStore } from '../../store/store';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    X: () => <div data-testid="icon-x" />,
    Smartphone: () => <div data-testid="icon-smartphone" />,
    Monitor: () => <div data-testid="icon-monitor" />,
    Globe: () => <div data-testid="icon-globe" />,
    Clock: () => <div data-testid="icon-clock" />,
    Trash2: () => <div data-testid="icon-trash" />,
}));

// Mock Store
vi.mock('../../store/store', () => ({
    useStore: vi.fn(),
}));

describe('ConnectedDevicesModal', () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined);
    const mockDisconnect = vi.fn();
    const mockOnClose = vi.fn();

    const defaultStore = {
        connectedDevices: [],
        fetchConnectedDevices: mockFetch,
        disconnectDevice: mockDisconnect,
        remoteStatus: {},
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useStore as any).mockReturnValue(defaultStore);
    });

    it('renders loading state initially', async () => {
        render(<ConnectedDevicesModal onClose={mockOnClose} />);
        expect(mockFetch).toHaveBeenCalled();
        // Wait for the effect to finish to avoid act warning
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    });

    it('renders empty state when no devices', async () => {
        render(<ConnectedDevicesModal onClose={mockOnClose} />);
        await waitFor(() => {
            expect(document.body.textContent).toContain('No devices connected');
        });
    });

    it('renders connected devices', async () => {
        const mockDevices = [
            { id: '1', ip: '192.168.1.5', userAgent: 'Android', connectedAt: new Date().toISOString() },
            { id: '2', ip: '192.168.1.6', userAgent: 'iPhone', connectedAt: new Date().toISOString() },
        ];
        (useStore as any).mockReturnValue({
            ...defaultStore,
            connectedDevices: mockDevices,
        });

        const { getByText } = render(<ConnectedDevicesModal onClose={mockOnClose} />);

        await waitFor(() => {
            expect(getByText('Android Device')).toBeInTheDocument();
            expect(getByText('iPhone')).toBeInTheDocument();
            expect(getByText('192.168.1.5')).toBeInTheDocument();
        });
    });

    it('calls disconnect when trash icon is clicked', async () => {
        const mockDevices = [
            { id: '1', ip: '192.168.1.5', userAgent: 'Android', connectedAt: new Date().toISOString() },
        ];
        (useStore as any).mockReturnValue({
            ...defaultStore,
            connectedDevices: mockDevices,
        });

        const { getByTitle } = render(<ConnectedDevicesModal onClose={mockOnClose} />);

        await waitFor(() => {
            const disconnectBtn = getByTitle('Disconnect');
            fireEvent.click(disconnectBtn);
            expect(mockDisconnect).toHaveBeenCalledWith('1');
        });
    });

    it('closes modal on close button click', () => {
        const { getByTestId } = render(<ConnectedDevicesModal onClose={mockOnClose} />);
        fireEvent.click(getByTestId('icon-x').parentElement!); // Assuming icon is inside button
        expect(mockOnClose).toHaveBeenCalled();
    });
});
