/** Synthetic trusted consumer for the draft's transaction boundary. It owns the
 * complete SQL lifecycle, not HTTP authentication or a production connection.
 * execute receives a script on stdin, returns stdout only after the psql process
 * succeeds, and uses a disposable Unix-socket database. No key enters this API.
 * The product must reuse its existing TS transaction owner after formal intake. */
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sessionHash = /^[0-9a-f]{64}$/;
const isId = value => typeof value === 'string' && identifier.test(value);
const isSession = value => typeof value === 'string' && sessionHash.test(value);
const own = (value, allowed) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).every(key => allowed.includes(key));
const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const version = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const acceptedReasons = /\b(SHOP_DIRECTORY_(?:SESSION|CURSOR|CHANGED|EXPIRED|UNAVAILABLE|CONFLICT|STEWARD_REQUIRED|REGISTRAR_REQUIRED)|SHOP_DISPLAY_(?:INVALID|MISSING))\b/;
const committing = '__SHOP_DIRECTORY_COMMITTING__';
const invalid = () => ({ ok: false, reason: 'SHOP_DISPLAY_INVALID', commit: 'rolled_back' });

export function createShopDirectoryConsumer(execute) {
  async function transaction(expression) {
    const script = `\\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='5s';
SELECT backend_review.lock_content() AS locked \\gset
WITH prepared AS MATERIALIZED (SELECT ${expression} AS envelope)
SELECT envelope::text AS directory_envelope, (envelope->'value')::text AS directory_value FROM prepared \\gset
SELECT content_intake.finish_shop_directory_transaction(:'directory_envelope'::jsonb) AS finished \\gset
\\echo ${committing}
COMMIT;
\\echo :directory_value
`;
    let processSucceeded = false;
    try {
      const stdout = await execute(script);
      processSucceeded = true;
      const lines = String(stdout).trim().split('\n');
      const index = lines.indexOf(committing);
      if (index < 0 || index !== lines.length - 2) return { ok: false, reason: 'COMMIT_UNKNOWN', commit: 'unknown' };
      return { ok: true, value: JSON.parse(lines.at(-1)) };
    } catch (error) {
      // Never expose the SQL, session reference, secret state, raw driver error or
      // stderr. A connection loss after COMMIT started is not a rolled-back write.
      if (processSucceeded || String(error?.stdout ?? '').split('\n').includes(committing)) {
        return { ok: false, reason: 'COMMIT_UNKNOWN', commit: 'unknown' };
      }
      return { ok: false, reason: acceptedReasons.exec(String(error?.stderr ?? ''))?.[1] ?? 'SHOP_DIRECTORY_UNAVAILABLE', commit: 'rolled_back' };
    }
  }
  return Object.freeze({
    async read(request) {
      if (!own(request, ['sessionHash', 'cursor', 'limit']) || !isSession(request.sessionHash)) return invalid();
      const { cursor = null, limit = 50 } = request;
      if ((cursor !== null && (typeof cursor !== 'string' || !cursor.length || Buffer.byteLength(cursor) > 512))
        || !Number.isInteger(limit) || limit < 1 || limit > 100) return invalid();
      return transaction(`content_intake.prepare_shop_directory_read(${quote(request.sessionHash)},${quote(cursor)},${limit})`);
    },
    async write(request) {
      if (!own(request, ['sessionHash', 'shopId', 'displayName', 'expectedRevision'])
        || !isSession(request.sessionHash) || !isId(request.shopId)
        || typeof request.displayName !== 'string' || (request.expectedRevision !== null && !version(request.expectedRevision))) return invalid();
      return transaction(`content_intake.prepare_shop_directory_write(${quote(request.sessionHash)},${quote(request.shopId)},${quote(request.displayName)},${request.expectedRevision ?? 'NULL'})`);
    },
    async manage(request) {
      if (!own(request, ['sessionHash', 'target', 'expectedVersion', 'targetFacts', 'validUntil', 'reason', 'operationId'])
        || !isSession(request.sessionHash) || !version(request.expectedVersion)
        || !isId(request.operationId) || typeof request.reason !== 'string'
        || !request.reason.trim() || request.reason.length > 512) return invalid();
      if (request.target === null) {
        if (request.targetFacts !== null || request.validUntil !== null) return invalid();
      } else if (!isId(request.target) || !version(request.targetFacts) || request.targetFacts < 1 || !timestamp(request.validUntil)) return invalid();
      return transaction(`content_intake.manage_shop_directory_steward(${quote(request.sessionHash)},${quote(request.target)},${request.expectedVersion},${request.targetFacts ?? 'NULL'},${quote(request.validUntil)}::timestamptz,${quote(request.reason)},${quote(request.operationId)})`);
    },
  });
}
