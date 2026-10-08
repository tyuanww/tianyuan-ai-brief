import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const development = 'business-docs/01-客服Agent项目/30-开发-进行中';
export const CLOSURE_PATHS = Object.freeze({ delta: `${development}/content-intake-runtime-candidate/legacy-check-acl.v1.sql`,
  database: `${development}/schema.v1.25.sql`, manifest: `${development}/content-intake-runtime-candidate/legacy-check-installation.v1.json` });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function buildRuntimeClosure(read) {
  const predecessor = read(`${development}/schema.v1.24.sql`), delta = read(CLOSURE_PATHS.delta);
  if (sha(predecessor) !== 'c4ceffa961728423b755b00d551b9ab67fbf33ffe1dd87d8e671f6d151f744c5') throw new Error('Frozen v1.24 drift');
  const openapi = read(`${development}/openapi.v1.22.yaml`);
  if (sha(openapi) !== '3f741eb980aba1cd9a2a273b25771b50299e1aef3acbc6a1579b57541ed43a94') throw new Error('Frozen OpenAPI drift');
  const priorInstallation = read(`${development}/content-intake-csv-candidate/installation.generated.json`);
  if (sha(priorInstallation) !== 'e7bee22391c96c498d96e20e868cbf90429405ac3793eeb02bbc93e817939a28') throw new Error('Frozen installation drift');
  const dependencies = JSON.parse(priorInstallation).sources;
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (sha(read(dependency.path)) !== dependency.sha256) throw new Error(`Frozen installation dependency drift: ${name}`);
  }
  const database = Buffer.concat([Buffer.from('-- schema.v1.25 — DRAFT legacy CHECK execution closure; immutable v1.24 follows\n'), predecessor,
    Buffer.from(`\n-- BEGIN INTAKE LEGACY CHECK ACL ${sha(delta)}\n`), delta, Buffer.from('-- END INTAKE LEGACY CHECK ACL\n')]);
  const manifest = { schema: 'content-intake-legacy-check-installation/v1', status: 'DRAFT', freezeApproved: false, exportApproved: false, runtimeActivated: false,
    openapi: { path: `${development}/openapi.v1.22.yaml`, sha256: sha(openapi), unchanged: true },
    database: { path: CLOSURE_PATHS.database, sha256: sha(database) },
    predecessor: { path: `${development}/schema.v1.24.sql`, sha256: sha(predecessor),
      installation: `${development}/content-intake-csv-candidate/installation.generated.json`, installationSha256: sha(priorInstallation) },
    delta: { path: CLOSURE_PATHS.delta, sha256: sha(delta) }, dependencies,
    referenceMode: { completeDdl: CLOSURE_PATHS.database, includesPredecessorRoles: true, includesProductFunctionBodies: false, runtimeReady: false },
    productOrder: ['verified-v1.24-product-migrations-and-complete-runtime-ACL', 'legacy-check-acl', 'environment-startup'],
    atomicAppendOnly: true, grantee: 'intake_runtime_fn_owner', grantKind: 'EXECUTE', loginRoleGrants: false,
    tablePrivileges: false, membershipChanges: false, functionBodyChanges: false,
    exportCondition: 'Exact successor approval and versioned complete exporter/intake support are required; the existing CSV profile remains unchanged.' };
  return { database, manifest: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); if (args.length !== 1 || !['--write', '--check'].includes(args[0])) throw new Error('Use --write or --check');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const [name, bytes] of Object.entries(buildRuntimeClosure(file => readFileSync(path.join(root, file))))) {
    const target = path.join(root, CLOSURE_PATHS[name]);
    if (args[0] === '--write') writeFileSync(target, bytes); else if (!readFileSync(target).equals(bytes)) throw new Error(`Closure generated drift: ${name}`);
    console.log(`${name} ${sha(bytes)} ${bytes.length} bytes`);
  }
}
