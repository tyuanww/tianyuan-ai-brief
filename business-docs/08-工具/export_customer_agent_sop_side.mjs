import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSopExportPreparation } from './prepare_customer_agent_sop_export.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const SOP_SIDE_EXPORT_PATH = 'business-docs/01-客服Agent项目/30-开发-进行中/sop-side-export.v1.json';

export function buildSopSideExport(preparation = checkSopExportPreparation()) {
  return `${JSON.stringify({
    schema: 'customer-agent-sop-side-export/v1',
    status: 'SIDE_EXPORTED_NOT_INTAKE',
    mainContractSetExported: false,
    intakeApproved: false,
    productionConsumerReady: false,
    syntheticOnly: true,
    currentProfile: preparation.currentProfile,
    sopProfile: preparation.sopProfile,
    sopProfileInExporterAllowlist: false,
    approval: 'business-docs/01-客服Agent项目/90-评审/2026-10-10_SOP旁路导出记录.md',
    openapi: preparation.openapi,
    database: preparation.database,
    productMigration: null,
    notEvidenceOf: ['customer-agent-contract-set export', 'product intake', 'production activation', 'complete /review'],
  }, null, 2)}\n`;
}

export function checkSopSideExport(read = file => readFileSync(path.join(root, file))) {
  const expected = buildSopSideExport();
  const actual = read(SOP_SIDE_EXPORT_PATH).toString('utf8');
  if (actual !== expected) throw new Error('SOP 旁路导出记录与冻结字节不一致');
  const parsed = JSON.parse(actual);
  if (parsed.mainContractSetExported !== false || parsed.intakeApproved !== false) throw new Error('SOP 旁路导出不能替代正式合同集或产品 intake');
  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? '--check';
  if (command === '--write') {
    writeFileSync(path.join(root, SOP_SIDE_EXPORT_PATH), buildSopSideExport());
    console.log(`wrote ${SOP_SIDE_EXPORT_PATH}`);
  } else if (command === '--check') {
    const parsed = checkSopSideExport();
    console.log(`${parsed.status} profile=${parsed.currentProfile} intakeApproved=${parsed.intakeApproved}`);
  } else {
    throw new Error('用法：--write 或 --check');
  }
}
