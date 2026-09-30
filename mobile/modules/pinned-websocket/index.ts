import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export interface PinnedWebSocketModuleType {
    connect(url: string, caFingerprint: string | null): Promise<boolean>;
    send(data: string): boolean;
    close(): void;
    addListener(eventName: 'onOpen', listener: () => void): EventSubscription;
    addListener(eventName: 'onMessage', listener: (event: { data: string }) => void): EventSubscription;
    addListener(eventName: 'onClose', listener: (event: { code: number; reason: string }) => void): EventSubscription;
    addListener(eventName: 'onError', listener: (event: { message: string }) => void): EventSubscription;
}

export const PinnedWebSocket = requireOptionalNativeModule<PinnedWebSocketModuleType>('PinnedWebSocket');
export const pinnedWebSocketEmitter = PinnedWebSocket;
