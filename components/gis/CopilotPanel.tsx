'use client';
import { useState } from 'react';
import { Sparkles, Send, CheckCircle2 } from 'lucide-react';
import type { GisPlan } from '../../lib/gis/contracts';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { record, parseMapAction } from '../../lib/gis/validation';
const prompts = [
  'Buat peta curah hujan dan kemiringan dengan batas kecamatan',
  'Tambahkan tutupan lahan dan tanah',
  'Pilih area contoh Barat dan buat legenda',
  'Jelaskan peta yang sedang saya lihat',
];
export default function CopilotPanel() {
  const { recipe, replace, mode, log } = useWorkspaceStore();
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<GisPlan | null>(null);
  const [base, setBase] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function ask(value: string) {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError(null);
    setPlan(null);
    setMessages((m) => [...m, { role: 'Anda', text: value }].slice(-12));
    try {
      const r = await fetch('/api/gis/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: value, recipe }),
      });
      const d: unknown = await r.json();
      if (!r.ok)
        throw new Error(
          record(d) && typeof d.error === 'string'
            ? d.error
            : 'Planner tidak tersedia',
        );
      if (
        !record(d) ||
        !Array.isArray(d.actions) ||
        typeof d.message !== 'string' ||
        !Array.isArray(d.unavailable) ||
        !Array.isArray(d.sources) ||
        d.provider !== 'deterministic-demo'
      )
        throw new Error('Rencana tidak valid');
      d.actions.forEach(parseMapAction);
      setPlan(d as unknown as GisPlan);
      setBase(JSON.stringify(recipe));
      setMessages((m) =>
        [...m, { role: 'Copilot demo', text: String(d.message) }].slice(-12),
      );
      setPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal');
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!plan || busy) return;
    if (base !== JSON.stringify(recipe)) {
      setError('Peta berubah sejak rencana dibuat. Minta rencana baru.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/gis/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe, actions: plan.actions, origin: 'ai' }),
      });
      const d: unknown = await r.json();
      if (!r.ok || !record(d))
        throw new Error(
          record(d) && typeof d.error === 'string' ? d.error : 'Tindakan gagal',
        );
      replace(
        d.recipe,
        `Copilot: ${plan.actions.map((a) => a.tool).join(', ')}`,
        recipe,
      );
      setPlan(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tindakan gagal');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="gis-copilot">
      <h2>
        <Sparkles size={19} />
        AI GIS Copilot
      </h2>
      <span className="gis-tag">PARSER DEMO DETERMINISTIK</span>
      <p className="gis-muted">
        Instruksi menjadi MapRecipe. Provider AI eksternal belum aktif; tidak
        ada komputasi ilmiah otomatis.
      </p>
      <div className="gis-context">
        Konteks: {recipe.layers.length} layer ·{' '}
        {recipe.aoi?.name ?? 'AOI belum dipilih'}
        {recipe.analysisConfiguration && (
          <p>
            Konfigurasi: {recipe.analysisConfiguration.name} · v
            {recipe.analysisConfiguration.version} · eksperimental. Tool
            konfigurasi tersedia sebagai kontrak bertipe; planner bahasa alami
            belum menggunakannya.
          </p>
        )}
      </div>
      <div className="gis-prompts">
        {prompts.map((p) => (
          <button
            key={p}
            disabled={busy || mode !== 'demo'}
            onClick={() => ask(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="gis-conversation" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`gis-message ${m.role === 'Anda' ? 'user' : ''}`}
          >
            <small>{m.role}</small>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {plan && (
        <div className="gis-plan">
          <h3>Tindakan yang diusulkan</h3>
          <ol>
            {plan.actions.map((a, i) => (
              <li key={i}>
                <CheckCircle2 size={14} />
                {a.tool}
                {'datasetId' in a ? ` · ${a.datasetId}` : ''}
              </li>
            ))}
          </ol>
          {plan.unavailable.map((v, i) => (
            <p key={i} className="gis-warning">
              {v}
            </p>
          ))}
          {plan.sources.map((s, i) => (
            <small className="gis-muted" key={i}>
              {s}
              <br />
            </small>
          ))}
          {plan.actions.length > 0 && (
            <button disabled={busy} className="gis-button" onClick={apply}>
              Terapkan ke sesi peta
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="gis-error" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(prompt);
        }}
      >
        <label htmlFor="gis-prompt">Instruksi GIS</label>
        <textarea
          id="gis-prompt"
          maxLength={2000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tambahkan curah hujan dan batas kecamatan…"
          rows={3}
        />
        <button
          className="gis-button"
          disabled={busy || !prompt.trim() || mode !== 'demo'}
        >
          {busy ? 'Menyiapkan…' : 'Kirim instruksi'}
          <Send size={15} />
        </button>
      </form>
      <details>
        <summary>Aktivitas sesi ({log.length})</summary>
        {log.map((s, i) => (
          <p className="gis-muted" key={i}>
            {s}
          </p>
        ))}
      </details>
    </section>
  );
}
