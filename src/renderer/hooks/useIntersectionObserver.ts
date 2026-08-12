import { useEffect, useState } from 'react';

/**
 * Calls `onIntersect` while the observed element is in view, re-arming itself
 * after every hit so a page that still doesn't overflow the viewport keeps
 * loading (see below).
 *
 * Because it re-arms, callers **must** make progress in `onIntersect` and flip
 * `enabled` off once the list is exhausted — otherwise the callback repeats for
 * as long as the element stays visible.
 */
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
    const [rearmCount, setRearmCount] = useState(0);

    useEffect(() => {
        if (!enabled || !target) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                // Latest record wins — a burst can queue several.
                if (!entries.at(-1)?.isIntersecting) {
                    return;
                }

                onIntersect();

                // An IntersectionObserver only reports *changes*, so if the
                // freshly loaded page still doesn't overflow the viewport the
                // element never leaves it and no second callback arrives.
                // Bumping `rearmCount` re-runs this effect, and the fresh
                // `observe()` below delivers a new initial notification.
                //
                // This deliberately goes through state instead of an inline
                // `unobserve`/`observe` pair: the re-arm has to land *after*
                // React commits the new page. Re-arming synchronously here
                // would measure the next notification against the pre-load
                // layout, see the element still intersecting, and fire again —
                // loading several pages per scroll.
                setRearmCount((count) => count + 1);
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
        // `rearmCount` is the re-arm trigger described above, not a value the
        // effect reads.
    }, [target, onIntersect, enabled, threshold, rootMargin, rearmCount]);

    return setTarget;
}
