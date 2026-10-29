/** PHASE-0 STUB — workstream D replaces (§9.2). Shows the real verdict to prove the data layer. */
import PlaceholderPage from '../_ui/PlaceholderPage';
import { useTonight } from '@/data/tonight';
import { Card, Chip, InfoPopover } from '@/ui';

export default function Watchtower() {
  const score = useTonight((s) => s.score);
  const v = score.data?.verdict;
  return (
    <PlaceholderPage eyebrow="二 · 見張り · THE WATCHTOWER" title={<>Where and <em>whether</em>.</>}>
      <Card spotlight brand={{ kanji: '見', text: 'Watchtower' }} tag="№ 01" style={{ maxWidth: 520 }}>
        {score.status === 'loading' && !v && <p>Reading tonight's forecast…</p>}
        {score.error && !v && <p>Forecast unavailable: {score.error}</p>}
        {v && (
          <>
            <div className="display num" style={{ fontSize: 48, color: 'var(--moon)' }}>
              {Math.round(v.score)}
              <InfoPopover title="Night Honor Score" trace={score.data?.trace} provenance={score.provenance} computedAt={score.computedAt} />
            </div>
            <p>
              <strong>{v.headline}</strong> {v.reason}
            </p>
            {score.stale && <Chip variant="stale" />}
          </>
        )}
      </Card>
    </PlaceholderPage>
  );
}
