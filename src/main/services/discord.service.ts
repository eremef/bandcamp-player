import { Client } from "discord-rpc";
import { EventEmitter } from "events";
import type { PlayerState, AppSettings } from "../../shared/types";
import { PlayerService } from "./player.service";
import { Database } from "../database/database";

// Define our own type since discord-rpc types might be incomplete
export interface Presence {
    details?: string;
    state?: string;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    startTimestamp?: number | Date;
    endTimestamp?: number | Date;
    partyId?: string;
    partySize?: number;
    partyMax?: number;
    matchSecret?: string;
    joinSecret?: string;
    spectateSecret?: string;
    instance?: boolean;
}

export class DiscordService extends EventEmitter {
    private client: Client | null = null;
    private readonly clientId = "1517510459375222855";
    private readonly fallbackImageKey = "icon";
    private isConnected = false;
    private isEnabled = false;

    private lastState: PlayerState | null = null;
    private updateDebounceTimeout: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    constructor(
        private playerService: PlayerService,
        private db: Database
    ) {
        super();
        this.loadSettings();

        // Listen for setting changes to enable/disable RPC
        this.playerService.on("settings-changed", (settings: Partial<AppSettings>) => {
            if (settings.discordRpcEnabled !== undefined) {
                if (settings.discordRpcEnabled && !this.isEnabled) {
                    this.enable();
                } else if (!settings.discordRpcEnabled && this.isEnabled) {
                    this.disable();
                }
            }
        });

        // Listen for player state changes
        this.playerService.on("state-changed", (state: PlayerState) => {
            this.handlePlayerStateChanged(state);
        });

        // Auto-connect if enabled
        if (this.isEnabled) {
            this.connect();
        }
    }

    private loadSettings() {
        const settings = this.db.getSettings();
        if (settings) {
            this.isEnabled = settings.discordRpcEnabled || false;
        }
    }

    private enable() {
        console.log("[DiscordService] Enabling Discord RPC");
        this.isEnabled = true;
        this.connect();
    }

    private disable() {
        console.log("[DiscordService] Disabling Discord RPC");
        this.isEnabled = false;
        this.disconnect();
    }

    private async connect() {
        if (!this.isEnabled || this.isConnected || this.client) return;

        try {
            this.client = new Client({ transport: "ipc" });

            this.client.on("ready", () => {
                console.log("[DiscordService] Connected to Discord RPC");
                this.isConnected = true;
                
                // Set initial presence if we have state
                if (this.lastState) {
                    this.updatePresence(this.lastState);
                }
            });

            this.client.on("disconnected", () => {
                console.log("[DiscordService] Disconnected from Discord RPC");
                this.handleDisconnect();
            });

            await this.client.login({ clientId: this.clientId });
        } catch (err) {
            console.error("[DiscordService] Failed to connect to Discord RPC:", err);
            this.handleDisconnect();
        }
    }

    private handleDisconnect() {
        this.isConnected = false;
        if (this.client) {
            try {
                this.client.destroy();
            } catch (e) {
                // Ignore errors during destroy
            }
            this.client = null;
        }

        // Try to reconnect if still enabled
        if (this.isEnabled) {
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            this.reconnectTimeout = setTimeout(() => {
                this.connect();
            }, 15000); // 15 seconds reconnect delay
        }
    }

    private disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
            this.updateDebounceTimeout = null;
        }

        if (this.client) {
            try {
                this.client.clearActivity();
                this.client.destroy();
            } catch (e) {
                console.error("[DiscordService] Error disconnecting:", e);
            }
            this.client = null;
            this.isConnected = false;
        }
    }

    private handlePlayerStateChanged(state: PlayerState) {
        this.lastState = state;
        
        if (!this.isEnabled || !this.isConnected) return;

        // Debounce updates to avoid hitting rate limits
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
        }

        this.updateDebounceTimeout = setTimeout(() => {
            this.updatePresence(state);
        }, 1000); // 1 second debounce
    }

    private async updatePresence(state: PlayerState) {
        if (!this.client || !this.isConnected) return;

        try {
            if (!state.currentTrack) {
                // Not playing anything, clear presence or show idle
                await this.client.clearActivity();
                return;
            }

            const track = state.currentTrack;
            const presence: Presence = {
                details: track.title,
                state: `by ${track.artist}`,
                largeImageKey: track.artworkUrl || this.fallbackImageKey,
                largeImageText: track.album || track.title,
                smallImageKey: this.fallbackImageKey,
                smallImageText: "Beta Player",
            };

            // Only show time if playing
            if (state.isPlaying && track.duration > 0) {
                const now = Date.now();
                const remainingSecs = track.duration - state.currentTime;
                presence.endTimestamp = now + (remainingSecs * 1000);
            } else if (!state.isPlaying) {
                presence.smallImageText = "Paused";
            }

            // Using setActivity and ignoring potential type errors with 'any' cast
            // since the presence type in the library might be strict/outdated
            await (this.client as any).setActivity(presence);
        } catch (err) {
            console.error("[DiscordService] Failed to update presence:", err);
        }
    }
}
