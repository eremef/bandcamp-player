const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REMOTE_PAIRING_TICKET_PREFIX = 'BP1-';
const PAIRING_CODE_BYTES = 18;
const CERTIFICATE_FINGERPRINT_BYTES = 32;
const REMOTE_PAIRING_TICKET_BYTES = 4 + 2 + PAIRING_CODE_BYTES + CERTIFICATE_FINGERPRINT_BYTES;

export interface RemotePairingTicket {
    host: string;
    port: number;
    code: string;
    caFingerprint: string;
}

export function createRemotePairingTicket(ticket: RemotePairingTicket): string | null {
    const hostBytes = parseLanIpv4(ticket.host);
    const codeBytes = decodeBase64Url(ticket.code);
    const fingerprint = ticket.caFingerprint.replace(/:/g, '');

    if (
        !hostBytes ||
        !Number.isInteger(ticket.port) || ticket.port < 1 || ticket.port > 65535 ||
        !codeBytes || codeBytes.length !== PAIRING_CODE_BYTES ||
        !/^[a-fA-F0-9]{64}$/.test(fingerprint)
    ) return null;

    const bytes = new Uint8Array(REMOTE_PAIRING_TICKET_BYTES);
    bytes.set(hostBytes, 0);
    bytes[4] = ticket.port >>> 8;
    bytes[5] = ticket.port & 0xff;
    bytes.set(codeBytes, 6);

    for (let index = 0; index < CERTIFICATE_FINGERPRINT_BYTES; index += 1) {
        bytes[6 + PAIRING_CODE_BYTES + index] = Number.parseInt(fingerprint.slice(index * 2, index * 2 + 2), 16);
    }

    return `${REMOTE_PAIRING_TICKET_PREFIX}${encodeBase64Url(bytes)}`;
}

export function parseRemotePairingTicket(value: string): RemotePairingTicket | null {
    const normalized = value.trim().replace(/\s+/g, '');
    if (!normalized.startsWith(REMOTE_PAIRING_TICKET_PREFIX)) return null;

    const bytes = decodeBase64Url(normalized.slice(REMOTE_PAIRING_TICKET_PREFIX.length));
    if (!bytes || bytes.length !== REMOTE_PAIRING_TICKET_BYTES) return null;

    const host = Array.from(bytes.slice(0, 4)).join('.');
    const port = (bytes[4] << 8) | bytes[5];
    if (!parseLanIpv4(host) || port < 1) return null;

    const code = encodeBase64Url(bytes.slice(6, 6 + PAIRING_CODE_BYTES));
    const caFingerprint = Array.from(bytes.slice(6 + PAIRING_CODE_BYTES))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');

    return { host, port, code, caFingerprint };
}

export function isLanIpv4(value: string): boolean {
    return parseLanIpv4(value) !== null;
}

function parseLanIpv4(value: string): Uint8Array | null {
    const parts = value.split('.');
    if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part))) return null;

    const octets = parts.map(Number);
    if (octets.some((octet) => octet > 255)) return null;

    const isLanAddress = octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 169 && octets[1] === 254);

    return isLanAddress ? Uint8Array.from(octets) : null;
}

function encodeBase64Url(bytes: Uint8Array): string {
    let result = '';

    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index];
        const second = bytes[index + 1];
        const third = bytes[index + 2];

        result += BASE64URL_ALPHABET[first >> 2];
        result += BASE64URL_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
        if (second !== undefined) result += BASE64URL_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
        if (third !== undefined) result += BASE64URL_ALPHABET[third & 0x3f];
    }

    return result;
}

function decodeBase64Url(value: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;

    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;

    for (const character of value) {
        const digit = BASE64URL_ALPHABET.indexOf(character);
        if (digit < 0) return null;

        buffer = (buffer << 6) | digit;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }

    if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) return null;
    return Uint8Array.from(bytes);
}
