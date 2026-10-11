import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSopFreeze } from './check_customer_agent_sop_freeze.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const SOP_EXPORT_PREPARATION_PATH = 'business-docs/01-客服Agent项目/30-开发-进行中/sop-export-preparation.v1.json';

export function buildSopExportPreparation(frozen = checkSopFreeze()) {
  return `${JSON.stringify({
    schema: 'customer-agent-sop-export-preparation/v1',
    status: 'PREPARED_NOT_EXPORTED',
    exportApproved: false,
    intakeApproved: false,
    productionConsumerReady: false,
    syntheticOnly: true,
    currentProfile: frozen.profile,
    sopProfile: 'content-intake-sop-xlsx-v1',
    sopProfileInExporterAllowlist: false,
    approval: 'business-docs/01-客服Agent项目/90-评审/2026-10-10_SOP合同冻结批准.md',
    openapi: {
      version: '1.23.0',
      path: 'business-docs/01-客服Agent项目/30-开发-进行中/openapi.v1.23.yaml',
      sha256: frozen.openapi,
    },
    database: {
      version: '1.26',
      path: 'business-docs/01-客服Agent项目/30-开发-进行中/schema.v1.26.sql',
      sha256: frozen.schema,
    },
    productMigration: null,
    notEvidenceOf: ['formal export', 'product intake', 'production activation', 'complete /review'],
  }, null, 2)}\n`;
}

export function checkSopExportPreparation(read = file => readFileSync(path.join(root, file))) {
  const expected = buildSopExportPreparation();
  const actual = read(SOP_EXPORT_PREPARATION_PATH).toString('utf8');
  if (actual !== expected) throw new Error('SOP 导出准备清单与冻结字节不一致');
  const parsed = JSON.parse(actual);
  if (parsed.exportApproved !== false || parsed.status !== 'PREPARED_NOT_EXPORTED') throw new Error('SOP 导出准备清单不能声称已经导出');
  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? '--check';
  if (command === '--write') {
    writeFileSync(path.join(root, SOP_EXPORT_PREPARATION_PATH), buildSopExportPreparation());
    console.log(`wrote ${SOP_EXPORT_PREPARATION_PATH}`);
  } else if (command === '--check') {
    const parsed = checkSopExportPreparation();
    console.log(`${parsed.status} profile=${parsed.currentProfile} exportApproved=${parsed.exportApproved}`);
  } else {
    throw new Error('用法：--write 或 --check');
  }
}
