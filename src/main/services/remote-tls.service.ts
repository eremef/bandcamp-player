import { app, safeStorage } from "electron";
import * as crypto from "crypto";
import { constants } from "fs";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import selfsigned from "selfsigned";

export interface RemoteTlsMaterial {
  key: string;
  cert: string;
  caCertificate: string;
  caFingerprint: string;
}

interface StoredAuthority {
  key: string;
  certificate: string;
}

const AUTHORITY_FILE = "remote-pairing-authority.enc";
const PRIVATE_AUTHORITY_FILE = "remote-pairing-authority.private.json";
const PRIVATE_FILE_PERMISSION_ERROR = 'The Linux remote identity file must be owned by your account and accessible only to it.';

export class RemoteTlsService {
  private authority: StoredAuthority | null = null;

  async getMaterial(): Promise<RemoteTlsMaterial> {
    const privateAuthorityPath = path.join(app.getPath("userData"), PRIVATE_AUTHORITY_FILE);
    const hasPrivateAuthority = process.platform === 'linux' && await this.fileExists(privateAuthorityPath);
    const usePrivateFile = process.platform === 'linux' &&
      (hasPrivateAuthority || safeStorage.getSelectedStorageBackend() === 'basic_text');
    if (!usePrivateFile && !(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error(
        "Safe remote connections need desktop key storage, which is unavailable on this system. Enable Unsafe mode only if you accept unencrypted LAN traffic.",
      );
    }

    const authority = await this.loadAuthority(usePrivateFile, privateAuthorityPath);
    const names = this.getCertificateNames();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 2);
    const leaf = await selfsigned.generate(
      [{ name: "commonName", value: "Beta Player Remote" }],
      {
        keyType: "ec",
        curve: "P-256",
        algorithm: "sha256",
        notBeforeDate: new Date(now.getTime() - 5 * 60 * 1000),
        notAfterDate: expiresAt,
        ca: { key: authority.key, cert: authority.certificate },
        extensions: [
          { name: "basicConstraints", cA: false, critical: true },
          {
            name: "keyUsage",
            digitalSignature: true,
            keyEncipherment: true,
            critical: true,
          },
          { name: "extKeyUsage", serverAuth: true, critical: true },
          { name: "subjectAltName", altNames: names, critical: true },
        ],
      },
    );

    const authorityCert = new crypto.X509Certificate(authority.certificate);
    const caFingerprint = crypto
      .createHash("sha256")
      .update(authorityCert.raw)
      .digest("hex");

    return {
      key: leaf.private,
      cert: `${leaf.cert.trim()}\n${authority.certificate.trim()}\n`,
      caCertificate: authority.certificate,
      caFingerprint,
    };
  }

  getCaCertificate(): string | null {
    return this.authority?.certificate ?? null;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.lstat(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async readPrivateAuthority(filePath: string): Promise<StoredAuthority> {
    const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stats = await file.stat();
      if (!stats.isFile() || stats.uid !== process.getuid?.() || (stats.mode & 0o077) !== 0) {
        throw new Error(PRIVATE_FILE_PERMISSION_ERROR);
      }
      return JSON.parse(await file.readFile('utf8')) as StoredAuthority;
    } finally {
      await file.close();
    }
  }

  private async writePrivateAuthority(filePath: string, authority: StoredAuthority): Promise<void> {
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    const file = await fs.open(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      try {
        await file.writeFile(JSON.stringify(authority));
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.link(temporaryPath, filePath);
    } finally {
      await fs.unlink(temporaryPath);
    }
  }

  private async loadAuthority(usePrivateFile: boolean, privateAuthorityPath: string): Promise<StoredAuthority> {
    if (this.authority) return this.authority;

    const authorityPath = path.join(app.getPath("userData"), AUTHORITY_FILE);
    try {
      const stored = usePrivateFile
        ? await this.readPrivateAuthority(privateAuthorityPath)
        : JSON.parse((await safeStorage.decryptStringAsync(await fs.readFile(authorityPath))).result) as StoredAuthority;
      new crypto.X509Certificate(stored.certificate);
      crypto.createPrivateKey(stored.key);
      this.authority = stored;
      return stored;
    } catch (error) {
      if (usePrivateFile && error instanceof Error && error.message === PRIVATE_FILE_PERMISSION_ERROR) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("The saved remote security identity could not be read.", {
          cause: error,
        });
      }
    }

    if (usePrivateFile && await this.fileExists(authorityPath)) {
      throw new Error('The saved remote identity needs its Linux keyring. Restore the keyring to keep existing device pairings.');
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 10);
    const generated = await selfsigned.generate(
      [{ name: "commonName", value: "Beta Player Remote Pairing Authority" }],
      {
        keyType: "ec",
        curve: "P-256",
        algorithm: "sha256",
        notBeforeDate: new Date(now.getTime() - 5 * 60 * 1000),
        notAfterDate: expiresAt,
        extensions: [
          {
            name: "basicConstraints",
            cA: true,
            pathLenConstraint: 0,
            critical: true,
          },
          {
            name: "keyUsage",
            keyCertSign: true,
            cRLSign: true,
            critical: true,
          },
        ],
      },
    );
    const authority = { key: generated.private, certificate: generated.cert };
    await fs.mkdir(path.dirname(authorityPath), { recursive: true, mode: 0o700 });
    if (usePrivateFile) {
      await this.writePrivateAuthority(privateAuthorityPath, authority);
    } else {
      const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(authority));
      if (process.platform === 'linux' && encrypted.subarray(0, 3).toString() === 'v10') {
        await this.writePrivateAuthority(privateAuthorityPath, authority);
      } else {
        await fs.writeFile(authorityPath, encrypted, { mode: 0o600, flag: 'wx' });
      }
    }
    this.authority = authority;
    return authority;
  }

  private getCertificateNames(): Array<{ type: 2 | 7; value?: string; ip?: string }> {
    const names: Array<{ type: 2 | 7; value?: string; ip?: string }> = [
      { type: 2, value: "localhost" },
      { type: 7, ip: "127.0.0.1" },
      { type: 7, ip: "::1" },
    ];
    const addresses = new Set<string>();

    for (const entries of Object.values(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === "IPv4" && !entry.internal && this.isPrivateIpv4(entry.address)) {
                addresses.add(entry.address);
            }
        }
    }

    for (const address of addresses) names.push({ type: 7, ip: address });
    return names;
  }

  private isPrivateIpv4(address: string): boolean {
    const octets = address.split(".").map(Number);
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    return octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254);
  }
}
