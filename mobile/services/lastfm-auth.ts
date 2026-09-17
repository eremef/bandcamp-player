export const LASTFM_CALLBACK_URL = 'http://localhost:26505/lastfm-callback';

export function isLastfmCallbackUrl(value: string): boolean {
    try {
        const expected = new URL(LASTFM_CALLBACK_URL);
        const actual = new URL(value);
        return actual.protocol === expected.protocol
            && actual.hostname === expected.hostname
            && actual.port === expected.port
            && actual.pathname === expected.pathname;
    } catch {
        return false;
    }
}
