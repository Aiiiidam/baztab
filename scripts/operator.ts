/**
 * Operator CLI (tech spec §4, decision 008). Internal tool; output is English.
 *
 *   npm run operator -- provision --national-id 10380284790 --name "شرکت نمونه" --mobile 09123456789
 *   npm run operator -- reset     --national-id 10380284790 --mobile 09123456789
 *   npm run operator -- revoke    --national-id 10380284790 --mobile 09123456789
 *   npm run operator -- revoke-org --national-id 10380284790
 *
 * Connects with DATABASE_URL_MIGRATE (the release/operator role) when set,
 * otherwise DATABASE_URL for local work; never the web role. The operator name
 * written to the audit log is --operator, OPERATOR_NAME or the OS user.
 * Initial passwords are printed once and never stored in plaintext.
 */
import 'dotenv/config';
import { userInfo } from 'node:os';
import { parseArgs } from 'node:util';

process.env.PROCESS_ROLE = 'cli';
process.env.LOG_LEVEL = 'warn';
if (process.env.DATABASE_URL_MIGRATE) process.env.DATABASE_URL = process.env.DATABASE_URL_MIGRATE;

const USAGE = `Usage: npm run operator -- <command> [options]

Commands:
  provision   --national-id <id> --name <organization name> --mobile <mobile>
  reset       --national-id <id> --mobile <mobile>
  revoke      --national-id <id> --mobile <mobile>
  revoke-org  --national-id <id>

Options:
  --operator <name>   Name recorded in the audit log (default: OPERATOR_NAME or OS user)`;

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'national-id': { type: 'string' },
      name: { type: 'string' },
      mobile: { type: 'string' },
      operator: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command] = positionals;
  if (!command || values.help) {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  const operator = values.operator ?? process.env.OPERATOR_NAME ?? userInfo().username;
  const nationalId = values['national-id'];
  const need = (value: string | undefined, flag: string): string => {
    if (!value) throw new Error(`Missing --${flag}\n\n${USAGE}`);
    return value;
  };

  const service = await import('@/services/operator.service');
  const { prisma } = await import('@/lib/prisma');
  try {
    switch (command) {
      case 'provision': {
        const result = await service.provisionMember({
          operator,
          nationalId: need(nationalId, 'national-id'),
          organizationName: need(values.name, 'name'),
          mobile: need(values.mobile, 'mobile'),
        });
        console.log(
          `Organization ${result.organizationCreated ? 'created' : 'exists'}: ${result.organizationId}`,
        );
        console.log(
          `Membership ${result.membershipCreated ? 'created' : result.initialPassword ? 'reactivated' : 'exists (unchanged)'}: ${result.membershipId}`,
        );
        if (result.initialPassword)
          printPassword(result.initialPassword, result.initialPasswordExpiresAt);
        else console.log('No password issued. Use `reset` to issue a new initial password.');
        return 0;
      }
      case 'reset': {
        const result = await service.resetMember({
          operator,
          nationalId: need(nationalId, 'national-id'),
          mobile: need(values.mobile, 'mobile'),
        });
        console.log(
          `Membership reset: ${result.membershipId}; sessions revoked: ${result.sessionsRevoked}`,
        );
        printPassword(result.initialPassword, result.initialPasswordExpiresAt);
        return 0;
      }
      case 'revoke': {
        const result = await service.revokeMember({
          operator,
          nationalId: need(nationalId, 'national-id'),
          mobile: need(values.mobile, 'mobile'),
        });
        console.log(
          `Membership revoked: ${result.membershipId}; sessions revoked: ${result.sessionsRevoked}`,
        );
        return 0;
      }
      case 'revoke-org': {
        const result = await service.revokeOrganization({
          operator,
          nationalId: need(nationalId, 'national-id'),
        });
        console.log(
          `Organization revoked: ${result.organizationId}; sessions revoked: ${result.sessionsRevoked}`,
        );
        return 0;
      }
      default:
        console.error(`Unknown command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function printPassword(password: string, expiresAt?: Date) {
  console.log('');
  console.log(`  Initial password (shown once): ${password}`);
  if (expiresAt) console.log(`  Expires: ${expiresAt.toISOString()}`);
  console.log('  Deliver it out of band. The member must replace it at first sign-in.');
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
