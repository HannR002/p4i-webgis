import { NextResponse } from 'next/server';
import { readGisBody, gisError } from '../../../../lib/server/gis/http';
import { record, text, GisInputError } from '../../../../lib/gis/validation';
import { exact } from '../../../../lib/gis/copilotValidation';
import {
  computeEnvironment,
  requireHumanOrigin,
} from '../../../../lib/server/compute/access';
import { developmentCompute } from '../../../../lib/server/compute/service';
import type { ComputeCeiling } from '../../../../lib/gis/computeContracts';
export const runtime = 'nodejs';
export const maxDuration = 10;
export async function POST(request: Request) {
  try {
    requireHumanOrigin(request);
    const body = await readGisBody(request);
    if (
      !record(body) ||
      !text(body.jobId, 100) ||
      !['get', 'approve', 'execute', 'cancel', 'reject', 'retry'].includes(
        String(body.action),
      )
    )
      throw new GisInputError('Aksi job tidak valid');
    exact(
      body,
      body.action === 'approve'
        ? ['action', 'jobId', 'requestHash', 'ceiling']
        : ['action', 'jobId'],
    );
    const { env, attach } = await computeEnvironment(request),
      id = body.jobId;
    let job;
    if (body.action === 'approve') {
      if (!text(body.requestHash, 64) || !record(body.ceiling))
        throw new GisInputError('Snapshot/batas persetujuan diperlukan');
      job = developmentCompute.approve(
        id,
        body.requestHash,
        body.ceiling as unknown as ComputeCeiling,
        env,
      );
    } else if (body.action === 'execute')
      job = await developmentCompute.run(id, env, request.signal);
    else if (body.action === 'cancel') job = developmentCompute.cancel(id, env);
    else if (body.action === 'reject') job = developmentCompute.reject(id, env);
    else if (body.action === 'retry') job = developmentCompute.retry(id, env);
    else job = developmentCompute.get(id, env);
    return attach(
      NextResponse.json(job, {
        headers: { 'Cache-Control': 'private, no-store' },
      }),
    );
  } catch (error) {
    return gisError(error);
  }
}
