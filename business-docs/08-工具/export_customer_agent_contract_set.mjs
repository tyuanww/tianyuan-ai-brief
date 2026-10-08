#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OWNER_PROFILE_PATH, OWNER_CONTRACT_PATHS, buildOwnerContractFiles,
} from "./build_customer_agent_owner_contract.mjs";

import {
  BACKEND_CONTRACT_PATHS,
  buildBackendContractFiles,
  CLOSURE_CONTRACT_PATHS,
  buildClosureContractFiles,
  OPS_LOOP_CONTRACT_PATHS,
  buildOpsLoopContractFiles,
  COACH_PUBLISH_CONTRACT_PATHS,
  buildCoachPublishContractFiles,
  INTAKE_CONTRACT_PATHS,
  INTAKE_APPROVAL_PATH,
  buildIntakeContractFiles,
  INTAKE_USAGE_CONTRACT_PATHS,
  INTAKE_USAGE_APPROVAL_PATH,
  buildIntakeUsageContractFiles,
  INTAKE_QUALITY_CONTRACT_PATHS,
  INTAKE_QUALITY_APPROVAL_PATH,
  buildIntakeQualityContractFiles,
  INTAKE_MANAGEMENT_CONTRACT_PATHS,
  INTAKE_MANAGEMENT_APPROVAL_PATH,
  buildIntakeManagementContractFiles,
  INTAKE_DIRECT_CONTRACT_PATHS,
  INTAKE_DIRECT_APPROVAL_PATH,
  buildIntakeDirectContractFiles,
  buildIntakeShopDirectoryContractFiles, INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS, INTAKE_SHOP_DIRECTORY_SOURCES, INTAKE_RUNTIME_SOURCES,
} from "./build_customer_agent_backend_contract.mjs";

import { buildCsvContractFiles, CSV_PATHS, CSV_SOURCES } from "./build_customer_agent_csv_contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "../..");
const defaultOutputRoot = path.join(repositoryRoot, "output/customer-agent-contract-sets");

export const CONTRACT_SET_SCHEMA = "customer-agent-contract-set/v1";
export const CONTRACT_SET_TOOL_VERSION = "1.9.0";
export const RUNTIME_CONTRACT_SET_SCHEMA = "customer-agent-contract-set/v2";
export const INTAKE_RUNTIME_APPROVAL_PATH = "business-docs/01-客服Agent项目/90-评审/2026-10-08_P2运行接入合同批准.md";
export const RUNTIME_BUNDLE_PATHS = Object.freeze({
  installation: {source_path:INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.installation,file:'intake-runtime-installation.v1.json'},
  roles: {source_path:INTAKE_RUNTIME_SOURCES.roles,file:'intake-runtime-roles.v1.sql'},
  organization: {source_path:INTAKE_RUNTIME_SOURCES.organization,file:'intake-runtime-organization.v1.sql'},
  session: {source_path:INTAKE_RUNTIME_SOURCES.session,file:'intake-runtime-session.v1.sql'},
  acl: {source_path:INTAKE_RUNTIME_SOURCES.acl,file:'intake-runtime-acl.v1.sql'},
  directoryAcl: {source_path:INTAKE_RUNTIME_SOURCES.directoryAcl,file:'intake-runtime-directory-acl.v1.sql'},
  directory: {source_path:INTAKE_SHOP_DIRECTORY_SOURCES.storage,file:'intake-shop-directory.v1.sql'},
  provenance: {source_path:'business-docs/01-客服Agent项目/30-开发-进行中/content-intake-runtime-candidate/provenance.json',file:'intake-runtime-provenance.v1.json'},
  protocol: {source_path:'business-docs/01-客服Agent项目/30-开发-进行中/content-intake-runtime-candidate/protocol.json',file:'intake-runtime-protocol.v1.json'},
});


export const CSV_CONTRACT_SET_SCHEMA = "customer-agent-contract-set/v3";
export const INTAKE_CSV_APPROVAL_PATH = "business-docs/01-客服Agent项目/90-评审/2026-10-08_P2CSV输入合同批准.md";
export const CSV_BUNDLE_PATHS = Object.freeze({...RUNTIME_BUNDLE_PATHS,
  installation:{source_path:CSV_PATHS.installation,file:'intake-csv-installation.v1.json'},
  csv:{source_path:CSV_SOURCES.storage,file:'intake-csv-format.v1.sql'},
  csvProtocol:{source_path:CSV_SOURCES.protocol,file:'intake-csv-protocol.v1.json'},
});
export function assertIntakeCsvExportGate(readSource,hashes) {
  assertFrozenIntakePair(readSource,hashes,{paths:CSV_PATHS,predecessor:INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS,
    approvalPath:INTAKE_CSV_APPROVAL_PATH,label:'P2 CSV 输入合同',anchor:'**P2 CSV 机器合同增量：**'});
  const generated=buildCsvContractFiles(readSource);
  for(const key of ['openapi','database','installation']) if(!readSource(CSV_PATHS[key]).equals(generated[key])) throw new Error(`CSV 派生产物漂移：${key}`);
  for(const [file,anchor] of [[INTAKE_CSV_APPROVAL_PATH,'**批准安装清单：**'],[CSV_PATHS.increment,'**CSV 安装清单：**']]) {
    const lines=linesForAnchor(utf8(readSource(file),file),file,anchor);
    if(lines.length!==1 || lines[0].match(/[0-9a-f]{64}/g)?.join()!==sha256(generated.installation)) throw new Error('CSV 安装清单批准哈希不一致');
  }
  return JSON.parse(generated.installation);
}


export const CONTRACT_SOURCE_PATHS = Object.freeze({
  architecture: "business-docs/01-客服Agent项目/20-设计-进行中/37-架构SSOT-v1.md",
  apiSemantics: "business-docs/01-客服Agent项目/20-设计-进行中/39-API合同与发布状态机-v1.md",
  nfr: "business-docs/01-客服Agent项目/20-设计-进行中/41-NFR扩展并发与防改崩.md",
  implementation:
    "business-docs/01-客服Agent项目/20-设计-进行中/46-实现设计-开工包.md",
  developmentIncrement:
    "business-docs/01-客服Agent项目/30-开发-进行中/01-DEV-M1搜索合同增量.md",
  openapi: "business-docs/01-客服Agent项目/20-设计-进行中/openapi.v1.yaml",
  database: "business-docs/01-客服Agent项目/20-设计-进行中/33-schema-v1-草案.sql",
});

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const REQUIRED_MANIFEST_KEYS = Object.freeze([
  "architecture_version",
  "contract_set_id",
  "database",
  "implementation_version",
  "openapi",
  "schema",
  "source_git_sha",
  "source_repository",
]);
const REQUIRED_CONTRACT_KEYS = Object.freeze([
  "bytes",
  "file",
  "sha256",
  "source_path",
  "version",
]);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function utf8(buffer, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(`${label} 不是合法 UTF-8，拒绝生成合同集`);
  }
}

function runGit(repository, args, { allowFailure = false, encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, {
    cwd: repository,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : result.stdout;
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`git ${args[0]} 失败：${`${stdout ?? ""}${stderr ?? ""}`.trim()}`);
  }
  return result;
}

function gitText(repository, args) {
  return String(runGit(repository, args).stdout).trim();
}

function gitBlob(repository, sourceGitSha, sourcePath) {
  const blobOid = gitText(repository, ["rev-parse", "--verify", `${sourceGitSha}:${sourcePath}`]);
  const objectType = gitText(repository, ["cat-file", "-t", blobOid]);
  if (objectType !== "blob") {
    throw new Error(`来源对象不是普通 Git blob：${sourcePath}`);
  }
  return runGit(repository, ["cat-file", "blob", blobOid], { encoding: null }).stdout;
}

function normalizeExpectedHash(value, label, { required = true } = {}) {
  if (value == null || value === "") {
    if (!required) return null;
    throw new Error(`缺少 ${label}`);
  }
  const normalized = String(value).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} 必须是 64 位 SHA-256`);
  return normalized;
}

export function resolveExactSourceCommit(repository, sourceGitSha) {
  const normalized = String(sourceGitSha ?? "").toLowerCase();
  if (!GIT_SHA_PATTERN.test(normalized)) {
    throw new Error("--source-git-sha 必须是完整 40 位 commit SHA，禁止使用 HEAD、分支或短 SHA");
  }
  const resolved = gitText(repository, ["rev-parse", "--verify", `${normalized}^{commit}`]).toLowerCase();
  if (resolved !== normalized) throw new Error("来源 commit 解析结果与请求 SHA 不一致");
  return resolved;
}

function extractOpenapiVersion(source) {
  const infoBlock = source.match(/^info:\s*\r?\n(?:(?: {2,}[^\n]*)(?:\r?\n|$))+/m)?.[0] ?? "";
  const version = infoBlock.match(/^ {2}version:\s*["']?([0-9]+(?:\.[0-9]+)*)["']?\s*$/m)?.[1];
  if (!version) throw new Error("无法从 OpenAPI info.version 提取合同版本");
  return version;
}

function extractDatabaseVersion(source) {
  const version = source.match(/^--\s*(schema\.v[0-9]+(?:\.[0-9]+)*)\b/m)?.[1];
  if (!version) throw new Error("无法从 reference DDL 首部提取 schema 版本");
  return version;
}

function extractArchitectureVersion(source) {
  const version = source.match(/当前\s+v([0-9]+(?:\.[0-9]+)*)/)?.[1];
  if (!version) throw new Error("无法从 37 架构 SSOT 提取当前版本");
  return version;
}

function extractImplementationVersion(source) {
  const version = source.match(/>\s*\*\*日期：\*\*[^\n]*?·\s*v([0-9]+(?:\.[0-9]+)*)/)?.[1];
  if (!version) throw new Error("无法从 46 实现设计开工包提取当前版本");
  return version;
}

function assertLineCarriesHashes(line, label, databaseHash, openapiHash) {
  if (!line.includes(databaseHash) || !line.includes(openapiHash)) {
    throw new Error(`${label} 与机器文件双哈希不一致，拒绝生成合同集：${line.trim()}`);
  }
}

function linesForAnchor(source, label, anchor) {
  const lines = source.split(/\r?\n/).filter((line) => line.includes(anchor));
  if (lines.length === 0) throw new Error(`${label} 缺少锚点“${anchor}”`);
  return lines;
}

function hashPairFromLine(line, label) {
  const hashes = line.match(/[0-9a-f]{64}/g) ?? [];
  if (hashes.length !== 2) {
    throw new Error(`${label} 必须且只能包含 DDL / OpenAPI 两个 SHA-256：${line.trim()}`);
  }
  return { databaseHash: hashes[0], openapiHash: hashes[1] };
}

function assertFrozenDesignAlignment({ architecture, implementation }) {
  const architectureLines = linesForAnchor(
    architecture,
    "37 架构 SSOT 冻结合同声明",
    "**DEC-042 内容资产治理：**",
  );
  if (architectureLines.length !== 1) {
    throw new Error("37 架构 SSOT 冻结合同声明必须唯一");
  }
  const frozen = hashPairFromLine(architectureLines[0], "37 架构 SSOT 冻结合同声明");
  for (const anchor of ["机器合同已锁定为", "实际产物必须精确匹配"]) {
    for (const line of linesForAnchor(implementation, "46 实现设计冻结合同声明", anchor)) {
      assertLineCarriesHashes(
        line,
        `46 ${anchor} 与 Ddev 冻结基线`,
        frozen.databaseHash,
        frozen.openapiHash,
      );
    }
  }
}

export function assertNormativeContractAlignment({
  architecture,
  apiSemantics,
  implementation,
  developmentIncrement,
  databaseHash,
  openapiHash,
}) {
  assertFrozenDesignAlignment({ architecture, implementation });

  for (const [label, source, anchor] of [
    ["DEV-M1 开发增量当前声明", developmentIncrement, "**DEV-M1 机器合同增量：**"],
    ["DEV-M1 开发增量产物声明", developmentIncrement, "**实际产物必须精确匹配：**"],
  ]) {
    for (const line of linesForAnchor(source, label, anchor)) {
      assertLineCarriesHashes(line, label, databaseHash, openapiHash);
    }
  }

  // 39 is a frozen human-readable transaction contract. A runtime-discovered machine-only
  // correction must not rewrite it; instead the live development increment carries both the
  // predecessor lineage and the current machine hash. Require those two independent documents
  // to agree on the predecessor so an arbitrary stale 39 hash cannot silently pass export.
  const apiLines = linesForAnchor(
    apiSemantics,
    "39 API 合同冻结声明",
    "**DEC-042 边界 / ENG-T1 修正：**",
  );
  const predecessorLines = linesForAnchor(
    developmentIncrement,
    "DEV-M1 直接前序机器合同声明",
    "**直接前序机器合同：**",
  );
  if (apiLines.length !== 1 || predecessorLines.length !== 1) {
    throw new Error("39 与 DEV-M1 直接前序机器合同声明必须各自唯一");
  }
  const apiPair = hashPairFromLine(apiLines[0], "39 API 合同冻结声明");
  const predecessorPair = hashPairFromLine(
    predecessorLines[0],
    "DEV-M1 直接前序机器合同声明",
  );
  if (
    apiPair.databaseHash !== predecessorPair.databaseHash
    || apiPair.openapiHash !== predecessorPair.openapiHash
    || apiPair.openapiHash !== openapiHash
  ) {
    throw new Error("39 API 合同冻结声明与 DEV-M1 直接前序机器合同链不一致");
  }
}

export function buildContractSetId({ openapiVersion, databaseVersion, sourceGitSha }) {
  const databaseShort = databaseVersion.replace(/^schema\.v/, "");
  for (const [label, value] of [
    ["OpenAPI 版本", openapiVersion],
    ["数据库版本", databaseShort],
  ]) {
    if (!/^[0-9]+(?:\.[0-9]+)*$/.test(value)) throw new Error(`${label} 不能安全用于合同集 ID`);
  }
  if (!GIT_SHA_PATTERN.test(sourceGitSha)) throw new Error("合同集 ID 缺少完整来源 SHA");
  return `cs-ai-c11-openapi-${openapiVersion}-schema-${databaseShort}-${sourceGitSha.slice(0, 12)}`;
}

export function renderContractSetManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function assertFrozenIntakePair(readSource, {databaseHash, openapiHash}, {paths, predecessor, approvalPath, label, anchor: incrementAnchor}) {
  const increment = utf8(readSource(paths.increment), label);
  if (!/^> 状态：FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY\r?$/m.test(increment)) {
    throw new Error(`${label}未冻结`);
  }
  for (const [anchor, ddl, api] of [
    ["**直接前序机器合同：**", sha256(readSource(predecessor.database)), sha256(readSource(predecessor.openapi))],
    [incrementAnchor, databaseHash, openapiHash],
    ["**实际产物必须精确匹配：**", databaseHash, openapiHash],
  ]) {
    const lines = linesForAnchor(increment, label, anchor);
    if (lines.length !== 1) throw new Error(`P2 合同声明必须唯一：${anchor}`);
    hashPairFromLine(lines[0], anchor);
    assertLineCarriesHashes(lines[0], anchor, ddl, api);
  }
  const approval = utf8(readSource(approvalPath), `${label}批准`);
  if (!/^> 状态：APPROVED · CONTRACT ONLY · SYNTHETIC DEVELOPMENT ONLY\r?$/m.test(approval)) {
    throw new Error(`缺 ${label}增量批准；前序批准不覆盖本次`);
  }
  const approved = linesForAnchor(approval, "P2 合同批准", "**批准产物：**");
  if (approved.length !== 1) throw new Error("P2 批准必须绑定唯一成对哈希");
  hashPairFromLine(approved[0], "P2 批准");
  assertLineCarriesHashes(approved[0], "P2 批准", databaseHash, openapiHash);
}

export function assertIntakeExportGate(readSource, hashes) {
  assertFrozenIntakePair(readSource, hashes, {
    paths: INTAKE_CONTRACT_PATHS, predecessor: COACH_PUBLISH_CONTRACT_PATHS,
    approvalPath: INTAKE_APPROVAL_PATH, label: 'P2 资料接入合同', anchor: '**P2 机器合同增量：**',
  });
}

export function assertIntakeUsageExportGate(readSource, hashes) {
  assertFrozenIntakePair(readSource, hashes, {
    paths: INTAKE_USAGE_CONTRACT_PATHS, predecessor: INTAKE_CONTRACT_PATHS,
    approvalPath: INTAKE_USAGE_APPROVAL_PATH, label: 'P2 使用资格合同', anchor: '**P2 使用资格机器合同增量：**',
  });
}

export function assertIntakeQualityExportGate(readSource, hashes) {
  assertFrozenIntakePair(readSource, hashes, {
    paths: INTAKE_QUALITY_CONTRACT_PATHS, predecessor: INTAKE_USAGE_CONTRACT_PATHS,
    approvalPath: INTAKE_QUALITY_APPROVAL_PATH, label: 'P2 质量 HTTP 合同', anchor: '**P2 质量机器合同增量：**',
  });
}

export function assertIntakeManagementExportGate(readSource, hashes) {
  assertFrozenIntakePair(readSource, hashes, {
    paths: INTAKE_MANAGEMENT_CONTRACT_PATHS, predecessor: INTAKE_QUALITY_CONTRACT_PATHS,
    approvalPath: INTAKE_MANAGEMENT_APPROVAL_PATH, label: 'P2 管理上下文合同', anchor: '**P2 管理上下文机器合同增量：**',
  });
}

export function assertIntakeDirectExportGate(readSource, hashes) {
  assertFrozenIntakePair(readSource, hashes, {
    paths: INTAKE_DIRECT_CONTRACT_PATHS, predecessor: INTAKE_MANAGEMENT_CONTRACT_PATHS,
    approvalPath: INTAKE_DIRECT_APPROVAL_PATH, label: 'P2 确认直发合同', anchor: '**P2 确认直发机器合同增量：**',
  });
}

export function assertIntakeRuntimeExportGate(readSource, hashes) {
  assertFrozenIntakePair(readSource, hashes, {
    paths:INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS, predecessor:INTAKE_DIRECT_CONTRACT_PATHS,
    approvalPath:INTAKE_RUNTIME_APPROVAL_PATH,label:'P2 运行接入合同',anchor:'**P2 运行接入机器合同增量：**',
  });
  const generated=buildIntakeShopDirectoryContractFiles(readSource);
  for (const key of ['openapi','database','installation']) {
    if (!readSource(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS[key]).equals(generated[key])) throw new Error(`运行接入派生产物漂移：${key}`);
  }
  const installHash=sha256(generated.installation);
  for (const [file,anchor] of [[INTAKE_RUNTIME_APPROVAL_PATH,'**批准安装清单：**'],[INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.increment,'**运行安装清单：**']]) {
    const lines=linesForAnchor(utf8(readSource(file),file),file,anchor);
    if (lines.length!==1 || lines[0].match(/[0-9a-f]{64}/g)?.join()!==installHash) throw new Error('运行安装清单批准哈希不一致');
  }
  const install=JSON.parse(generated.installation);
  const provenance=JSON.parse(readSource(RUNTIME_BUNDLE_PATHS.provenance.source_path));
  if (JSON.stringify(install.productMode.implementation)!==JSON.stringify(provenance.implementationDependencies)) throw new Error('运行overlay依赖不一致');
  return install;
}

export function loadContractSetFromCommit({
  repository = repositoryRoot,
  sourceGitSha,
  expectedOpenapiSha256,
  expectedDatabaseSha256,
}) {
  const exactSourceGitSha = resolveExactSourceCommit(repository, sourceGitSha);
  // Approval milestones are historical. A shallow boundary can hide a removed
  // approval and make a downgraded profile look like an unapproved predecessor.
  if (gitText(repository, ["rev-parse", "--is-shallow-repository"]) !== "false") {
    throw new Error("合同导出需要完整 Git 历史；浅克隆无法证明批准里程碑，拒绝导出");
  }
  const readSource = (sourcePath) => gitBlob(repository, exactSourceGitSha, sourcePath);
  // Missing profile is supported only for historical commits. A present but invalid profile
  // fails closed; neither the working tree nor a manifest may select source paths.
  const profileObject = runGit(repository, ["ls-tree", exactSourceGitSha, "--", OWNER_PROFILE_PATH]);
  const ownerProfile = String(profileObject.stdout).trim() !== "";
  if (!ownerProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", OWNER_PROFILE_PATH])) {
    throw new Error("来源 commit 删除了既有合同 profile，拒绝降级历史合同");
  }
  let backendProfile = false;
  let closureProfile = false;
  let opsLoopProfile = false;
  let coachPublishProfile = false;
  let intakeProfile = false;
  let intakeUsageProfile = false;
  let intakeQualityProfile = false;
  let intakeManagementProfile = false;
  let intakeDirectProfile = false;
  let intakeRuntimeProfile = false;
  let intakeCsvProfile = false;
  if (ownerProfile) {
    const profile = JSON.parse(utf8(readSource(OWNER_PROFILE_PATH), OWNER_PROFILE_PATH));
    if (Object.keys(profile).sort().join(",") !== "profile,schema"
        || profile.schema !== "customer-agent-contract-profile/v1"
        || !["owner-acceptance-v1", "backend-synthetic-v1", "backend-closure-v1", "ops-loop-v1", "coach-publish-v1", "content-intake-v2", "content-intake-usage-v1", "content-intake-quality-v1", "content-intake-management-v1", "content-intake-direct-v1", "content-intake-runtime-v1", "content-intake-csv-v1"].includes(profile.profile)) {
      throw new Error("未知或不封闭的合同来源 profile");
    }
    intakeCsvProfile = profile.profile === "content-intake-csv-v1";
    intakeRuntimeProfile = intakeCsvProfile || profile.profile === "content-intake-runtime-v1";
    intakeDirectProfile = intakeRuntimeProfile || profile.profile === "content-intake-direct-v1";
    intakeManagementProfile = intakeDirectProfile || profile.profile === "content-intake-management-v1";
    intakeQualityProfile = intakeManagementProfile || profile.profile === "content-intake-quality-v1";
    intakeUsageProfile = intakeQualityProfile || profile.profile === "content-intake-usage-v1";
    intakeProfile = intakeUsageProfile || profile.profile === "content-intake-v2";
    coachPublishProfile = intakeProfile || profile.profile === "coach-publish-v1";
    opsLoopProfile = coachPublishProfile || profile.profile === "ops-loop-v1";
    closureProfile = profile.profile === "backend-closure-v1";
    backendProfile = opsLoopProfile || closureProfile || profile.profile === "backend-synthetic-v1";
  }
  if (!backendProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", BACKEND_CONTRACT_PATHS.increment])) {
    throw new Error("来源 commit 已存在后端合同历史，拒绝降级 owner profile");
  }
  if (!closureProfile && !opsLoopProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", CLOSURE_CONTRACT_PATHS.increment])) throw new Error("拒绝降级 closure profile");
  if (!opsLoopProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", OPS_LOOP_CONTRACT_PATHS.database])) throw new Error("拒绝降级 ops-loop profile");
  if (!coachPublishProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", COACH_PUBLISH_CONTRACT_PATHS.database])) throw new Error("拒绝降级 coach-publish profile");
  // A draft may coexist with the current frozen profile. Only an approval milestone
  // makes a subsequent downgrade illegal; creating a candidate is not approval.
  if (!intakeProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", INTAKE_APPROVAL_PATH])) throw new Error("拒绝降级 content-intake profile");
  if (!intakeUsageProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", INTAKE_USAGE_APPROVAL_PATH])) throw new Error("拒绝降级 content-intake-usage profile");
  if (!intakeQualityProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", INTAKE_QUALITY_APPROVAL_PATH])) throw new Error("拒绝降级 content-intake-quality profile");
  if (!intakeManagementProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", INTAKE_MANAGEMENT_APPROVAL_PATH])) throw new Error("拒绝降级 content-intake-management profile");
  if (!intakeDirectProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", INTAKE_DIRECT_APPROVAL_PATH])) throw new Error("拒绝降级 content-intake-direct profile");
  if (!intakeRuntimeProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", INTAKE_RUNTIME_APPROVAL_PATH])) throw new Error("拒绝降级 content-intake-runtime profile");
  if (!intakeCsvProfile && gitText(repository, ["log", "--full-history", "-1", "--format=%H", exactSourceGitSha, "--", INTAKE_CSV_APPROVAL_PATH])) throw new Error("拒绝降级 content-intake-csv profile");
  const sourcePaths = intakeCsvProfile
    ? { ...CONTRACT_SOURCE_PATHS,openapi:CSV_PATHS.openapi,database:CSV_PATHS.database }
    : intakeRuntimeProfile
    ? { ...CONTRACT_SOURCE_PATHS,openapi:INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.openapi,database:INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.database }
    : intakeDirectProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: INTAKE_DIRECT_CONTRACT_PATHS.openapi, database: INTAKE_DIRECT_CONTRACT_PATHS.database }
    : intakeManagementProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: INTAKE_MANAGEMENT_CONTRACT_PATHS.openapi, database: INTAKE_MANAGEMENT_CONTRACT_PATHS.database }
    : intakeQualityProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: INTAKE_QUALITY_CONTRACT_PATHS.openapi, database: INTAKE_QUALITY_CONTRACT_PATHS.database }
    : intakeUsageProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: INTAKE_USAGE_CONTRACT_PATHS.openapi, database: INTAKE_USAGE_CONTRACT_PATHS.database }
    : intakeProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: INTAKE_CONTRACT_PATHS.openapi, database: INTAKE_CONTRACT_PATHS.database }
    : coachPublishProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: COACH_PUBLISH_CONTRACT_PATHS.openapi, database: COACH_PUBLISH_CONTRACT_PATHS.database }
    : opsLoopProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: OPS_LOOP_CONTRACT_PATHS.openapi, database: OPS_LOOP_CONTRACT_PATHS.database }
    : closureProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: CLOSURE_CONTRACT_PATHS.openapi, database: CLOSURE_CONTRACT_PATHS.database }
    : backendProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: BACKEND_CONTRACT_PATHS.openapi, database: BACKEND_CONTRACT_PATHS.database }
    : ownerProfile
    ? { ...CONTRACT_SOURCE_PATHS, openapi: OWNER_CONTRACT_PATHS.openapi, database: OWNER_CONTRACT_PATHS.database }
    : CONTRACT_SOURCE_PATHS;
  const buffers = Object.fromEntries(Object.entries(sourcePaths).map(([key, sourcePath]) => [key, readSource(sourcePath)]));
  const sources = Object.fromEntries(
    Object.entries(buffers).map(([key, value]) => [key, utf8(value, sourcePaths[key])]),
  );
  const openapiHash = sha256(buffers.openapi);
  const databaseHash = sha256(buffers.database);
  const expectedOpenapi = normalizeExpectedHash(expectedOpenapiSha256, "OpenAPI 预期 SHA-256");
  const expectedDatabase = normalizeExpectedHash(expectedDatabaseSha256, "DDL 预期 SHA-256");
  if (openapiHash !== expectedOpenapi) {
    throw new Error(`OpenAPI blob 哈希不匹配：expected=${expectedOpenapi} actual=${openapiHash}`);
  }
  if (databaseHash !== expectedDatabase) {
    throw new Error(`DDL blob 哈希不匹配：expected=${expectedDatabase} actual=${databaseHash}`);
  }

  const predecessorDatabaseHash = ownerProfile ? sha256(readSource(CONTRACT_SOURCE_PATHS.database)) : databaseHash;
  const predecessorOpenapiHash = ownerProfile ? sha256(readSource(CONTRACT_SOURCE_PATHS.openapi)) : openapiHash;
  assertNormativeContractAlignment({
    architecture: sources.architecture,
    apiSemantics: sources.apiSemantics,
    implementation: sources.implementation,
    developmentIncrement: sources.developmentIncrement,
    databaseHash: predecessorDatabaseHash,
    openapiHash: predecessorOpenapiHash,
  });
  if (ownerProfile) {
    const generated = buildOwnerContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!(backendProfile ? readSource(OWNER_CONTRACT_PATHS[key]) : buffers[key]).equals(generated[key])) throw new Error(`承接合同派生产物与来源不一致：${key}`);
    }
    const increment = utf8(readSource(OWNER_CONTRACT_PATHS.increment), OWNER_CONTRACT_PATHS.increment);
    for (const [anchor, ddl, api] of [
      ["**直接前序机器合同：**", predecessorDatabaseHash, predecessorOpenapiHash],
      ["**A3 机器合同增量：**", sha256(generated.database), sha256(generated.openapi)],
      ["**实际产物必须精确匹配：**", sha256(generated.database), sha256(generated.openapi)],
    ]) {
      const lines = linesForAnchor(increment, "A3 承接合同", anchor);
      if (lines.length !== 1) throw new Error(`A3 合同声明必须唯一：${anchor}`);
      hashPairFromLine(lines[0], anchor);
      assertLineCarriesHashes(lines[0], anchor, ddl, api);
    }
  }

  if (backendProfile) {
    const generated = buildBackendContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!readSource(BACKEND_CONTRACT_PATHS[key]).equals(generated[key])) throw new Error(`后端合同派生产物与来源不一致：${key}`);
    }
    const increment = utf8(readSource(BACKEND_CONTRACT_PATHS.increment), BACKEND_CONTRACT_PATHS.increment);
    const approval = utf8(readSource("business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md"), "后端开发批准");
    if (!/^> 状态：APPROVED · SYNTHETIC DEVELOPMENT ONLY\r?$/m.test(approval) || !/^> 决定：DEC-BACKEND-SYNTHETIC-20260909\r?$/m.test(approval)) throw new Error("缺后端合成开发批准");
    for (const [anchor, ddl, api] of [
      ["**直接前序机器合同：**", sha256(readSource(OWNER_CONTRACT_PATHS.database)), sha256(readSource(OWNER_CONTRACT_PATHS.openapi))],
      ["**后端机器合同增量：**", sha256(generated.database), sha256(generated.openapi)],
      ["**实际产物必须精确匹配：**", sha256(generated.database), sha256(generated.openapi)],
    ]) {
      const lines = linesForAnchor(increment, "后端合同", anchor);
      if (lines.length !== 1) throw new Error(`后端合同声明必须唯一：${anchor}`);
      hashPairFromLine(lines[0], anchor);
      assertLineCarriesHashes(lines[0], anchor, ddl, api);
    }
  }

  if (closureProfile || opsLoopProfile) {
    const generated = buildClosureContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!readSource(CLOSURE_CONTRACT_PATHS[key]).equals(generated[key])) throw new Error(`收尾合同派生产物漂移：${key}`);
    }
    const increment = utf8(readSource(CLOSURE_CONTRACT_PATHS.increment), "收尾合同");
    if (!/^> 状态：FROZEN · SYNTHETIC DEVELOPMENT ONLY\r?$/m.test(increment)) throw new Error("收尾合同未冻结");
    const lines = linesForAnchor(increment, "收尾合同", "**实际产物必须精确匹配：**");
    if (lines.length !== 1) throw new Error("收尾哈希声明必须唯一");
    hashPairFromLine(lines[0], "收尾合同");
    assertLineCarriesHashes(
      lines[0],
      "收尾合同",
      sha256(readSource(CLOSURE_CONTRACT_PATHS.database)),
      sha256(readSource(CLOSURE_CONTRACT_PATHS.openapi)),
    );
  }

  if (opsLoopProfile) {
    const generated = buildOpsLoopContractFiles(readSource);
    const opsLoopOpenapi = readSource(OPS_LOOP_CONTRACT_PATHS.openapi);
    const opsLoopDatabase = readSource(OPS_LOOP_CONTRACT_PATHS.database);
    for (const [key, actual] of [["database", opsLoopDatabase], ["openapi", opsLoopOpenapi]]) {
      if (!actual.equals(generated[key])) throw new Error(`运营闭环合同派生产物漂移：${key}`);
    }
    const increment = utf8(readSource(OPS_LOOP_CONTRACT_PATHS.increment), "运营闭环合同");
    if (!/FROZEN · NOT EXPORTED · NOT INTAKE/.test(increment)) {
      throw new Error("运营闭环合同未冻结");
    }
    for (const [anchor, ddl, api] of [
      ["**直接前序机器合同：**", sha256(readSource(CLOSURE_CONTRACT_PATHS.database)), sha256(readSource(CLOSURE_CONTRACT_PATHS.openapi))],
      ["**DEV-M2 机器合同增量：**", sha256(opsLoopDatabase), sha256(opsLoopOpenapi)],
      ["**实际产物必须精确匹配：**", sha256(opsLoopDatabase), sha256(opsLoopOpenapi)],
    ]) {
      const lines = linesForAnchor(increment, "运营闭环合同", anchor);
      if (lines.length !== 1) throw new Error(`运营闭环合同声明必须唯一：${anchor}`);
      hashPairFromLine(lines[0], anchor);
      assertLineCarriesHashes(lines[0], anchor, ddl, api);
    }
  }

  if (coachPublishProfile) {
    const generated = buildCoachPublishContractFiles(readSource);
    const coachBytes = Object.fromEntries(["database", "openapi"].map(key => [key, readSource(COACH_PUBLISH_CONTRACT_PATHS[key])]));
    for (const key of ["database", "openapi"]) {
      if (!coachBytes[key].equals(generated[key])) throw new Error(`话术师发布合同派生产物漂移：${key}`);
    }
    const increment = utf8(readSource(COACH_PUBLISH_CONTRACT_PATHS.increment), "话术师发布合同");
    if (!/FROZEN · NOT EXPORTED · NOT INTAKE/.test(increment)) {
      throw new Error("话术师发布合同未冻结");
    }
    for (const [anchor, ddl, api] of [
      ["**直接前序机器合同：**", sha256(readSource(OPS_LOOP_CONTRACT_PATHS.database)), sha256(readSource(OPS_LOOP_CONTRACT_PATHS.openapi))],
      ["**DEV-M3 机器合同增量：**", sha256(coachBytes.database), sha256(coachBytes.openapi)],
      ["**实际产物必须精确匹配：**", sha256(coachBytes.database), sha256(coachBytes.openapi)],
    ]) {
      const lines = linesForAnchor(increment, "话术师发布合同", anchor);
      if (lines.length !== 1) throw new Error(`话术师发布合同声明必须唯一：${anchor}`);
      hashPairFromLine(lines[0], anchor);
      assertLineCarriesHashes(lines[0], anchor, ddl, api);
    }
  }

  if (intakeProfile) {
    const generated = buildIntakeContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!readSource(INTAKE_CONTRACT_PATHS[key]).equals(generated[key])) throw new Error(`P2 资料接入合同派生产物漂移：${key}`);
    }
    assertIntakeExportGate(readSource, {databaseHash: sha256(generated.database), openapiHash: sha256(generated.openapi)});
  }
  if (intakeUsageProfile) {
    const generated = buildIntakeUsageContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!readSource(INTAKE_USAGE_CONTRACT_PATHS[key]).equals(generated[key])) throw new Error(`P2 使用资格合同派生产物漂移：${key}`);
    }
    assertIntakeUsageExportGate(readSource, {databaseHash: sha256(generated.database), openapiHash: sha256(generated.openapi)});
  }
  if (intakeQualityProfile) {
    const generated = buildIntakeQualityContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!readSource(INTAKE_QUALITY_CONTRACT_PATHS[key]).equals(generated[key])) throw new Error(`P2 质量 HTTP 合同派生产物漂移：${key}`);
    }
    assertIntakeQualityExportGate(readSource, {databaseHash: sha256(generated.database), openapiHash: sha256(generated.openapi)});
  }
  if (intakeManagementProfile) {
    const generated = buildIntakeManagementContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!readSource(INTAKE_MANAGEMENT_CONTRACT_PATHS[key]).equals(generated[key])) throw new Error(`P2 管理上下文合同派生产物漂移：${key}`);
    }
    assertIntakeManagementExportGate(readSource, {databaseHash: sha256(generated.database), openapiHash: sha256(generated.openapi)});
  }

  if (intakeDirectProfile) {
    const generated = buildIntakeDirectContractFiles(readSource);
    for (const key of ["database", "openapi"]) {
      if (!(intakeRuntimeProfile ? readSource(INTAKE_DIRECT_CONTRACT_PATHS[key]) : buffers[key]).equals(generated[key])) throw new Error(`P2 确认直发合同派生产物漂移：${key}`);
    }
    assertIntakeDirectExportGate(readSource, {databaseHash:sha256(generated.database),openapiHash:sha256(generated.openapi)});
  }

  if (intakeRuntimeProfile) assertIntakeRuntimeExportGate(readSource,intakeCsvProfile ? {databaseHash:sha256(readSource(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.database)),openapiHash:sha256(readSource(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.openapi))} : {databaseHash,openapiHash});
  if (intakeCsvProfile) assertIntakeCsvExportGate(readSource,{databaseHash,openapiHash});

  const openapiVersion = extractOpenapiVersion(sources.openapi);
  const databaseVersion = extractDatabaseVersion(sources.database);
  const architectureVersion = extractArchitectureVersion(sources.architecture);
  const implementationVersion = extractImplementationVersion(sources.implementation);
  const contractSetId = buildContractSetId({
    openapiVersion,
    databaseVersion,
    sourceGitSha: exactSourceGitSha,
  });
  const databaseFile = `schema-v${databaseVersion.replace(/^schema\.v/, "")}.sql`;
  const manifest = {
    schema: intakeCsvProfile ? CSV_CONTRACT_SET_SCHEMA : intakeRuntimeProfile ? RUNTIME_CONTRACT_SET_SCHEMA : CONTRACT_SET_SCHEMA,
    contract_set_id: contractSetId,
    source_repository: "ai-赋能立项",
    source_git_sha: exactSourceGitSha,
    architecture_version: architectureVersion,
    implementation_version: implementationVersion,
    openapi: {
      version: openapiVersion,
      source_path: sourcePaths.openapi,
      file: "openapi.v1.yaml",
      sha256: openapiHash,
      bytes: buffers.openapi.byteLength,
    },
    database: {
      version: databaseVersion,
      source_path: sourcePaths.database,
      file: databaseFile,
      sha256: databaseHash,
      bytes: buffers.database.byteLength,
    },
  };
  const runtimeFiles=new Map();
  if (intakeRuntimeProfile) {
    manifest.runtime=Object.fromEntries(Object.entries(intakeCsvProfile ? CSV_BUNDLE_PATHS : RUNTIME_BUNDLE_PATHS).map(([key,descriptor])=>{
      const bytes=readSource(descriptor.source_path);runtimeFiles.set(descriptor.file,bytes);
      return [key,{version:'1',...descriptor,sha256:sha256(bytes),bytes:bytes.byteLength}];
    }));
  }
  return {
    manifest,
    files: new Map([
      ["contract-set.json", Buffer.from(renderContractSetManifest(manifest), "utf8")],
      [manifest.openapi.file, buffers.openapi],
      [manifest.database.file, buffers.database],
      ...runtimeFiles,
    ]),
  };
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

async function assertExistingPathChainHasNoSymlink(repository, candidate) {
  const relative = path.relative(repository, candidate);
  let current = repository;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error(`输出路径禁止符号链接：${current}`);
      if (!metadata.isDirectory()) throw new Error(`输出路径分量不是目录：${current}`);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function assertSafeContractSetOutputRoot(
  repository = repositoryRoot,
  outputRoot = defaultOutputRoot,
  { create = true } = {},
) {
  const absoluteRepository = path.resolve(repository);
  const absoluteOutput = path.resolve(outputRoot);
  if (!isWithin(absoluteRepository, absoluteOutput) || absoluteRepository === absoluteOutput) {
    throw new Error("合同集输出目录必须位于仓库内且不能等于仓库根");
  }
  await assertExistingPathChainHasNoSymlink(absoluteRepository, absoluteOutput);
  const relativeOutput = path.relative(absoluteRepository, absoluteOutput).split(path.sep).join("/");
  const ignored = runGit(
    absoluteRepository,
    ["check-ignore", "--no-index", "-q", "--", `${relativeOutput}/.ignore-probe`],
    { allowFailure: true },
  );
  if (ignored.status !== 0) throw new Error("合同集输出目录不再受 Git ignore 保护，拒绝写入");
  if (create) {
    await mkdir(absoluteOutput, { recursive: true, mode: 0o700 });
  } else {
    try {
      const metadata = await lstat(absoluteOutput);
      if (!metadata.isDirectory()) throw new Error("合同集输出路径不是目录");
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error("合同集输出目录不存在，拒绝验证");
      throw error;
    }
  }
  await assertExistingPathChainHasNoSymlink(absoluteRepository, absoluteOutput);
  const [canonicalRepository, canonicalOutput] = await Promise.all([
    realpath(absoluteRepository),
    realpath(absoluteOutput),
  ]);
  if (!isWithin(canonicalRepository, canonicalOutput) || canonicalRepository === canonicalOutput) {
    throw new Error("合同集输出真实路径越出仓库");
  }
  return canonicalOutput;
}

async function readRegularFileNoFollow(filePath, allowedParent) {
  if (typeof fsConstants.O_NOFOLLOW !== "number") {
    throw new Error("当前平台缺少 O_NOFOLLOW，拒绝读取合同集");
  }
  const before = await lstat(filePath);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`合同集成员必须是普通文件且禁止符号链接：${filePath}`);
  }
  if ((before.mode & 0o222) !== 0) throw new Error(`合同集成员必须只读：${filePath}`);
  const canonicalParent = await realpath(path.dirname(filePath));
  if (canonicalParent !== allowedParent) throw new Error(`合同集成员父目录越界：${filePath}`);
  let handle;
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const after = await handle.stat();
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) {
      throw new Error(`合同集成员在读取期间被替换：${filePath}`);
    }
    return await handle.readFile();
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error(`合同集成员禁止符号链接：${filePath}`);
    throw error;
  } finally {
    await handle?.close();
  }
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(`${label} 字段集合不封闭：${actual.join(", ")}`);
  }
}

function parseContractSetManifest(content) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    throw new Error(`contract-set.json 不是合法 JSON：${error.message}`);
  }
  const isCsv=manifest.schema===CSV_CONTRACT_SET_SCHEMA;
  const isRuntime=isCsv || manifest.schema===RUNTIME_CONTRACT_SET_SCHEMA;
  const bundlePaths=isCsv ? CSV_BUNDLE_PATHS : RUNTIME_BUNDLE_PATHS;
  assertExactKeys(manifest, isRuntime ? [...REQUIRED_MANIFEST_KEYS,"runtime"] : REQUIRED_MANIFEST_KEYS, "contract-set.json");
  assertExactKeys(manifest.openapi, REQUIRED_CONTRACT_KEYS, "contract-set.json.openapi");
  assertExactKeys(manifest.database, REQUIRED_CONTRACT_KEYS, "contract-set.json.database");
  if (manifest.schema !== CONTRACT_SET_SCHEMA && !isRuntime) throw new Error("contract-set schema 不受支持");
  if (isRuntime) {
    if (manifest.openapi.version!==(isCsv?'1.22.0':'1.21.0') || manifest.database.version!==(isCsv?'schema.v1.24':'schema.v1.23')) throw new Error('runtime bundle版本组合不受支持');
    assertExactKeys(manifest.runtime,Object.keys(bundlePaths),'contract-set.runtime');
    for (const [key,expected] of Object.entries(bundlePaths)) {
      const actual=manifest.runtime[key]; assertExactKeys(actual,REQUIRED_CONTRACT_KEYS,`runtime.${key}`);
      if (actual.version!=='1' || actual.file!==expected.file || actual.source_path!==expected.source_path) throw new Error(`runtime工件不匹配：${key}`);
    }
  }
  if (!GIT_SHA_PATTERN.test(manifest.source_git_sha)) throw new Error("manifest source_git_sha 非法");
  for (const [label, contract] of [
    ["OpenAPI", manifest.openapi],
    ["DDL", manifest.database],
    ...Object.entries(manifest.runtime ?? {}),
  ]) {
    normalizeExpectedHash(contract.sha256, `${label} manifest SHA-256`);
    if (path.basename(contract.file) !== contract.file) throw new Error(`${label} 文件名越界`);
    if (!Number.isSafeInteger(contract.bytes) || contract.bytes < 0) {
      throw new Error(`${label} bytes 非法`);
    }
  }
  const expectedId = buildContractSetId({
    openapiVersion: manifest.openapi.version,
    databaseVersion: manifest.database.version,
    sourceGitSha: manifest.source_git_sha,
  });
  if (manifest.contract_set_id !== expectedId) throw new Error("contract_set_id 与版本/来源 SHA 不一致");
  return manifest;
}

async function assertDirectoryMatchesFiles(directory, expectedFiles) {
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`合同集目标必须是普通目录且禁止符号链接：${directory}`);
  }
  if ((metadata.mode & 0o222) !== 0) throw new Error(`合同集目标目录必须只读：${directory}`);
  const canonicalDirectory = await realpath(directory);
  const names = (await readdir(directory)).sort();
  const expectedNames = [...expectedFiles.keys()].sort();
  if (names.join("\n") !== expectedNames.join("\n")) {
    throw new Error(`既有合同集目录成员不一致，拒绝覆盖：${directory}`);
  }
  for (const [name, expected] of expectedFiles) {
    const actual = await readRegularFileNoFollow(path.join(directory, name), canonicalDirectory);
    if (!actual.equals(expected)) throw new Error(`既有合同集内容不一致，拒绝覆盖：${name}`);
  }
}

async function removeTemporaryDirectory(temporaryDirectory) {
  if (!temporaryDirectory) return;
  try {
    await chmod(temporaryDirectory, 0o700);
    for (const name of await readdir(temporaryDirectory)) {
      await chmod(path.join(temporaryDirectory, name), 0o600).catch(() => {});
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function writeImmutableContractSet({
  contractSet,
  repository = repositoryRoot,
  outputRoot = defaultOutputRoot,
}) {
  const canonicalOutput = await assertSafeContractSetOutputRoot(repository, outputRoot);
  const target = path.join(canonicalOutput, contractSet.manifest.contract_set_id);
  try {
    await assertDirectoryMatchesFiles(target, contractSet.files);
    return { status: "REUSED", target };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let temporaryDirectory = await mkdtemp(path.join(canonicalOutput, ".contract-set-tmp-"));
  try {
    for (const [name, content] of contractSet.files) {
      const filePath = path.join(temporaryDirectory, name);
      const handle = await open(filePath, "wx", 0o600);
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await chmod(filePath, 0o444);
    }
    await chmod(temporaryDirectory, 0o555);
    try {
      await rename(temporaryDirectory, target);
      temporaryDirectory = null;
      return { status: "CREATED", target };
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error;
      await assertDirectoryMatchesFiles(target, contractSet.files);
      return { status: "REUSED", target };
    }
  } finally {
    await removeTemporaryDirectory(temporaryDirectory);
  }
}

export async function verifyContractSetDirectory({
  contractSetDirectory,
  repository = repositoryRoot,
  expectedOpenapiSha256 = null,
  expectedDatabaseSha256 = null,
  againstSource = true,
}) {
  const directory = path.resolve(contractSetDirectory);
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("合同集路径必须是普通目录且禁止符号链接");
  }
  if ((metadata.mode & 0o222) !== 0) throw new Error("合同集目录必须只读");
  const canonicalDirectory = await realpath(directory);
  const manifestBuffer = await readRegularFileNoFollow(
    path.join(directory, "contract-set.json"),
    canonicalDirectory,
  );
  const manifest = parseContractSetManifest(utf8(manifestBuffer, "contract-set.json"));
  if (path.basename(directory) !== manifest.contract_set_id) {
    throw new Error("合同集目录名与 contract_set_id 不一致");
  }
  const expectedOpenapi = normalizeExpectedHash(expectedOpenapiSha256, "OpenAPI 预期 SHA-256", {
    required: false,
  });
  const expectedDatabase = normalizeExpectedHash(expectedDatabaseSha256, "DDL 预期 SHA-256", {
    required: false,
  });
  if (expectedOpenapi && manifest.openapi.sha256 !== expectedOpenapi) {
    throw new Error("manifest OpenAPI SHA-256 与调用方预期不一致");
  }
  if (expectedDatabase && manifest.database.sha256 !== expectedDatabase) {
    throw new Error("manifest DDL SHA-256 与调用方预期不一致");
  }

  const allowedNames = ["contract-set.json", manifest.openapi.file, manifest.database.file,...Object.values(manifest.runtime ?? {}).map(item=>item.file)].sort();
  const actualNames = (await readdir(directory)).sort();
  if (actualNames.join("\n") !== allowedNames.join("\n")) {
    throw new Error("合同集目录包含缺失或未声明成员");
  }
  for (const [label, contract] of [
    ["OpenAPI", manifest.openapi],
    ["DDL", manifest.database],
    ...Object.entries(manifest.runtime ?? {}),
  ]) {
    const content = await readRegularFileNoFollow(path.join(directory, contract.file), canonicalDirectory);
    if (content.byteLength !== contract.bytes) throw new Error(`${label} bytes 不匹配`);
    if (sha256(content) !== contract.sha256) throw new Error(`${label} SHA-256 不匹配`);
  }

  if (manifest.runtime) {
    const isCsv=manifest.schema===CSV_CONTRACT_SET_SCHEMA;
    const bundlePaths=isCsv ? CSV_BUNDLE_PATHS : RUNTIME_BUNDLE_PATHS;
    const installation=JSON.parse(utf8(await readRegularFileNoFollow(path.join(directory,manifest.runtime.installation.file),canonicalDirectory),'runtime installation'));
    if (installation.schema!=='content-intake-installation/v1' || installation.openapi.sha256!==manifest.openapi.sha256
      || installation.database.sha256!==manifest.database.sha256 || installation.companionAclRequired!==true
      || installation.productMode?.skipMissingDependencies!==false) throw new Error('runtime安装清单不匹配');
    assertExactKeys(installation.sources,Object.keys(bundlePaths).filter(key=>key!=='installation'),'runtime installation sources');
    for (const [key,item] of Object.entries(installation.sources)) {
      if (item.path!==manifest.runtime[key]?.source_path || item.sha256!==manifest.runtime[key]?.sha256) throw new Error(`runtime安装工件哈希不一致：${key}`);
    }
    const expectedOrder=['product-migrations','roles','organization','session','directory','directoryAcl','acl','environment-login-bindings'];
    if(isCsv) expectedOrder.splice(expectedOrder.indexOf('acl'),0,'csv');
    const expectedArtifacts=['openapi','database',...Object.keys(bundlePaths)].sort();
    if (installation.openapi.path!==manifest.openapi.source_path || installation.database.path!==manifest.database.source_path
      || installation.productMode.atomicCandidateInstall!==true
      || JSON.stringify(installation.productMode.order)!==JSON.stringify(expectedOrder)
      || !Array.isArray(installation.requiredBundleArtifacts)
      || JSON.stringify([...installation.requiredBundleArtifacts].sort())!==JSON.stringify(expectedArtifacts)
      || installation.capabilityLogin!==false || installation.environmentCredentialsIncluded!==false) throw new Error('runtime安装边界不一致');
    if(isCsv && (installation.sqlContract!=='schema.v1.24' || installation.productMode.csvInputImplementationRequired!==true || installation.productMode.csvProductionConsumerReady!==false || installation.referenceMode?.runtimeReady!==false || JSON.stringify(installation.referenceMode?.includes)!==JSON.stringify(['roles','organization','session','directory','directoryAcl','csv']))) throw new Error('CSV 产品实施边界不一致');
    const provenance=JSON.parse(utf8(await readRegularFileNoFollow(path.join(directory,manifest.runtime.provenance.file),canonicalDirectory),'runtime provenance'));
    if (JSON.stringify(installation.productMode.implementation)!==JSON.stringify(provenance.implementationDependencies)) throw new Error('runtime overlay依赖不一致');
  }
  if (againstSource) {
    const expected = loadContractSetFromCommit({
      repository,
      sourceGitSha: manifest.source_git_sha,
      expectedOpenapiSha256: manifest.openapi.sha256,
      expectedDatabaseSha256: manifest.database.sha256,
    });
    await assertDirectoryMatchesFiles(directory, expected.files);
  }
  return manifest;
}

function parseArguments(argv) {
  const options = { mode: null };
  for (const argument of argv) {
    if (["--check", "--write"].includes(argument)) {
      if (options.mode) throw new Error("--check / --write / --verify 只能选择一个");
      options.mode = argument.slice(2);
    } else if (argument.startsWith("--verify=")) {
      if (options.mode) throw new Error("--check / --write / --verify 只能选择一个");
      options.mode = "verify";
      options.verifyPath = argument.slice("--verify=".length);
    } else if (argument.startsWith("--source-git-sha=")) {
      options.sourceGitSha = argument.slice("--source-git-sha=".length);
    } else if (argument.startsWith("--expect-openapi-sha256=")) {
      options.expectedOpenapiSha256 = argument.slice("--expect-openapi-sha256=".length);
    } else if (argument.startsWith("--expect-database-sha256=")) {
      options.expectedDatabaseSha256 = argument.slice("--expect-database-sha256=".length);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (!options.mode) throw new Error("必须显式指定 --check、--write 或 --verify=<directory>");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "verify") {
    const outputRoot = await assertSafeContractSetOutputRoot(repositoryRoot, defaultOutputRoot, {
      create: false,
    });
    const target = path.resolve(options.verifyPath);
    if (path.dirname(target) !== outputRoot) throw new Error("--verify 只能指向固定 ignored 输出根的一层子目录");
    const manifest = await verifyContractSetDirectory({
      contractSetDirectory: target,
      expectedOpenapiSha256: options.expectedOpenapiSha256,
      expectedDatabaseSha256: options.expectedDatabaseSha256,
    });
    console.log(
      JSON.stringify(
        {
          status: "VERIFIED",
          contract_set_id: manifest.contract_set_id,
          source_git_sha: manifest.source_git_sha,
          path: target,
          ddev_authorized: false,
          product_consumed: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const contractSet = loadContractSetFromCommit({
    sourceGitSha: options.sourceGitSha,
    expectedOpenapiSha256: options.expectedOpenapiSha256,
    expectedDatabaseSha256: options.expectedDatabaseSha256,
  });
  if (options.mode === "check") {
    console.log(renderContractSetManifest(contractSet.manifest));
    return;
  }
  const written = await writeImmutableContractSet({ contractSet });
  const verified = await verifyContractSetDirectory({
    contractSetDirectory: written.target,
    expectedOpenapiSha256: options.expectedOpenapiSha256,
    expectedDatabaseSha256: options.expectedDatabaseSha256,
  });
  console.log(
    JSON.stringify(
      {
        status: written.status,
        contract_set_id: verified.contract_set_id,
        source_git_sha: verified.source_git_sha,
        path: written.target,
        ddev_authorized: false,
        product_consumed: false,
      },
      null,
      2,
    ),
  );
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  main().catch((error) => {
    console.error(`CONTRACT_SET_ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
