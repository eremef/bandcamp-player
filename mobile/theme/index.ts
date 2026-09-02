import { useStore } from '../store';
import { useColorScheme } from 'react-native';

export const Colors = {
    dark: {
        background: '#121212',
        card: '#1a1a1a',
        text: '#ffffff',
        textSecondary: '#888888',
        accent: '#0896af',
        border: '#333333',
        input: '#1e1e1e',
        highlight: '#102a30',
        header: '#1a1a1a',
        error: '#ff4444',
    },
    light: {
        background: '#ffffff',
        card: '#f5f5f5',
        text: '#1a1a1a',
        textSecondary: '#666666',
        accent: '#0d7a99',
        border: '#dddddd',
        input: '#f0f0f0',
        highlight: '#dbebf0',
        header: '#ffffff',
        error: '#d32f2f',
    },
    'high-contrast': {
        background: '#000000',
        card: '#000000',
        text: '#ffffff',
        textSecondary: '#ffff00',
        accent: '#00ffff',
        border: '#ffffff',
        input: '#000000',
        highlight: '#004444',
        header: '#000000',
        error: '#ff0000',
    },
};

export type ColorTheme = typeof Colors.dark;

export function useTheme(): ColorTheme {
    const themePreference = useStore((state) => state.theme);
    const systemColorScheme = useColorScheme();

    if (themePreference === 'system') {
        return systemColorScheme === 'light' ? Colors.light : Colors.dark;
    }

    if (themePreference === 'high-contrast') {
        return Colors['high-contrast'];
    }

    return themePreference === 'light' ? Colors.light : Colors.dark;
}
