/** React Bits expansion over the persistent live dusk canvas. */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { P } from '@/scene/intro/introBus';
import ScrollExpand, { type ScrollExpandHandle } from '@/vendor/reactbits/ScrollExpand';

export interface FrameHandle {
  update(p: number): void;
}

const IntroFrame = forwardRef<FrameHandle>(function IntroFrame(_, ref) {
  const expand = useRef<ScrollExpandHandle>(null);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 640px)').matches);

  useLayoutEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const onChange = () => setCompact(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useImperativeHandle(ref, () => ({
    update(p: number) {
      expand.current?.update(Math.min(1, p / P.frameEnd));
    },
  }), []);

  return (
    <ScrollExpand
      ref={expand}
      controlled
      useWindowScroll
      mediaSelector="#canvas-root"
      startWidth={compact ? 88 : 76}
      startHeight={compact ? 54 : 60}
      startRadius={2}
      mediaZoom={1.12}
      overlayScrim={0}
      smoothing={0}
      className="tw-intro-expand"
      title={
        <h1 className="tw-intro-title">
          The night begins at <em>dusk</em>.
        </h1>
      }
      scrollHint="Scroll into the night ↓"
    />
  );
});

export default IntroFrame;
