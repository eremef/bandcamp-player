import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const autostartFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'xyz.eremef.beta.app.desktop');

export function getAutostart(): boolean {
    if (!app.isPackaged) return false;
    if (process.platform === 'win32' || process.platform === 'darwin') {
        return app.getLoginItemSettings().openAtLogin;
    }
    if (process.platform === 'linux') {
        try {
            const entry = fs.readFileSync(autostartFile(), 'utf8');
            return !/^Hidden\s*=\s*true\s*$/im.test(entry) && !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(entry);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
            throw error;
        }
    }
    return false;
}

export function setAutostart(enabled: boolean): void {
    if (!app.isPackaged) throw new Error('Start at login is available in the installed application.');
    if (process.platform === 'win32' || process.platform === 'darwin') {
        app.setLoginItemSettings({ openAtLogin: enabled });
        return;
    }
    if (process.platform !== 'linux') throw new Error('Start at login is not supported on this platform.');
    const file = autostartFile();
    if (!enabled) {
        fs.rmSync(file, { force: true });
        return;
    }
    const executable = process.env.APPIMAGE || process.execPath;
    const escaped = executable.replace(/%/g, '%%').replace(/[\\"`$]/g, '\\$&');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Beta Player\nExec="${escaped}"\nX-GNOME-Autostart-enabled=true\n`);
}
