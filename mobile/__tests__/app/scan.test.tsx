import { fireEvent, render } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import PairingQrScannerScreen from '../../app/scan';

const mockRouter = {
    back: jest.fn(),
    replace: jest.fn(),
};

jest.mock('expo-camera', () => {
    const React = require('react');
    const { View } = require('react-native');
    return {
        CameraView: (props: { onBarcodeScanned?: (result: { data: string }) => void }) =>
            React.createElement(View, { testID: 'camera-view', onBarcodeScanned: props.onBarcodeScanned }),
        useCameraPermissions: jest.fn(),
    };
});

jest.mock('expo-linking', () => ({
    parse: (value: string) => {
        const match = value.match(/^([a-z-]+):\/\/([^?]+)(?:\?ticket=(.*))?$/i);
        return {
            scheme: match?.[1],
            hostname: match?.[2],
            queryParams: match?.[3] ? { ticket: match[3] } : {},
        };
    },
}));

jest.mock('expo-router', () => ({
    useRouter: () => mockRouter,
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('../../theme', () => ({
    useTheme: () => ({
        accent: '#0896af',
        background: '#121212',
        text: '#ffffff',
        textSecondary: '#aaaaaa',
    }),
}));

describe('PairingQrScannerScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useCameraPermissions as jest.Mock).mockReturnValue([
            { granted: true, canAskAgain: true },
            jest.fn(),
        ]);
    });

    it('routes a Beta Player pairing ticket to the pairing screen', () => {
        const { getByTestId } = render(<PairingQrScannerScreen />);

        fireEvent(getByTestId('camera-view'), 'barcodeScanned', {
            data: 'beta-app://pair?ticket=encoded-ticket',
        });

        expect(mockRouter.replace).toHaveBeenCalledWith({
            pathname: '/pair',
            params: { ticket: 'encoded-ticket' },
        });
    });

    it('shows an error and can resume scanning for an unrelated QR code', () => {
        const { getByTestId, getByText } = render(<PairingQrScannerScreen />);

        fireEvent(getByTestId('camera-view'), 'barcodeScanned', {
            data: 'https://example.com/qr',
        });

        expect(getByText('This QR code is not a Beta Player pairing code.')).toBeTruthy();
        fireEvent.press(getByText('Try again'));
        expect(getByText('Point your camera at the QR code in desktop Settings.')).toBeTruthy();
        expect(mockRouter.replace).not.toHaveBeenCalled();
    });
});
