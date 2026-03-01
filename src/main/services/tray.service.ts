import { Tray, Menu, nativeImage, BrowserWindow, NativeImage } from 'electron';
import * as path from 'path';
import { PlayerService } from './player.service';

// ============================================================================
// System Tray Service
// ============================================================================

export class TrayService {
    private tray: Tray;
    private mainWindow: BrowserWindow;
    private playerService: PlayerService;
    private showWindowCallback: () => void;
    private quitCallback: () => void;
    private isDev: boolean;

    constructor(
        mainWindow: BrowserWindow,
        playerService: PlayerService,
        showWindowCallback: () => void,
        quitCallback: () => void,
        isDev: boolean = false
    ) {
        this.mainWindow = mainWindow;
        this.playerService = playerService;
        this.showWindowCallback = showWindowCallback;
        this.quitCallback = quitCallback;
        this.isDev = isDev;

        // Create tray icon
        // Try png first (generated), then ico
        const iconPath = path.join(__dirname, '../../assets/icons/tray.png');
        let icon: NativeImage;

        try {
            icon = nativeImage.createFromPath(iconPath);
        } catch {
            // Fallback to empty icon if file doesn't exist
            icon = nativeImage.createEmpty();
        }

        this.tray = new Tray(icon);
        this.tray.setToolTip('Beta Player');

        // Set up context menu
        this.updateContextMenu();

        // Double-click to show window
        this.tray.on('double-click', () => {
            this.showWindowCallback();
        });

        // Listen to player state changes
        this.playerService.on('state-changed', () => {
            this.updateContextMenu();
        });

        this.playerService.on('track-changed', () => {
            this.updateContextMenu();
            this.updateTooltip();
        });
    }

    /**
     * Update the tray context menu
     */
    private updateContextMenu(): void {
        const playerState = this.playerService.getState();
        const isPlaying = playerState.isPlaying;
        const hasTrack = playerState.currentTrack !== null;

        const template: any[] = [
            {
                label: playerState.currentTrack
                    ? `${playerState.currentTrack.title} - ${playerState.currentTrack.artist}`
                    : 'Beta Player',
                enabled: false,
            },
            { type: 'separator' },
            {
                label: isPlaying ? 'Pause' : 'Play',
                enabled: hasTrack,
                click: () => {
                    this.playerService.togglePlay();
                },
            },
            {
                label: 'Next',
                enabled: hasTrack,
                click: () => {
                    this.playerService.next();
                },
            },
            {
                label: 'Previous',
                enabled: hasTrack,
                click: () => {
                    this.playerService.previous();
                },
            },
            { type: 'separator' },
            {
                label: 'Show Window',
                click: () => {
                    this.showWindowCallback();
                },
            },
            { type: 'separator' },
        ];

        if (this.isDev) {
            template.push({
                label: 'Toggle DevTools',
                click: () => {
                    if (this.mainWindow.webContents.isDevToolsOpened()) {
                        this.mainWindow.webContents.closeDevTools();
                    } else {
                        this.mainWindow.webContents.openDevTools();
                    }
                },
            });
            template.push({ type: 'separator' });
        }

        template.push({
            label: 'Quit',
            click: () => {
                this.quitCallback();
            },
        });

        const contextMenu = Menu.buildFromTemplate(template);
        this.tray.setContextMenu(contextMenu);
    }

    /**
     * Update tray tooltip with current track info
     */
    private updateTooltip(): void {
        const playerState = this.playerService.getState();
        if (playerState.currentTrack) {
            this.tray.setToolTip(
                `${playerState.currentTrack.title}\n${playerState.currentTrack.artist}`
            );
        } else {
            this.tray.setToolTip('Beta Player');
        }
    }

    /**
     * Destroy the tray icon
     */
    destroy(): void {
        this.tray.destroy();
    }
}
