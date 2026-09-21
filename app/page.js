'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, FLOW, fmt } from '../lib/supabase';

const NOTES = {
  VALIDATED: 'ICCID validated against inventory',
  PROVISIONING: 'HSS/HLR write in progress',
  ACTIVE: 'IMS profile pushed \u2014 line live on network',
};

export default function Page() {
  const [rows, setRows] = useState([]);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('activations')
      .select('*')
      .order('requested_at', { ascending: false });
    if (error) setError(error.message);
    else setRows(data || []);
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel('activations-provisioning')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activations' },
        (payload) => {
          const id = payload.new?.id || payload.old?.id;
          setFlash(id);
          setTimeout(() => setFlash(null), 1400);
          load();
        }
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    const poll = setInterval(load, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [load]);

  async function setStatus(row, status, note) {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('activations')
      .update({ status, network_note: note || NOTES[status] || null })
      .eq('id', row.id);
    if (error) setError(error.message);
    setBusy(false);
    load();
  }

  function advance(row) {
    const i = FLOW.indexOf(row.status);
    const next = i === -1 ? FLOW[0] : FLOW[Math.min(i + 1, FLOW.length - 1)];
    setStatus(row, next);
  }

  async function reset() {
    setBusy(true);
    const { error } = await supabase.rpc('reset_demo');
    if (error) setError(error.message);
    setBusy(false);
    load();
  }

  const count = (s) => rows.filter((r) => r.status === s).length;
  const pending = rows.filter((r) => FLOW.indexOf(r.status) > -1 && r.status !== 'ACTIVE').length;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Network Provisioning Dashboard</h1>
          <div className="sub">App B &middot; network operations</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="live" data-testid="live-indicator">
            <span className={'led' + (live ? ' on' : '')} />
            {live ? 'live' : 'connecting'}
          </span>
          <button className="btn-ghost" onClick={reset} disabled={busy} data-testid="reset-demo">
            Reset demo
          </button>
        </div>
      </header>

      <main>
        {error && <div className="err" data-testid="error">{error}</div>}

        <div className="stats">
          <div className="stat"><b data-testid="stat-queue">{pending}</b><span>in queue</span></div>
          <div className="stat"><b data-testid="stat-active">{count('ACTIVE')}</b><span>active</span></div>
          <div className="stat"><b data-testid="stat-suspended">{count('SUSPENDED')}</b><span>suspended</span></div>
          <div className="stat"><b data-testid="stat-failed">{count('FAILED') + count('CANCELLED')}</b><span>failed / cancelled</span></div>
        </div>

        <section className="card">
          <h2>Provisioning queue</h2>
          {rows.length === 0 ? (
            <div className="empty">Queue empty &mdash; nothing to provision.</div>
          ) : (
            <div className="scroller">
              <table data-testid="provisioning-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Customer</th>
                    <th>ICCID</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Network note</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const terminal = ['CANCELLED', 'FAILED'].includes(r.status);
                    return (
                      <tr key={r.id} className={flash === r.id ? 'flash' : ''} data-testid={'row-' + r.ref}>
                        <td className="mono">{r.ref}</td>
                        <td>{r.customer}</td>
                        <td className="mono muted tiny">{r.iccid}</td>
                        <td className="tiny">{r.plan}</td>
                        <td>
                          <span className={'badge s-' + r.status} data-testid={'status-' + r.ref}>
                            {r.status}
                          </span>
                        </td>
                        <td className="tiny muted">{r.network_note || '\u2014'}</td>
                        <td className="mono muted tiny">{fmt(r.updated_at)}</td>
                        <td>
                          <div className="actions">
                            {!terminal && r.status !== 'ACTIVE' && r.status !== 'SUSPENDED' && (
                              <button
                                className="btn-mini"
                                onClick={() => advance(r)}
                                disabled={busy}
                                data-testid={'advance-' + r.ref}
                              >
                                advance &rarr;
                              </button>
                            )}
                            {r.status === 'ACTIVE' && (
                              <button
                                className="btn-mini"
                                onClick={() => setStatus(r, 'SUSPENDED', 'Suspended by network ops')}
                                disabled={busy}
                                data-testid={'suspend-' + r.ref}
                              >
                                suspend
                              </button>
                            )}
                            {r.status === 'SUSPENDED' && (
                              <button
                                className="btn-mini"
                                onClick={() => setStatus(r, 'ACTIVE', 'Restored by network ops')}
                                disabled={busy}
                                data-testid={'restore-' + r.ref}
                              >
                                restore
                              </button>
                            )}
                            {!terminal && (
                              <button
                                className="btn-mini"
                                onClick={() => setStatus(r, 'FAILED', 'Provisioning failed \u2014 HSS timeout')}
                                disabled={busy}
                                data-testid={'fail-' + r.ref}
                              >
                                fail
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="tiny muted" style={{ textAlign: 'center' }}>
          Lifecycle: REQUESTED &rarr; VALIDATED &rarr; PROVISIONING &rarr; ACTIVE. Every write is pushed to the Activation Portal.
        </p>
      </main>
    </>
  );
}
