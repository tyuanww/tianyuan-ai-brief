import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const approvalPath = 'business-docs/01-客服Agent项目/90-评审/2026-10-10_SOP合同冻结批准.md';
const openapiPath = 'business-docs/01-客服Agent项目/30-开发-进行中/openapi.v1.23.yaml';
const schemaPath = 'business-docs/01-客服Agent项目/30-开发-进行中/schema.v1.26.sql';
const profilePath = 'business-docs/01-客服Agent项目/30-开发-进行中/contract-profile.v1.json';
const exporterPath = 'business-docs/08-工具/export_customer_agent_contract_set.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function hashAfter(markdown, label) {
  const line = markdown.split('\n').find(item => item.startsWith(label));
  const hash = line?.match(/[0-9a-f]{64}/)?.[0];
  if (!hash) throw new Error(`冻结批准缺少哈希：${label}`);
  return hash;
}

export function checkSopFreeze(read = file => readFileSync(path.join(root, file))) {
  const approval = read(approvalPath).toString('utf8');
  if (!approval.includes('FROZEN · NOT EXPORTED · NOT INTAKE')) throw new Error('SOP 冻结批准状态不对');
  if (!approval.includes('本批准不授权 export')) throw new Error('SOP 冻结批准不能同时放行 export');
  const profile = JSON.parse(read(profilePath).toString('utf8'));
  if (profile.profile !== 'content-intake-legacy-check-v1') throw new Error('当前合同 profile 必须保持 content-intake-legacy-check-v1');
  const exporter = read(exporterPath).toString('utf8');
  if (exporter.includes('content-intake-sop-xlsx-v1')) throw new Error('SOP profile 还不能进入导出器封闭名单');
  const expected = {
    openapi: hashAfter(approval, 'SHA-256 '),
    schema: hashAfter(approval.split('**批准 schema 1.26：**')[1] ?? '', 'SHA-256 '),
  };
  const openapi = read(openapiPath);
  const schema = read(schemaPath);
  const actual = { openapi: sha256(openapi), schema: sha256(schema) };
  if (actual.openapi !== expected.openapi) throw new Error(`OpenAPI 1.23 哈希偏离冻结批准：${actual.openapi}`);
  if (actual.schema !== expected.schema) throw new Error(`schema 1.26 哈希偏离冻结批准：${actual.schema}`);
  return { status: 'FROZEN_NOT_EXPORTED', ...actual, profile: profile.profile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSopFreeze();
  console.log(`${result.status} openapi=${result.openapi} schema=${result.schema} profile=${result.profile}`);
}
