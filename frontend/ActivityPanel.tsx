"use client";
import { useEffect, useRef, useState } from 'react';
import { api, jsonPost } from './api';
import { useLocale } from './i18n/LocaleProvider';
import AgentActions from './AgentActions';
import type { AgentAction } from './agentTypes';

type Entry = { cursor: number; actor: string; event: string; created_at: string };
export default function ActivityPanel({ kind, id, onUpdate }: { kind: 'draft' | 'run'; id: string; onUpdate?: () => void }) {
  const { t } = useLocale();
  const [entries, setEntries] = useState<Entry[]>([]), [actions, setActions] = useState<AgentAction[]>([]);
  const cursor = useRef(0);
  const [more, setMore] = useState(false);
  const [client, setClient] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    cursor.current=0;setEntries([]);setActions([]);setMore(false);
    async function reload() {
      try {
        const result = await api<{entries: Entry[]; next_cursor:number}>(`/agent/${kind}/${id}/activity?limit=100&after_cursor=${cursor.current}`);
        if (live) { setEntries(current => [...current, ...result.entries.filter(e => !current.some(old => old.cursor === e.cursor))]); cursor.current=Math.max(cursor.current,result.next_cursor); setMore(result.entries.length === 100); }
        if (kind === 'run') {
          const pending = await api<AgentAction[]>(`/agent/runs/${id}/actions`);
          if (live) setActions(pending);
        }
      } catch { /* Keep acknowledged entries while offline. */ }
    }
    void reload(); const timer = setInterval(() => void reload(), 1500);
    return () => { live = false; clearInterval(timer); };
  }, [kind, id]);
  async function loadMore() {
    try {
      const result = await api<{entries:Entry[];next_cursor:number}>(
        `/agent/${kind}/${id}/activity?limit=100&after_cursor=${cursor.current}`);
      setEntries(current => [...current, ...result.entries.filter(e => !current.some(old => old.cursor === e.cursor))]);
      cursor.current = Math.max(cursor.current, result.next_cursor);
      setMore(result.entries.length === 100);
    } catch (e) { setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); }
  }
  async function share() {
    try {
      await api('/agent-grants', jsonPost({ client_id: client, kind, id }));
      setMessage(t('Shared with this Agent client. It can read this context and its related assets.'));
    } catch (e) { setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); }
  }
  return <>
    {kind === 'run' && <AgentActions actions={actions} onApplied={action => {
      setActions(current => current.map(a => a.id === action.id ? action : a));
      if (action.result_ids.draft_id) window.location.assign(`/drafts/${action.result_ids.draft_id}`);
      else if (action.result_ids.run_id && action.result_ids.run_id !== id) window.location.assign(`/edit/${action.result_ids.run_id}`);
      else onUpdate?.();
    }} />}
    <details className="activity-panel"><summary>{t('Activity and Agent access')}</summary>
      <label>{t('Local Agent client ID')}<input value={client} onChange={e => setClient(e.target.value)} /></label>
      <p>{t('Sharing grants access only to this context and its related assets.')}</p>
      <button className="secondary-button" onClick={() => void share()}>{t('Share this context')}</button>
      {message && <p role="status">{message}</p>}
      <ol>{entries.map(entry => <li key={entry.cursor}>
        <time>{new Date(entry.created_at).toLocaleTimeString()}</time> · {entry.actor} · {entry.event}
      </li>)}</ol>
      {more && <button className="secondary-button" onClick={() => void loadMore()}>{t('Load more activity')}</button>}
    </details>
  </>;
}
