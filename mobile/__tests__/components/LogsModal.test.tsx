import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { LogsModal } from '../../components/LogsModal';
import { mobileLoggerService } from '../../services/MobileLoggerService';

jest.mock('../../theme', () => ({
    useTheme: () => ({
        background: '#121212',
        card: '#1e1e1e',
        text: '#ffffff',
        textSecondary: '#a1a1aa',
        border: '#27272a',
        input: '#27272a',
        accent: '#3b82f6',
    }),
}));

jest.mock('../../services/MobileLoggerService', () => ({
    mobileLoggerService: {
        getLogs: jest.fn(),
        shareLogs: jest.fn(),
        copyLogs: jest.fn(),
        clearLogs: jest.fn(),
    },
}));

describe('LogsModal', () => {
    const mockOnClose = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (mobileLoggerService.getLogs as jest.Mock).mockResolvedValue(
            '[2026-08-31T12:00:00.000Z] [INFO] App initialized\n' +
            '[2026-08-31T12:00:01.000Z] [WARN] Low memory\n' +
            '[2026-08-31T12:00:02.000Z] [ERROR] Network timeout\n'
        );
    });

    it('renders logs and handles search filtering', async () => {
        const { getByText, getByPlaceholderText, queryByText } = render(
            <LogsModal visible={true} onClose={mockOnClose} />
        );

        await waitFor(() => {
            expect(getByText(/App initialized/)).toBeTruthy();
            expect(getByText(/Low memory/)).toBeTruthy();
            expect(getByText(/Network timeout/)).toBeTruthy();
        });

        fireEvent.changeText(getByPlaceholderText('Search logs...'), 'Network');

        expect(queryByText(/App initialized/)).toBeNull();
        expect(getByText(/Network timeout/)).toBeTruthy();
    });

    it('handles share action', async () => {
        (mobileLoggerService.shareLogs as jest.Mock).mockResolvedValue(true);

        const { getByLabelText } = render(
            <LogsModal visible={true} onClose={mockOnClose} />
        );

        await waitFor(() => {
            expect(mobileLoggerService.getLogs).toHaveBeenCalled();
        });

        fireEvent.press(getByLabelText('Share logs'));

        await waitFor(() => {
            expect(mobileLoggerService.shareLogs).toHaveBeenCalled();
        });
    });

    it('handles copy action', async () => {
        (mobileLoggerService.copyLogs as jest.Mock).mockResolvedValue(true);

        const { getByLabelText } = render(
            <LogsModal visible={true} onClose={mockOnClose} />
        );

        await waitFor(() => {
            expect(mobileLoggerService.getLogs).toHaveBeenCalled();
        });

        fireEvent.press(getByLabelText('Copy logs'));

        await waitFor(() => {
            expect(mobileLoggerService.copyLogs).toHaveBeenCalled();
        });
    });

    it('handles clear action with confirmation', async () => {
        jest.spyOn(Alert, 'alert');
        (mobileLoggerService.clearLogs as jest.Mock).mockResolvedValue(undefined);

        const { getByLabelText, getByText } = render(
            <LogsModal visible={true} onClose={mockOnClose} />
        );

        await waitFor(() => {
            expect(getByText(/App initialized/)).toBeTruthy();
        });

        fireEvent.press(getByLabelText('Clear logs'));

        expect(Alert.alert).toHaveBeenCalledWith(
            'Clear Logs',
            'Are you sure you want to clear all application logs?',
            expect.any(Array)
        );

        const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
        const clearBtn = alertButtons.find((btn: any) => btn.text === 'Clear');

        await act(async () => {
            await clearBtn.onPress();
        });

        expect(mobileLoggerService.clearLogs).toHaveBeenCalled();
    });

    it('triggers onClose when close button is pressed', async () => {
        const { getByLabelText } = render(
            <LogsModal visible={true} onClose={mockOnClose} />
        );

        fireEvent.press(getByLabelText('Close logs'));
        expect(mockOnClose).toHaveBeenCalled();
    });
});
