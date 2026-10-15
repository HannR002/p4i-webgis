'use client';
import type { KeyboardEvent } from 'react';
import { Layers, Crosshair, Sparkles, FlaskConical } from 'lucide-react';
export const workspacePanels = [
  { id: 'layers', label: 'Layer', icon: Layers },
  { id: 'pixel', label: 'Pixel', icon: Crosshair },
  { id: 'copilot', label: 'AI GIS', icon: Sparkles },
  { id: 'analysis', label: 'Analisis', icon: FlaskConical },
] as const;
export type WorkspacePanel = (typeof workspacePanels)[number]['id'];
export default function WorkspaceTabs({
  panel,
  select,
}: {
  panel: WorkspacePanel;
  select: (panel: WorkspacePanel) => void;
}) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % 4
        : event.key === 'ArrowLeft'
          ? (index + 3) % 4
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 3
              : -1;
    if (next < 0) return;
    event.preventDefault();
    select(workspacePanels[next].id);
    const parent = event.currentTarget.parentElement;
    parent?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
  }
  return (
    <div className="gis-tabs" role="tablist" aria-label="Panel workspace">
      {workspacePanels.map(({ id, label, icon: Icon }, index) => (
        <button
          key={id}
          id={`gis-tab-${id}`}
          role="tab"
          aria-selected={panel === id}
          aria-controls={`gis-panel-${id}`}
          tabIndex={panel === id ? 0 : -1}
          onClick={() => select(id)}
          onKeyDown={(e) => navigate(e, index)}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
