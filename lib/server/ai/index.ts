import { geminiFreeProvider } from './providers/geminiFree';
import 'server-only';
import { demoEnabled } from '../../gis/mode';
import { createDemoPlanner } from './providers/demo';
import type { GisPlanner } from './contracts';
export function getGisPlanner(): GisPlanner | null {
  return demoPlannerSelected() ? createDemoPlanner() : null;
}

import { createControlledDemoProvider } from './providers/controlledDemo';
import type { AIProvider } from '../../gis/copilotContracts';
export function getAIProvider(): AIProvider | null {
  if (process.env.AI_PROVIDER === 'gemini-free') return geminiFreeProvider;
  return demoPlannerSelected() ? createControlledDemoProvider() : null;
}

function demoPlannerSelected(): boolean {
  // An explicit unknown/real selection must never silently fall back to DEMO.
  const selected = process.env.AI_PROVIDER;
  return (
    (selected === undefined || selected === 'demo') && demoEnabled(process.env)
  );
}
