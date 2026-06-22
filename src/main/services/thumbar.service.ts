import { BrowserWindow, nativeImage, app } from 'electron';
import * as path from 'path';
import type { PlayerService } from './player.service';

export class ThumbarService {
    private mainWindow: BrowserWindow;
    private playerService: PlayerService;
    private icons: Record<string, Electron.NativeImage>;

    constructor(mainWindow: BrowserWindow, playerService: PlayerService) {
        this.mainWindow = mainWindow;
        this.playerService = playerService;

        // In dev, use src/assets to avoid needing a build step for assets.
        // In prod, use dist/assets (where they are copied).
        const iconPath = app.isPackaged
            ? path.join(__dirname, '../../assets/icons/thumbar') // dist/main/services -> dist/assets
            : path.join(__dirname, '../../../src/assets/icons/thumbar'); // dist/main/services -> src/assets
        
        this.icons = {
            play: nativeImage.createFromPath(path.join(iconPath, 'play.png')),
            pause: nativeImage.createFromPath(path.join(iconPath, 'pause.png')),
            prev: nativeImage.createFromPath(path.join(iconPath, 'skip-back.png')),
            next: nativeImage.createFromPath(path.join(iconPath, 'skip-forward.png'))
        };

        // Listen to player state
        this.playerService.on('state-changed', (state) => {
            this.updateThumbar(state.isPlaying);
        });

        // Listen to window show event to setup thumbar (Windows API requires window to be shown)
        this.mainWindow.on('show', () => {
            this.updateThumbar(this.playerService.getState().isPlaying);
        });

        // Try initial setup (might fail if window is not yet shown, which is fine)
        if (this.mainWindow.isVisible()) {
            this.updateThumbar(false);
        }
    }

    private updateThumbar(isPlaying: boolean) {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

        // Thumbar only works on Windows
        if (process.platform !== 'win32') return;

        this.mainWindow.setThumbarButtons([
            {
                tooltip: 'Previous',
                icon: this.icons.prev,
                click: () => this.playerService.previous()
            },
            {
                tooltip: isPlaying ? 'Pause' : 'Play',
                icon: isPlaying ? this.icons.pause : this.icons.play,
                click: () => this.playerService.togglePlay()
            },
            {
                tooltip: 'Next',
                icon: this.icons.next,
                click: () => this.playerService.next()
            }
        ]);
    }
}
