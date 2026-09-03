import {randomUUID} from 'node:crypto';
import {readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const defaultGenerationLeasePath = path.join(root, '.b10x-website-generation.json');

function readLease(leasePath) {
  let document;
  try {
    document = JSON.parse(readFileSync(leasePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw new Error(`cannot inspect Website generation lease ${leasePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (document?.schema !== 'b10x-website-generation-lease/v1'
    || !Number.isSafeInteger(document.pid)
    || document.pid <= 0
    || (document.childPid !== undefined
      && (!Number.isSafeInteger(document.childPid) || document.childPid <= 0))
    || typeof document.owner !== 'string'
    || !document.owner
    || typeof document.token !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(document.token)) {
    throw new Error(`invalid Website generation lease ${leasePath}; inspect it before removing it`);
  }
  return document;
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function activeGenerationLease(leasePath = defaultGenerationLeasePath) {
  const lease = readLease(leasePath);
  return lease && (processIsAlive(lease.pid) || processIsAlive(lease.childPid)) ? lease : undefined;
}

export function setGenerationLeaseChild(claim, childPid) {
  if (!Number.isSafeInteger(childPid) || childPid <= 0) throw new Error('generation child pid must be a positive integer');
  const current = readLease(claim.leasePath);
  if (!current
    || current.pid !== claim.pid
    || current.owner !== claim.owner
    || current.token !== claim.token) {
    throw new Error(`Website generation lease ownership changed before ${claim.owner} could record child pid ${childPid}`);
  }
  const temporaryPath = `${claim.leasePath}.${claim.pid}.${randomUUID()}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify({...current, childPid}, null, 2)}\n`,
    {encoding: 'utf8', flag: 'wx', mode: 0o600},
  );
  renameSync(temporaryPath, claim.leasePath);
}

export function claimGenerationLease(owner, leasePath = defaultGenerationLeasePath) {
  const current = readLease(leasePath);
  if (current) throw leaseConflict(current, owner, leasePath);

  const lease = {
    schema: 'b10x-website-generation-lease/v1',
    pid: process.pid,
    owner,
    token: randomUUID(),
    startedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(leasePath, `${JSON.stringify(lease, null, 2)}\n`, {encoding: 'utf8', flag: 'wx', mode: 0o600});
    return {leasePath, owner, pid: process.pid, token: lease.token};
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const winner = readLease(leasePath);
    if (winner) throw leaseConflict(winner, owner, leasePath);
    throw new Error(`Website generation lease ${leasePath} appeared during ${owner}; retry after inspecting it`);
  }
}

export function enterGenerationLease(
  owner,
  leasePath = defaultGenerationLeasePath,
  token = process.env.B10X_GENERATION_LEASE_TOKEN,
) {
  const current = readLease(leasePath);
  if (current) {
    if (typeof token !== 'string' || token.length === 0 || token !== current.token) {
      throw leaseConflict(current, owner, leasePath);
    }
    return {
      leasePath,
      owner: current.owner,
      pid: current.pid,
      token: current.token,
      borrowed: true,
    };
  }
  return {...claimGenerationLease(owner, leasePath), borrowed: false};
}

export async function withGenerationLease(owner, operation, options = {}) {
  const access = enterGenerationLease(owner, options.leasePath, options.token);
  try {
    return await operation(access);
  } finally {
    if (!access.borrowed) releaseGenerationLease(access);
  }
}

export function assertGenerationLeaseAccess(
  requestedOwner,
  leasePath = defaultGenerationLeasePath,
  token = process.env.B10X_GENERATION_LEASE_TOKEN,
) {
  const current = readLease(leasePath);
  if (!current) return;
  if (typeof token === 'string' && token.length > 0 && token === current.token) return;
  throw leaseConflict(current, requestedOwner, leasePath);
}

export function releaseGenerationLease(claim) {
  const current = readLease(claim.leasePath);
  if (!current
    || current.pid !== claim.pid
    || current.owner !== claim.owner
    || current.token !== claim.token) return;
  try {
    unlinkSync(claim.leasePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function leaseConflict(current, requestedOwner, leasePath) {
  const liveParent = processIsAlive(current.pid);
  const liveChild = processIsAlive(current.childPid);
  if (liveParent || liveChild) {
    const child = current.childPid ? `, child pid ${current.childPid}${liveChild ? '' : ' exited'}` : '';
    return new Error(`Website generation is already owned by ${current.owner} (pid ${current.pid}${liveParent ? '' : ' exited'}${child}); stop it before starting ${requestedOwner}`);
  }
  return new Error(`stale Website generation lease from ${current.owner} (pid ${current.pid}) blocks ${requestedOwner}; inspect and move ${leasePath} aside before retrying`);
}
