import { BrowserWindow, nativeImage } from 'electron';
import * as path from 'path';
import type { PlayerService } from './player.service';

export class ThumbarService {
    private mainWindow: BrowserWindow;
    private playerService: PlayerService;
    private icons: Record<string, Electron.NativeImage>;

    constructor(mainWindow: BrowserWindow, playerService: PlayerService) {
        this.mainWindow = mainWindow;
        this.playerService = playerService;

        // Load icons
        const isPackaged = process.defaultApp ? false : true;
        
        // In both dev and prod, the main process runs from dist/main or app.asar/dist/main
        // So __dirname is dist/main/services
        const iconPath = path.join(__dirname, '../../assets/icons/thumbar');
        
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

        // Initial setup
        this.updateThumbar(false);
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
