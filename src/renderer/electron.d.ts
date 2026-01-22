import type { ElectronAPI } from '../main/preload';

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

export { };
