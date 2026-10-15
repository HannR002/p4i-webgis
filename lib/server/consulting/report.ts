import { reportMapGeometry } from '../../consulting/mapPreview';
import 'server-only';
import { jsPDF } from 'jspdf';
import type {
  ClientDeliverable,
  ConsultingProject,
  DeliverableRevision,
  PublishedClientDeliverable,
} from '../../consulting/contracts';
/** Text is encoded by jsPDF, never rendered as HTML or fetched from user-supplied URLs. */
export function generateDeliverablePdf(
  project: ConsultingProject,
  document: ClientDeliverable | PublishedClientDeliverable,
  revision: DeliverableRevision,
): Uint8Array {
  const pdf = new jsPDF();
  let y = 20;
  function line(value: string, size = 10) {
    pdf.setFontSize(size);
    const rows = pdf.splitTextToSize(value, 180) as string[];
    for (const row of rows) {
      if (y > 275) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(row, 15, y);
      y += size > 11 ? 8 : 5;
    }
  }
  line('P4I Consultant | Spatial Analytics', 17);
  line('DEMO / EXPERIMENTAL - DEVELOPMENT SIMULATION', 12);
  line('NO OFFICIAL CLIENT PUBLICATION - NO METHODOLOGY VALIDATION', 9);
  line(revision.content.title, 15);
  line(`Project: ${project.title}`);
  line(`Client: ${project.clientLabel} | Project ID: ${project.id}`);
  const published =
    'publication' in document
      ? document.publication
      : document.publications.find((p) => p.revision === revision.number);
  line(
    `Status: ${published ? 'PUBLISHED - SIMULATION' : document.status} | revision ${revision.number}`,
  );
  line(`Created: ${revision.createdAt} | origin: ${revision.origin}`);
  line(`Evidence SHA-256: ${revision.contentHash}`);
  if ('releasedContentHash' in document)
    line(`Released/redacted content SHA-256: ${document.releasedContentHash}`);
  if (published)
    line(
      `Release: ${published.publishedAt} | publisher: ${published.publishedBy} | official=false`,
    );
  const c = revision.content,
    recipe = c.recipe;
  line('Analysis summary', 13);
  line(c.summary);
  line('Assumptions', 13);
  line(c.assumptions);
  line('Limitations', 13);
  line(c.limitations);
  if (c.analystNotes) {
    line('Analyst notes (internal draft)', 13);
    line(c.analystNotes);
  }
  line('Map snapshot / schematic', 13);
  // Render the bounded MapRecipe points in a self-contained schematic, not a fabricated basemap.
  if (y > 220) {
    pdf.addPage();
    y = 20;
  }
  pdf.setDrawColor(148, 163, 184);
  pdf.rect(15, y, 180, 42);
  pdf.setFontSize(9);
  pdf.text(
    'MapRecipe view - schematic only; no basemap / no new measurements',
    19,
    y + 7,
  );
  pdf.text(
    `Centre ${recipe.viewport.center.join(', ')} | zoom ${recipe.viewport.zoom} | ${recipe.layers.length} layers`,
    19,
    y + 14,
  );
  const geometry = reportMapGeometry(c);
  pdf.setDrawColor(15, 118, 110);
  for (const ring of geometry.rings)
    for (let i = 1; i < ring.length; i++)
      pdf.line(
        25 + ring[i - 1][0] * 150,
        y + 20 + ring[i - 1][1] * 15,
        25 + ring[i][0] * 150,
        y + 20 + ring[i][1] * 15,
      );
  pdf.setFillColor(124, 58, 237);
  for (const [x, lat] of geometry.points)
    pdf.circle(25 + x * 150, y + 20 + lat * 15, 1.3, 'F');
  y += 49;
  line(`AOI: ${recipe.aoi?.name ?? 'Not selected'} | ${recipe.aoi?.id ?? '-'}`);
  line('Legend / configured layers', 13);
  for (const layer of recipe.legend) {
    line(layer.title);
    for (const entry of layer.entries) line(`${entry.label} | ${entry.color}`);
  }
  for (const a of recipe.analysisResults ?? [])
    line(`${a.demo ? 'DEMO' : 'USER INPUT'} | ${a.summary} | ${a.provenance}`);
  line('Source datasets / native metadata', 13);
  for (const source of c.datasetSources ?? [])
    line(
      `${source.title} | ${source.id} | ${source.source} | ${source.version} | ${source.provenance} | ${source.raster ? JSON.stringify({ period: source.raster.period, resolution: source.raster.resolution }) : 'vector metadata'}`,
    );
  const config = recipe.analysisConfiguration;
  if (config) {
    line(
      `GIS configuration: ${config.name} | ${config.analysisType} | v${config.version} | EXPERIMENTAL`,
      13,
    );
    line(`Parameters: ${JSON.stringify(config.parameters)}`);
    line(`Weights: ${JSON.stringify(config.weights)}`);
    line(
      `Period: ${JSON.stringify(config.analysisPeriod)} | resolution: ${JSON.stringify(config.spatialResolution)}`,
    );
    for (const source of config.sourceMetadata)
      line(
        `Source: ${source.datasetId} | ${source.source} | ${source.version} | ${source.provenance}`,
      );
  }
  if (revision.analysisRun) {
    line('Verified development compute snapshot', 13);
    line(JSON.stringify(revision.analysisRun));
    if (revision.analysisResult)
      line(JSON.stringify(revision.analysisResult.result));
  }
  line(
    'Review concerns report completeness, interpretation, authorized release and professional quality. It does not establish scientific methodology validation.',
  );
  return new Uint8Array(pdf.output('arraybuffer'));
}
