import { useEffect, useRef, useState } from 'react';
import type { RemotePairingRequest } from '../../../shared/types';
import styles from './SettingsModal.module.css';

interface PairingApprovalModalProps {
    request: RemotePairingRequest;
    approvePairing: (requestId: string) => Promise<boolean>;
    rejectPairing: (requestId: string) => Promise<boolean>;
}

export default function PairingApprovalModal({ request, approvePairing, rejectPairing }: PairingApprovalModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const actionPendingRef = useRef(false);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        dialog.showModal();
        dialog.querySelector<HTMLButtonElement>('[data-autofocus]')?.focus();
        return () => dialog.close();
    }, []);

    const handleDecision = async (decision: 'approve' | 'reject') => {
        if (actionPendingRef.current) return;
        actionPendingRef.current = true;
        setIsPending(true);
        setError(null);
        try {
            const resolved = await (decision === 'approve' ? approvePairing : rejectPairing)(request.id);
            if (!resolved) {
                setError('This pairing request is no longer available.');
            }
        } catch {
            setError('Could not respond to the pairing request. Please try again.');
        } finally {
            actionPendingRef.current = false;
            setIsPending(false);
        }
    };

    return (
        <dialog
            ref={dialogRef}
            className={styles.pairingApprovalDialog}
            aria-labelledby="pairing-approval-title"
            aria-describedby="pairing-approval-description"
            onClick={(event) => event.stopPropagation()}
            onCancel={(event) => {
                event.preventDefault();
                void handleDecision('reject');
            }}
        >
            <div className={styles.pairingApprovalContent}>
                <h2 id="pairing-approval-title" className={styles.pairingApprovalHeading}>Approve pairing?</h2>
                <p id="pairing-approval-description" className={styles.pairingApprovalDescription}>
                    This device wants to control playback and access your library. Approve only if you started this pairing.
                </p>
                <div className={styles.pairingRequest}>
                    <strong>{request.name}</strong>
                    <span>{request.platform} · {request.ip}</span>
                </div>
                {error && <p className={styles.remoteError} role="alert">{error}</p>}
                <div className={styles.pairingApprovalActions}>
                    <button className={styles.rejectBtn} disabled={isPending} data-autofocus onClick={() => void handleDecision('reject')}>Reject</button>
                    <button className={styles.approveBtn} disabled={isPending} onClick={() => void handleDecision('approve')}>Approve</button>
                </div>
            </div>
        </dialog>
    );
}
