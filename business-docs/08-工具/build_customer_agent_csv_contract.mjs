import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS } from './build_customer_agent_backend_contract.mjs';
import { fileURLToPath } from 'node:url';
const development = 'business-docs/01-客服Agent项目/30-开发-进行中';
export const CSV_SOURCES = Object.freeze({ protocol: `${development}/content-intake-csv-candidate/protocol.json`, storage: `${development}/content-intake-csv-candidate/storage.delta.sql` });
export const CSV_PATHS = Object.freeze({ openapi: `${development}/openapi.v1.22.yaml`, database: `${development}/schema.v1.24.sql`, installation: `${development}/content-intake-csv-candidate/installation.generated.json`, increment: `${development}/19-P2CSV资料输入合同候选.md` });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const oldMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function buildCsvContractFiles(read) {
  const protocol = JSON.parse(read(CSV_SOURCES.protocol));
  if (protocol.status !== 'DRAFT' || protocol.freezeApproved || protocol.exportApproved || protocol.runtimeActivated || protocol.headers.length !== 23
    || digest(JSON.stringify(protocol.headers)) !== protocol.structureDigest) throw new Error('CSV DRAFT protocol integrity');
  const oldOpenapi = read(`${development}/openapi.v1.21.yaml`);
  const oldDatabase = read(`${development}/schema.v1.23.sql`);
  if (digest(oldOpenapi) !== protocol.frozenPredecessor['openapi.v1.21.yaml'] || digest(oldDatabase) !== protocol.frozenPredecessor['schema.v1.23.sql']) throw new Error('CSV frozen predecessor drift');
  let openapi = oldOpenapi.toString('utf8').replace('  version: 1.21.0\n', '  version: 1.22.0\n');
  const edit = (name, fn) => {
    const prefix = `    ${name}: `;
    const lines = openapi.split('\n').filter(line => line.startsWith(prefix));
    if (lines.length !== 1) throw new Error(`CSV schema anchor ${name}`);
    openapi = openapi.replace(lines[0], prefix + JSON.stringify(fn(JSON.parse(lines[0].slice(prefix.length)))));
  };
  const editPath = (route, fn) => {
    const prefix = `  ${JSON.stringify(route)}: `;
    const lines = openapi.split('\n').filter(line => line.startsWith(prefix));
    if (lines.length !== 1) throw new Error(`CSV route anchor ${route}`);
    openapi = openapi.replace(lines[0], prefix + JSON.stringify(fn(JSON.parse(lines[0].slice(prefix.length)))));
  };
  editPath('/v1/intake/sources/{sourceId}/objects', item => {
    item.post.summary='接收来源已登记格式的原始 XLSX 或 CSV 对象';
    item.post.responses['201'].description=item.post.summary;
    item.post.description+='来源版本决定唯一允许格式；不依据扩展名、MIME 或文件内范围授予权限。CSV 原始字节保留，服务端独立复算 SHA-256 并按 CSV 协议解析，不转换为 XLSX 后冒充原件。来源登记与 MIME/模板/规则/结构组合不符返回 SOURCE_FORMAT_MISMATCH。';
    item.post.requestBody.content['multipart/form-data'].encoding.file.contentType=oldMime+', text/csv';
    return item;
  });
  editPath('/v1/intake/sources/{sourceId}/template', item => {
    item.get.description+='按已登记来源模板版本返回 XLSX 或 UTF-8 CSV；CSV 只有固定有序 23 列，来源元信息预填且不授予范围。';
    item.get.responses['200'].content['text/csv']={schema:{type:'string',format:'binary'}};
    return item;
  });
  const pair = (csv, material = false) => ({ required: ['templateVersion', 'ruleVersion', ...(material ? ['selectedSheets'] : [])], properties: {
    templateVersion: { const: csv ? protocol.templateVersion : 'faq-p1.1' }, ruleVersion: { const: csv ? protocol.ruleVersion : 'intake-p1.1' },
    ...(csv ? { mappingVersion: { const: protocol.mappingVersion }, ...(!material ? { structureDigest: { const: protocol.structureDigest } } : {}) } : {}),
    ...(material ? { object: { type: 'object', properties: { mime: { const: csv ? protocol.mime : oldMime } } }, selectedSheets: { const: csv ? protocol.selectedSheets : ['来源', 'FAQ', '相似问法'] } } : {}),
  } });
  edit('IntakeObject', schema => { schema.properties.mime.enum = [oldMime, protocol.mime]; return schema; });
  for (const name of ['IntakeSourceWrite','IntakeSource']) edit(name, schema => ({ ...schema, oneOf: [pair(false), pair(true)] }));
  for (const name of ['IntakeMaterialHeader','IntakeMaterial']) edit(name, schema => ({ ...schema, oneOf: [pair(false,true), pair(true,true)] }));
  edit('IntakePolicy', schema => {
    schema.required.push('inputFormats');
    schema.properties.inputFormats = { type: 'array', minItems: 2, maxItems: 2, prefixItems: [
      { const: { mime: oldMime, templateVersion: 'faq-p1.1', ruleVersion: 'intake-p1.1', selectedSheets: ['来源','FAQ','相似问法'] } },
      { const: { mime: protocol.mime, templateVersion: protocol.templateVersion, ruleVersion: protocol.ruleVersion, mappingVersion: protocol.mappingVersion, structureDigest: protocol.structureDigest, selectedSheets: protocol.selectedSheets } },
    ], items: false };
    return schema;
  });
  edit('IntakeFailure', schema => { schema.properties.details.properties.reason.enum.push('SOURCE_FORMAT_MISMATCH'); return schema; });
  openapi += '\nx-content-intake-csv-development: ' + JSON.stringify({ status:'DRAFT', freezeApproved:false, exportApproved:false, runtime_activated:false, sqlContract:'schema.v1.24', protocolSha256:digest(read(CSV_SOURCES.protocol)), originalBytesRequired:true, rawHashBeforeParse:true })+'\n';
  const storage = read(CSV_SOURCES.storage);
  if (/CREATE(?: OR REPLACE)? FUNCTION content_intake\.(?:authorization_deadline|publish_candidate|preview_rollback|execute_rollback)/i.test(storage)) throw new Error('CSV cannot replace business authority');
  const database=Buffer.concat([Buffer.from('-- schema.v1.24 — DRAFT CSV format; frozen predecessor follows unchanged\n'),oldDatabase,Buffer.from(`\n-- BEGIN INTAKE CSV ${digest(storage)}\n`),storage,Buffer.from('-- END INTAKE CSV\n')]);
  const installation=JSON.parse(read(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.installation));
  installation.sqlContract='schema.v1.24';
  installation.openapi={path:CSV_PATHS.openapi,sha256:digest(Buffer.from(openapi))};
  installation.database={path:CSV_PATHS.database,sha256:digest(database)};
  installation.sources.csv={path:CSV_SOURCES.storage,sha256:digest(storage)};
  installation.sources.csvProtocol={path:CSV_SOURCES.protocol,sha256:digest(read(CSV_SOURCES.protocol))};
  installation.referenceMode.includes.push('csv');
  installation.productMode.order.splice(installation.productMode.order.indexOf('acl'),0,'csv');
  installation.productMode.csvInputImplementationRequired=true;
  installation.productMode.csvProductionConsumerReady=false;
  installation.requiredBundleArtifacts.push('csv','csvProtocol');
  installation.exporterCondition='CSV v3 requires exact frozen pair and installation approval; no runtime activation or CSV product implementation is implied.';
  return {openapi:Buffer.from(openapi),database,installation:Buffer.from(JSON.stringify(installation,null,2)+'\n')};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2); if(args.length!==1 || !['--write','--check'].includes(args[0])) throw new Error('Use --write or --check');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  for(const [name,bytes] of Object.entries(buildCsvContractFiles(source=>readFileSync(path.join(root,source))))) {
    const target=path.join(root,CSV_PATHS[name]);
    if(args[0]==='--write') writeFileSync(target,bytes); else if(!readFileSync(target).equals(bytes)) throw new Error(`CSV generated drift: ${name}`);
    console.log(`${name} ${digest(bytes)} ${bytes.length} bytes`);
  }
}
