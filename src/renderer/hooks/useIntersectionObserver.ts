import { useEffect, useState } from 'react';

export function useIntersectionObserver({
    onIntersect,
    enabled = true,
    threshold = 0.1,
    rootMargin = '0px',
}: {
    onIntersect: () => void;
    enabled?: boolean;
    threshold?: number;
    rootMargin?: string;
}) {
    const [target, setTarget] = useState<Element | null>(null);

    useEffect(() => {
        if (!enabled || !target) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const firstEntry = entries[0];
                if (firstEntry.isIntersecting) {
                    onIntersect();
                }
            },
            {
                threshold,
                rootMargin,
            }
        );

        observer.observe(target);

        return () => {
            observer.disconnect();
        };
    }, [target, onIntersect, enabled, threshold, rootMargin]);

    return setTarget;
}
