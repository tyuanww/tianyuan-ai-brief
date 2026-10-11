import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildContractSetId } from './export_customer_agent_contract_set.mjs';
import { checkSopSideExport } from './export_customer_agent_sop_side.mjs';
import { buildSopContractSet } from './export_customer_agent_sop_contract_set.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const openapiPath = 'business-docs/01-客服Agent项目/30-开发-进行中/openapi.v1.23.yaml';
const schemaPath = 'business-docs/01-客服Agent项目/30-开发-进行中/schema.v1.26.sql';
const profilePath = 'business-docs/01-客服Agent项目/30-开发-进行中/contract-profile.v1.json';
const exporterPath = 'business-docs/08-工具/export_customer_agent_contract_set.mjs';

function read(file) {
  return readFileSync(path.join(root, file), 'utf8');
}

export function checkSopContractSetGate() {
  const side = checkSopSideExport();
  const openapiVersion = read(openapiPath).match(/^ {2}version:\s*([0-9]+(?:\.[0-9]+)*)\s*$/m)?.[1];
  const databaseVersion = read(schemaPath).match(/^--\s*(schema\.v[0-9]+(?:\.[0-9]+)*)\b/m)?.[1];
  if (openapiVersion !== '1.23.0' || databaseVersion !== 'schema.v1.26') {
    throw new Error(`SOP 合同版本不是已冻结的 1.23.0 / schema.v1.26：${openapiVersion} ${databaseVersion}`);
  }
  const profile = JSON.parse(read(profilePath)).profile;
  if (profile !== 'content-intake-legacy-check-v1') throw new Error('当前 profile 已被切换');
  const exporter = read(exporterPath);
  if (exporter.includes('content-intake-sop-xlsx-v1')) throw new Error('SOP profile 已进入正式导出器');
  if (!exporter.includes("manifest.openapi.version!==(isCsv?'1.22.0'")) throw new Error('正式导出器的版本门已经改变，需要重新核对');
  const successor = buildSopContractSet();
  if (successor.manifest.openapi.sha256 !== side.openapi.sha256 || successor.manifest.database.sha256 !== side.database.sha256) {
    throw new Error('正式后继合同集哈希偏离已冻结字节');
  }
  const sourceGitSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return {
    formalExportReady: true,
    productIntakeReady: false,
    reason: '后继合同集可单独导出；现行 profile 与 1.25 消费锁不替换',
    futureContractSetId: buildContractSetId({ openapiVersion, databaseVersion, sourceGitSha }),
    currentProfile: profile,
    sideStatus: side.status,
    openapiSha256: successor.manifest.openapi.sha256,
    databaseSha256: successor.manifest.database.sha256,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSopContractSetGate();
  console.log(`${result.formalExportReady ? 'READY' : 'BLOCKED'} ${result.futureContractSetId}`);
  console.log(result.reason);
}
