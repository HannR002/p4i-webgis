import 'server-only';

import earthEngine from '@google/earthengine';

let initializationPromise: Promise<typeof earthEngine> | null = null;

function readServiceAccount(): Record<string, unknown> {
  const encoded = process.env.GEE_SERVICE_ACCOUNT_JSON_BASE64;
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'Earth Engine credentials are not configured (GEE_SERVICE_ACCOUNT_JSON or GEE_SERVICE_ACCOUNT_JSON_BASE64)',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Earth Engine service-account JSON is invalid');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Earth Engine service-account credentials must be a JSON object');
  }

  const credentials = parsed as Record<string, unknown>;
  if (typeof credentials.client_email !== 'string' || typeof credentials.private_key !== 'string') {
    throw new Error('Earth Engine credentials must contain client_email and private_key');
  }
  return credentials;
}

export function initializeEarthEngine(): Promise<typeof earthEngine> {
  if (initializationPromise) return initializationPromise;

  initializationPromise = new Promise((resolve, reject) => {
    const project = process.env.GEE_PROJECT_ID;
    if (!project) {
      reject(new Error('GEE_PROJECT_ID is not configured'));
      return;
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = readServiceAccount();
    } catch (error: unknown) {
      reject(error);
      return;
    }

    earthEngine.data.authenticateViaPrivateKey(
      credentials,
      () => {
        earthEngine.initialize(
          null,
          null,
          () => resolve(earthEngine),
          (error) => {
            initializationPromise = null;
            reject(new Error(`Earth Engine initialization failed: ${error}`));
          },
          null,
          project,
        );
      },
      (error) => {
        initializationPromise = null;
        reject(new Error(`Earth Engine authentication failed: ${error}`));
      },
    );
  });

  return initializationPromise;
}

export function evaluateEeObject(object: { evaluate: (callback: (result: unknown, error?: string) => void) => void }) {
  return new Promise<unknown>((resolve, reject) => {
    object.evaluate((result, error) => {
      if (error) reject(new Error(error));
      else resolve(result);
    });
  });
}

export function getEeMapUrl(
  image: {
    getMapId: (
      visualization: Record<string, unknown>,
      callback: (map: { urlFormat: string } | undefined, error?: string) => void,
    ) => void;
  },
  visualization: Record<string, unknown>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    image.getMapId(visualization, (map, error) => {
      if (error || !map?.urlFormat) {
        reject(new Error(error || 'Earth Engine did not return a tile URL'));
      } else {
        resolve(map.urlFormat);
      }
    });
  });
}

