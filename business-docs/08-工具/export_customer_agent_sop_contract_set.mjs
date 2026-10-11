import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContractSetId } from './export_customer_agent_contract_set.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const openapiSource = 'business-docs/01-客服Agent项目/30-开发-进行中/openapi.v1.23.yaml';
const databaseSource = 'business-docs/01-客服Agent项目/30-开发-进行中/schema.v1.26.sql';
export const SOP_CONTRACT_SET_SCHEMA = 'customer-agent-contract-set/v5';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function git(args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: args[0] === 'show' ? 'buffer' : 'utf8' });
}

export function buildSopContractSet() {
  const sourceGitSha = git(['rev-parse', 'HEAD']).toString().trim();
  const openapiBytes = git(['show', `${sourceGitSha}:${openapiSource}`]);
  const databaseBytes = git(['show', `${sourceGitSha}:${databaseSource}`]);
  if (!readFileSync(path.join(root, openapiSource)).equals(openapiBytes)) throw new Error('OpenAPI 1.23 工作树偏离已提交冻结字节');
  if (!readFileSync(path.join(root, databaseSource)).equals(databaseBytes)) throw new Error('schema 1.26 工作树偏离已提交冻结字节');
  const openapiHash = sha256(openapiBytes);
  const databaseHash = sha256(databaseBytes);
  const contractSetId = buildContractSetId({
    openapiVersion: '1.23.0',
    databaseVersion: 'schema.v1.26',
    sourceGitSha,
  });
  const manifest = {
    schema: SOP_CONTRACT_SET_SCHEMA,
    contract_set_id: contractSetId,
    source_repository: 'ai-赋能立项',
    source_git_sha: sourceGitSha,
    architecture_version: '1.16',
    implementation_version: '1.22',
    openapi: {
      version: '1.23.0',
      source_path: openapiSource,
      file: 'openapi.v1.yaml',
      sha256: openapiHash,
      bytes: openapiBytes.byteLength,
    },
    database: {
      version: 'schema.v1.26',
      source_path: databaseSource,
      file: 'schema-v1.26.sql',
      sha256: databaseHash,
      bytes: databaseBytes.byteLength,
    },
  };
  return {
    manifest,
    files: new Map([
      ['contract-set.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
      ['openapi.v1.yaml', openapiBytes],
      ['schema-v1.26.sql', databaseBytes],
    ]),
  };
}

export function assertNotSideExport(sourceDirectory) {
  const base = path.basename(sourceDirectory);
  if (base === 'sop-side-export.v1.json' || sourceDirectory.endsWith(`${path.sep}sop-side-export.v1.json`)) {
    throw new Error('sop-side-export.v1.json 不是正式合同集');
  }
}

export function writeSopContractSet(outputRoot = path.join(root, 'output/customer-agent-sop-contract-sets')) {
  const built = buildSopContractSet();
  const directory = path.join(outputRoot, built.manifest.contract_set_id);
  mkdirSync(directory, { recursive: true });
  for (const [name, bytes] of built.files) writeFileSync(path.join(directory, name), bytes);
  return { directory, contractSetId: built.manifest.contract_set_id, openapiSha256: built.manifest.openapi.sha256, databaseSha256: built.manifest.database.sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = writeSopContractSet();
  console.log(JSON.stringify({ status: 'SUCCESSOR_EXPORTED', ...written, currentProfile: 'content-intake-legacy-check-v1', mainLockReplaced: false }, null, 2));
}
