import { useEffect, useRef } from 'react';

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
    const targetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!enabled) {
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

        const currentTarget = targetRef.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
            observer.disconnect();
        };
    }, [onIntersect, enabled, threshold, rootMargin]);

    return targetRef;
}
