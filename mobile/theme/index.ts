import { useStore } from '../store';
import { useColorScheme } from 'react-native';

export const Colors = {
    dark: {
        background: '#121212',
        card: '#1a1a1a',
        text: '#ffffff',
        textSecondary: '#888888',
        accent: '#0896afff',
        border: '#333333',
        input: '#1e1e1e',
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
        header: '#ffffff',
        error: '#d32f2f',
    },
};

export type ColorTheme = typeof Colors.dark;

export function useTheme(): ColorTheme {
    const themePreference = useStore((state) => state.theme);
    const systemColorScheme = useColorScheme();

    if (themePreference === 'system') {
        return systemColorScheme === 'light' ? Colors.light : Colors.dark;
    }

    return themePreference === 'light' ? Colors.light : Colors.dark;
}
