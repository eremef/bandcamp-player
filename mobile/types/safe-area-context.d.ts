declare module 'react-native-safe-area-context' {
    import * as React from 'react';
    import { ViewProps } from 'react-native';

    export interface EdgeInsets {
        top: number;
        right: number;
        bottom: number;
        left: number;
    }

    export interface SafeAreaInsetsContext {
        top: number;
        right: number;
        bottom: number;
        left: number;
    }

    export const SafeAreaContext: React.Context<SafeAreaInsetsContext | null>;
    export const SafeAreaProvider: React.ComponentType<ViewProps & { initialMetrics?: any }>;
    export const SafeAreaView: React.ComponentType<ViewProps & { edges?: ('top' | 'right' | 'bottom' | 'left')[]; mode?: 'padding' | 'margin' }>;

    export function useSafeAreaInsets(): EdgeInsets;
}
