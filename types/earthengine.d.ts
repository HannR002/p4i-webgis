declare module '@google/earthengine' {
  interface EeComputedObject {
    evaluate(callback: (result: unknown, error?: string) => void): void;
  }

  type EeGeometry = EeComputedObject;

  type EeDictionary = EeComputedObject;

  interface EeImage extends EeComputedObject {
    select(selectors: string | string[]): EeImage;
    rename(names: string | string[]): EeImage;
    expression(expression: string, variables?: Record<string, EeImage>): EeImage;
    remap(from: number[], to: number[], defaultValue?: number): EeImage;
    multiply(value: number | EeImage): EeImage;
    add(value: number | EeImage): EeImage;
    addBands(image: EeImage): EeImage;
    clip(geometry: EeGeometry): EeImage;
    reduceRegion(parameters: Record<string, unknown>): EeDictionary;
    getMapId(
      visualization: Record<string, unknown>,
      callback: (map: EeMapId | undefined, error?: string) => void,
    ): void;
  }

  interface EeImageCollection extends EeComputedObject {
    filterDate(start: string, end: string): EeImageCollection;
    filterBounds(geometry: EeGeometry): EeImageCollection;
    select(selectors: string | string[]): EeImageCollection;
    sum(): EeImage;
    first(): EeComputedObject;
  }

  interface EeMapId {
    mapid: string;
    token: string;
    urlFormat: string;
  }

  interface EarthEngineModule {
    data: {
      authenticateViaPrivateKey(
        privateKey: Record<string, unknown>,
        success: () => void,
        failure: (error: string) => void,
      ): void;
    };
    initialize(
      apiBaseUrl: string | null,
      tileBaseUrl: string | null,
      success: () => void,
      failure: (error: string) => void,
      xsrfToken: string | null,
      project: string,
    ): void;
    Geometry(geojson: Record<string, unknown>): EeGeometry;
    Image(input: string | EeComputedObject): EeImage;
    ImageCollection(id: string): EeImageCollection;
    Terrain: {
      slope(image: EeImage): EeImage;
    };
    Reducer: {
      mean(): EeComputedObject;
      frequencyHistogram(): EeComputedObject;
    };
  }

  const earthEngine: EarthEngineModule;
  export default earthEngine;
}
