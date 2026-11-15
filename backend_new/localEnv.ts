import { config } from 'dotenv';

/**
 * Loads `.env.local`, then fills in the local defaults -- imported for its
 * side effects, so that importing it first is what guarantees it runs
 * before anything reads `process.env`.
 *
 * Imported by `local.ts` (`npm run dev`) and `regression/setup.ts` (the
 * regression suite), which are two of the three things that read
 * `.env.local` at all; the third is `tools/simulateEcpayWebhook.ts`, which
 * needs ECPay values that deliberately have no default. Nothing deployed
 * imports this: the Lambdas get their environment from CloudFormation, and
 * esbuild only bundles what `src/lambda/*.ts` reaches.
 *
 * The defaults exist because `.env.local` is gitignored, so a fresh clone
 * -- another machine, or an agent -- does not have it, and the failure is
 * not self-explanatory: the unit tests pass either way, then every
 * DB-backed test dies at connect with nothing pointing at the cause.
 *
 * Committing these three is safe because they are already committed:
 * `castor` is the MYSQL_DATABASE/MYSQL_USER and `castorlocal` the
 * MYSQL_PASSWORD in docker-compose.yml, and the database they open holds
 * nothing but local test rows. No ECPay credential is here and none
 * belongs here -- the regression suite's payment tests set their own, and
 * `npm run dev` wants real stage values that a HashKey/HashIV rule keeps
 * out of git. Those come from `.env.local`; see `.env.example`.
 *
 * `??=`, so the precedence reads: an explicitly exported variable beats
 * `.env.local` (dotenv never overwrites), which beats these. DB_HOST is
 * the one value that genuinely differs per machine -- `127.0.0.1` from the
 * host, `host.docker.internal` from a container whose own localhost has no
 * MySQL -- so overriding it stays a one-liner:
 *
 *   DB_HOST=host.docker.internal npm run test:regression
 */
config({ path: '.env.local' });

process.env.PROJECT ??= 'castor';
process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PWD ??= 'castorlocal';
