'use client';
import SpatialMap from '../SpatialMap';
import WorkspaceMapContent from './WorkspaceMapContent';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
export default function WorkspaceMap({
  tool,
  onInspect,
  onMeasure,
}: {
  tool: 'pan' | 'pixel' | 'measure';
  onInspect: (latitude: number, longitude: number) => void;
  onMeasure: (metres: number) => void;
}) {
  const { recipe, mode } = useWorkspaceStore();
  return (
    <SpatialMap demo={mode === 'demo'} basemap={recipe.basemap}>
      <WorkspaceMapContent tool={tool} onInspect={onInspect} onMeasure={onMeasure} />
    </SpatialMap>
  );
}
