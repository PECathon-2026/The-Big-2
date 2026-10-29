import { useCallback, useEffect, useState } from 'react';
import api, { type Ledger, type ObserveResult } from '../api';
import { useApp } from '../context/AppContext';
import { fmtTime } from '../format';
import { Card, Chip, KV } from './Card';

const USER_KEY = 'tsukuyomi-user-id';

export function userId(): string {
  try {
    let id = localStorage.getItem(USER_KEY);
    if (!id) {
      id = 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(USER_KEY, id);
    }
    return id;
  } catch {
    return 'u-anonymous';
  }
}

const KINDS = ['moon', 'planet', 'meteor', 'satellite', 'deepsky', 'custom'];

/** "Log tonight's watch": claims an observation for the current place/time and shows the verdict, points and rank. */
export function HonorCard({ eventId, eventTitle }: { eventId?: string; eventTitle?: string } = {}) {
  const { lat, lon, atIso } = useApp();
  const uid = userId();
  const [kind, setKind] = useState('moon');
  const [note, setNote] = useState('');
  const [last, setLast] = useState<ObserveResult | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.honor.ledger(uid).then(setLedger).catch((e) => setErr(String(e)));
  }, [uid]);
  useEffect(refresh, [refresh]);

  const claim = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.honor.observe({ user_id: uid, lat, lon, kind, event_id: eventId, title: eventTitle, note: note || undefined, claimed_at: atIso });
      setLast(r);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card en="Honor" jp="誉" right={ledger ? `${ledger.rank.kanji} ${ledger.rank.romaji} · ${ledger.rank.points} pts` : undefined}>
      <p className="muted small">
        Claims are checked against the sky for the chosen place and reference time before any points are given. Try logging the Moon while it is up, then at a time when it is down.
      </p>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What did you observe">
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input type="text" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn" onClick={() => void claim()} disabled={busy}>
          {busy ? 'Checking the sky…' : "Log tonight's watch"}
        </button>
      </div>
      {last && (
        <div style={{ marginTop: 10 }}>
          {last.accepted ? <Chip tone="ok">verified · +{last.points_awarded}</Chip> : <Chip tone="bad">rejected · 0</Chip>} <span className="small">{last.reason}</span>
          <div className="muted small">evidence: {JSON.stringify(last.observation.evidence)}</div>
          {last.observation.conditions && (
            <div className="muted small">
              conditions at {last.observation.conditions.time_local}: score {last.observation.conditions.score}, low cloud {last.observation.conditions.cloud_low}%, moon {Math.round(last.observation.conditions.moon_illum * 100)}% lit
            </div>
          )}
        </div>
      )}
      {err && <div className="err small">{err}</div>}
      {ledger && (
        <div style={{ marginTop: 12 }}>
          <KV
            rows={[
              ['Rank', `${ledger.rank.kanji} ${ledger.rank.romaji} — ${ledger.rank.meaning}`],
              ['Next', ledger.rank.next ? `${ledger.rank.next.kanji} ${ledger.rank.next.romaji} in ${ledger.rank.next.points_needed} pts` : 'highest rank'],
              ['Ledger', `${ledger.verified_count} verified · ${ledger.rejected_count} rejected`],
            ]}
          />
          {ledger.entries.slice(0, 5).map((o) => (
            <div key={o.id} className="small" style={{ marginTop: 4 }}>
              {o.verified ? '⛩' : '✕'} {o.title} · {fmtTime(o.claimed_at, undefined, true)} · {o.points} pts <span className="muted">— {o.reason}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
