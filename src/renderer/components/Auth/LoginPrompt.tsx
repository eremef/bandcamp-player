import { useStore } from '../../store/store';
import styles from './LoginPrompt.module.css';

export function LoginPrompt() {
    const { login } = useStore();

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                {/* Logo/Branding */}
                <div className={styles.branding}>
                    <div className={styles.logo}>
                        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                            <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" />
                            <circle cx="32" cy="32" r="12" fill="currentColor" />
                            <path
                                d="M32 8 L32 20 M32 44 L32 56 M8 32 L20 32 M44 32 L56 32"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                    <h1 className={styles.title}>Bandcamp Player</h1>
                    <p className={styles.subtitle}>
                        Your personal music collection, offline-ready
                    </p>
                </div>

                {/* Features */}
                <div className={styles.features}>
                    <div className={styles.feature}>
                        <span className={styles.featureIcon}>🎵</span>
                        <span>Play your purchased music</span>
                    </div>
                    <div className={styles.feature}>
                        <span className={styles.featureIcon}>📥</span>
                        <span>Offline caching</span>
                    </div>
                    <div className={styles.feature}>
                        <span className={styles.featureIcon}>📻</span>
                        <span>Bandcamp Radio</span>
                    </div>
                    <div className={styles.feature}>
                        <span className={styles.featureIcon}>🎧</span>
                        <span>Last.fm scrobbling</span>
                    </div>
                </div>

                {/* Login Button */}
                <button className={styles.loginButton} onClick={login}>
                    <span>Login with Bandcamp</span>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                            d="M4 10h12M12 6l4 4-4 4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>

                <p className={styles.note}>
                    You&apos;ll be redirected to Bandcamp to sign in securely
                </p>
            </div>

            {/* Background decoration */}
            <div className={styles.bgDecoration}>
                <div className={styles.circle1} />
                <div className={styles.circle2} />
                <div className={styles.circle3} />
            </div>
        </div>
    );
}
