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

    return (
        <div className={styles.toast}>
            <span className={styles.icon}>✅</span>
            <span>{toast.message}</span>
        </div>
    );
}
