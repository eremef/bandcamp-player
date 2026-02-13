import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Electron
vi.mock('electron', () => ({
    ipcRenderer: {
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn(),
        listeners: vi.fn(() => []),
    },
    shell: {
        openExternal: vi.fn(),
    },
}));

// Mock window.api (context bridge)
if (typeof window !== 'undefined') {
    (window as any).api = {
        send: vi.fn(),
        receive: vi.fn(),
        invoke: vi.fn(),
        removeListener: vi.fn(),
    };
}
