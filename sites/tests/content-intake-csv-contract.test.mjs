import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';
import {createRequire} from 'node:module';
import {buildCsvContractFiles,CSV_SOURCES,CSV_PATHS} from '../../business-docs/08-工具/build_customer_agent_csv_contract.mjs';
import {assertIntakeCsvExportGate} from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';
import {releaseSteps} from '../scripts/quality-plan.mjs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const digest=b=>createHash('sha256').update(b).digest('hex');
const protocol=JSON.parse(read(CSV_SOURCES.protocol));
const generated=buildCsvContractFiles(read);
const schemaMap=bytes=>Object.fromEntries(bytes.toString().split('\n').filter(line=>/^    Intake[A-Za-z]+: /.test(line)).map(line=>{const i=line.indexOf(': ');return [line.slice(4,i),JSON.parse(line.slice(i+2))];}));
const schemas=schemaMap(generated.openapi);
const ajv=new Ajv({strict:true,allErrors:true,allowUnionTypes:true});ajv.addKeyword('components');ajv.addFormat('date-time',value=>Number.isFinite(Date.parse(value)));
ajv.addSchema({$id:'urn:synthetic:intake-csv',components:{schemas}});
const validate=name=>ajv.compile({$ref:`urn:synthetic:intake-csv#/components/schemas/${name}`});
const xlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const source={operationId:'operation',expectedVersion:1,templateVersion:protocol.templateVersion,ruleVersion:protocol.ruleVersion,mappingVersion:protocol.mappingVersion,structureDigest:protocol.structureDigest};
test('CSV frozen candidate preserves predecessor and machine bytes under the exact independent approval',()=>{
 for(const [key,bytes] of Object.entries(generated)) assert.ok(bytes.equals(read(CSV_PATHS[key])));
 const prefix='business-docs/01-客服Agent项目/30-开发-进行中/';
 for(const [file,hash] of Object.entries(protocol.frozenPredecessor)) assert.equal(digest(read(prefix+file)),hash);
 assert.ok(generated.database.includes(read(prefix+'schema.v1.23.sql')));
 assert.match(generated.openapi.toString(),/  version: 1.22.0/);
 assert.equal(protocol.structureDigest,digest(JSON.stringify(protocol.headers)));
 assert.equal(protocol.freezeApproved||protocol.exportApproved||protocol.runtimeActivated,false);
 assert.equal(protocol.headers.length,23);
 assert.doesNotThrow(()=>assertIntakeCsvExportGate(read,{openapiHash:digest(generated.openapi),databaseHash:digest(generated.database)}));
 for(const step of ['test:intake-csv-contract','check:intake-csv-contract','lint:intake-csv-openapi']) assert.ok(releaseSteps.includes(step));
 const before=schemaMap(read(prefix+'openapi.v1.21.yaml'));
 const changed=new Set(['IntakeObject','IntakeSourceWrite','IntakeSource','IntakeMaterialHeader','IntakeMaterial','IntakePolicy','IntakeFailure']);
 for(const [name,schema] of Object.entries(before)) if(!changed.has(name)) assert.deepEqual(schemas[name],schema,name);
});
test('source registration only admits an exact CSV tuple or the existing XLSX pair',()=>{
 const check=validate('IntakeSourceWrite');assert.ok(check(source),JSON.stringify(check.errors));
 for(const [key,value] of [['templateVersion','faq-p1.1'],['ruleVersion','intake-p1.1'],['mappingVersion','arbitrary'],['structureDigest','a'.repeat(64)]]) assert.equal(check({...source,[key]:value}),false,key);
 assert.ok(check({...source,templateVersion:'faq-p1.1',ruleVersion:'intake-p1.1',mappingVersion:'existing-mapping',structureDigest:'a'.repeat(64)}));
});
test('material conditional couples MIME/template/rule/mapping and logical dataset without an XLSX disguise',()=>{
 // Compile the exact generated combination schema in isolation; the inherited full material is unchanged.
 const check=ajv.compile({type:'object',properties:{templateVersion:{type:'string'},ruleVersion:{type:'string'},mappingVersion:{type:'string'},object:{type:'object',properties:{mime:{type:'string'}}},selectedSheets:{type:'array'}},oneOf:schemas.IntakeMaterial.oneOf});
 const body={templateVersion:protocol.templateVersion,ruleVersion:protocol.ruleVersion,mappingVersion:protocol.mappingVersion,object:{mime:'text/csv'},selectedSheets:['CSV']};
 assert.ok(check(body),JSON.stringify(check.errors));
 for(const patch of [{object:{mime:xlsx}},{selectedSheets:['来源','FAQ','相似问法']},{ruleVersion:'intake-p1.1'},{mappingVersion:'unknown'}]) assert.equal(check({...body,...patch}),false);
 assert.ok(check({...body,templateVersion:'faq-p1.1',ruleVersion:'intake-p1.1',mappingVersion:'old',object:{mime:xlsx},selectedSheets:['来源','FAQ','相似问法']}));
 const object=validate('IntakeObject');const row={objectId:'object',sourceId:'source',sha256:'a'.repeat(64),mime:'text/csv',bytes:100};assert.ok(object(row),JSON.stringify(object.errors));assert.equal(object({...row,mime:'text/plain'}),false);
});
test('generator fails on drifted predecessor, altered headers and rewritten authority',()=>{
 const build=(file,value)=>buildCsvContractFiles(source=>source===file?Buffer.from(value):read(source));
 assert.throws(()=>build(CSV_SOURCES.protocol,JSON.stringify({...protocol,headers:protocol.headers.slice(1)})),/integrity/);
 assert.throws(()=>build(CSV_SOURCES.protocol,JSON.stringify({...protocol,frozenPredecessor:{...protocol.frozenPredecessor,'schema.v1.23.sql':'a'.repeat(64)}})),/predecessor/);
 assert.throws(()=>build(CSV_SOURCES.storage,'CREATE OR REPLACE FUNCTION content_intake.authorization_deadline()'),/authority/);
});
test('new complete schema and function bodies parse as PostgreSQL',async()=>{
 const parser=createRequire(import.meta.url)('@libpg-query/parser');await parser.loadModule();
 assert.ok(parser.parseSync(generated.database.toString()).stmts.length>0);
 assert.ok(parser.parsePlPgSQLSync(read(CSV_SOURCES.storage).toString()).plpgsql_funcs.length===5);
});

test('CSV first violating logical record and extra column fit the inherited HTTP coordinate',()=>{const check=validate('IntakeCoordinate');assert.ok(check({sheet:'CSV',row:5002,column:1}));assert.ok(check({sheet:'CSV',row:2,column:24}));assert.equal(check({sheet:'CSV',row:5003,column:1}),false);});
