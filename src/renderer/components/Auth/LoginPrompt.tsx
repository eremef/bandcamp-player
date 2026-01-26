import { useStore } from '../../store/store';
import { Music, Download, Radio, Headphones, ArrowRight } from 'lucide-react';
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
                        <Music className={styles.featureIcon} size={20} />
                        <span>Play your purchased music</span>
                    </div>
                    <div className={styles.feature}>
                        <Download className={styles.featureIcon} size={20} />
                        <span>Offline caching</span>
                    </div>
                    <div className={styles.feature}>
                        <Radio className={styles.featureIcon} size={20} />
                        <span>Bandcamp Radio</span>
                    </div>
                    <div className={styles.feature}>
                        <Headphones className={styles.featureIcon} size={20} />
                        <span>Last.fm scrobbling</span>
                    </div>
                </div>

                {/* Login Button */}
                <button className={styles.loginButton} onClick={login}>
                    <span>Login with Bandcamp</span>
                    <ArrowRight size={20} />
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
