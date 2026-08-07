import { useEffect } from 'react';
import { useStore } from '../../store/store';
import styles from './Toast.module.css';

export function Toast() {
    const { toast, hideToast } = useStore();

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => {
                hideToast();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast, hideToast]);

    if (!toast) return null;

    const isError = toast.type === 'error';

    return (
        <div className={`${styles.toast} ${isError ? styles.error : ''}`} role="status">
            <span className={styles.icon}>{isError ? '❌' : '✅'}</span>
            <span>{toast.message}</span>
        </div>
    );
}
