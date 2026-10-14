import 'server-only';
import { demoEnabled } from '../../gis/mode';
import { createDemoPlanner } from './providers/demo';
import type { GisPlanner } from './contracts';
export function getGisPlanner(): GisPlanner | null {
  return demoEnabled(process.env) ? createDemoPlanner() : null;
}

import { createControlledDemoProvider } from './providers/controlledDemo';
import type { AIProvider } from '../../gis/copilotContracts';
export function getAIProvider(): AIProvider | null {
  return demoEnabled(process.env) ? createControlledDemoProvider() : null;
}
