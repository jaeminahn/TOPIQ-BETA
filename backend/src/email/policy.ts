import { config } from "../core/config.js";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid billing date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid billing date: ${value}`);
  }
  return { year, month, day };
}

function formatDate(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

export interface BrevoBillingCycle {
  start: string;
  endExclusive: string;
}

export function brevoBillingCycle(
  now = new Date(),
  billingStartDate = config.brevo.billingStartDate,
): BrevoBillingCycle {
  const anchor = parseDate(billingStartDate);
  const local = new Date(now.getTime() + KST_OFFSET_MS);
  let year = local.getUTCFullYear();
  let monthIndex = local.getUTCMonth();
  if (local.getUTCDate() < anchor.day) monthIndex -= 1;

  let start = formatDate(year, monthIndex, anchor.day);
  if (start < billingStartDate) start = billingStartDate;
  const parsedStart = parseDate(start);
  const endExclusive = formatDate(parsedStart.year, parsedStart.month, parsedStart.day);
  return { start, endExclusive };
}
