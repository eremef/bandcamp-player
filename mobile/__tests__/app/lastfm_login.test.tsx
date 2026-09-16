import { isLastfmCallbackUrl } from '../../services/lastfm-auth';

describe('LastfmLoginScreen callback validation', () => {
    it('accepts only the configured callback origin and path', () => {
        expect(isLastfmCallbackUrl('http://localhost:26505/lastfm-callback?token=abc')).toBe(true);
        expect(isLastfmCallbackUrl('http://localhost:26505/lastfm-callback-extra?token=abc')).toBe(false);
        expect(isLastfmCallbackUrl('http://localhost.evil.test:26505/lastfm-callback?token=abc')).toBe(false);
        expect(isLastfmCallbackUrl('https://localhost:26505/lastfm-callback?token=abc')).toBe(false);
    });
});
