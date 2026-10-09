/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants } from 'fs';
import * as path from 'path';
import { RemoteTlsService } from './remote-tls.service';

const state = vi.hoisted(() => ({
    files: new Map<string, { contents: Buffer; mode: number; uid: number }>(),
    backend: 'basic_text',
    encryptionAvailable: true,
    encryptedWrites: 0,
    decryptedReads: 0,
    weakProvider: false,
}));

vi.mock('electron', () => ({
    app: { getPath: () => '/test-user-data' },
    safeStorage: {
        getSelectedStorageBackend: vi.fn(() => state.backend),
        isAsyncEncryptionAvailable: vi.fn(async () => state.encryptionAvailable),
        encryptStringAsync: vi.fn(async (value: string) => {
            state.encryptedWrites++;
            return Buffer.from(`${state.weakProvider ? 'v10' : 'encrypted:'}${value}`);
        }),
        decryptStringAsync: vi.fn(async (value: Buffer) => {
            state.decryptedReads++;
            return { result: value.toString().slice('encrypted:'.length), shouldReEncrypt: false };
        }),
    },
}));

vi.mock('fs/promises', () => {
    const missing = () => Object.assign(new Error('Missing file'), { code: 'ENOENT' });
    return {
        lstat: vi.fn(async (filePath: string) => {
            if (!state.files.has(filePath)) throw missing();
            return {};
        }),
        open: vi.fn(async (filePath: string, flags: number, mode = 0o600) => {
            const create = (flags & constants.O_CREAT) !== 0;
            if (create) {
                if (state.files.has(filePath)) throw Object.assign(new Error('File exists'), { code: 'EEXIST' });
                state.files.set(filePath, { contents: Buffer.alloc(0), mode, uid: 1234 });
            }
            if (!state.files.has(filePath)) throw missing();
            return {
                stat: async () => ({
                    isFile: () => true,
                    mode: state.files.get(filePath)!.mode,
                    uid: state.files.get(filePath)!.uid,
                }),
                readFile: async () => state.files.get(filePath)!.contents.toString(),
                writeFile: async (value: string) => {
                    state.files.get(filePath)!.contents = Buffer.from(value);
                },
                sync: async () => undefined,
                close: async () => undefined,
            };
        }),
        readFile: vi.fn(async (filePath: string) => {
            const file = state.files.get(filePath);
            if (!file) throw missing();
            return file.contents;
        }),
        writeFile: vi.fn(async (filePath: string, contents: Buffer) => {
            state.files.set(filePath, { contents, mode: 0o600, uid: 1234 });
        }),
        mkdir: vi.fn(async () => undefined),
        link: vi.fn(async (source: string, destination: string) => {
            if (state.files.has(destination)) throw Object.assign(new Error('File exists'), { code: 'EEXIST' });
            state.files.set(destination, state.files.get(source)!);
        }),
        unlink: vi.fn(async (filePath: string) => {
            state.files.delete(filePath);
        }),
    };
});

const privatePath = path.join('/test-user-data', 'remote-pairing-authority.private.json');
const encryptedPath = path.join('/test-user-data', 'remote-pairing-authority.enc');
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
const getuidDescriptor = Object.getOwnPropertyDescriptor(process, 'getuid');

const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { configurable: true, value: platform });
    Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1234 });
};

describe('RemoteTlsService identity storage', () => {
    beforeEach(() => {
        state.files.clear();
        state.backend = 'basic_text';
        state.encryptionAvailable = true;
        state.encryptedWrites = 0;
        state.decryptedReads = 0;
        state.weakProvider = false;
        setPlatform('linux');
    });

    afterEach(() => {
        Object.defineProperty(process, 'platform', platformDescriptor);
        if (getuidDescriptor) Object.defineProperty(process, 'getuid', getuidDescriptor);
        else Reflect.deleteProperty(process, 'getuid');
    });

    it('persists one Linux identity in a private file when no keyring is available', async () => {
        const first = await new RemoteTlsService().getMaterial();
        const second = await new RemoteTlsService().getMaterial();

        expect(first.caFingerprint).toBe(second.caFingerprint);
        expect(state.files.get(privatePath)?.mode).toBe(0o600);
        expect(state.files.get(privatePath)?.contents.toString()).toContain('PRIVATE KEY');
        expect(state.files.has(encryptedPath)).toBe(false);
        expect(state.encryptedWrites).toBe(0);
    });

    it('uses protected storage when Linux has a keyring', async () => {
        state.backend = 'gnome_libsecret';
        const first = await new RemoteTlsService().getMaterial();
        const second = await new RemoteTlsService().getMaterial();

        expect(first.caFingerprint).toBe(second.caFingerprint);
        expect(state.files.has(encryptedPath)).toBe(true);
        expect(state.files.has(privatePath)).toBe(false);
        expect(state.encryptedWrites).toBe(1);
        expect(state.decryptedReads).toBe(1);
    });

    it('uses a private file when the Linux async encryptor falls back to a fixed key', async () => {
        state.backend = 'gnome_libsecret';
        state.weakProvider = true;

        await new RemoteTlsService().getMaterial();

        expect(state.files.has(privatePath)).toBe(true);
        expect(state.files.has(encryptedPath)).toBe(false);
    });

    it('keeps a private identity when a Linux keyring later becomes available', async () => {
        const first = await new RemoteTlsService().getMaterial();
        state.backend = 'gnome_libsecret';
        const second = await new RemoteTlsService().getMaterial();

        expect(first.caFingerprint).toBe(second.caFingerprint);
        expect(state.files.has(encryptedPath)).toBe(false);
    });

    it('does not replace an encrypted identity when its Linux keyring is unavailable', async () => {
        state.files.set(encryptedPath, { contents: Buffer.from('encrypted:identity'), mode: 0o600, uid: 1234 });

        await expect(new RemoteTlsService().getMaterial()).rejects.toThrow('Restore the keyring');
        expect(state.files.has(privatePath)).toBe(false);
    });

    it('rejects a private identity accessible to other Linux accounts', async () => {
        await new RemoteTlsService().getMaterial();
        state.files.get(privatePath)!.mode = 0o644;

        await expect(new RemoteTlsService().getMaterial()).rejects.toThrow('must be owned by your account');
    });

    it('uses Keychain-backed storage on macOS without querying Linux backend selection', async () => {
        setPlatform('darwin');
        const first = await new RemoteTlsService().getMaterial();
        const second = await new RemoteTlsService().getMaterial();

        expect(first.caFingerprint).toBe(second.caFingerprint);
        expect(state.files.has(encryptedPath)).toBe(true);
        expect(state.files.has(privatePath)).toBe(false);
        expect(state.encryptedWrites).toBe(1);
        expect(state.decryptedReads).toBe(1);
    });

    it('keeps the Windows protected-storage path', async () => {
        setPlatform('win32');
        const first = await new RemoteTlsService().getMaterial();
        const second = await new RemoteTlsService().getMaterial();

        expect(first.caFingerprint).toBe(second.caFingerprint);
        expect(state.files.has(encryptedPath)).toBe(true);
        expect(state.files.has(privatePath)).toBe(false);
        expect(state.encryptedWrites).toBe(1);
    });
});
