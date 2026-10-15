export function demoEnabled(env: { NODE_ENV?: string; GIS_DEMO_MODE?: string }): boolean {
  return env.NODE_ENV === 'development' && env.GIS_DEMO_MODE === 'true';
}
