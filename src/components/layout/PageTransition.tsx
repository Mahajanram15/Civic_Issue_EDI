import { ReactNode, useEffect, useState } from 'react';

let hasRenderedOnce = false;

export function PageTransition({ children }: { children: ReactNode }) {
  const [shouldAnimate, setShouldAnimate] = useState(hasRenderedOnce);

  useEffect(() => {
    hasRenderedOnce = true;
    setShouldAnimate(true);
  }, []);

  return <div className={shouldAnimate ? 'animate-fade-in' : undefined}>{children}</div>;
}
