export const STANDARD_PROJECT_EX_GST_CENTS = 495_000;
export const GST_RATE_PERCENT = 10;
export const DEPOSIT_PERCENT = 30;
export const HOSTING_EX_GST_CENTS = 9_900;

function percentOf(cents, percent) {
  return Math.round((cents * percent) / 100);
}

export function assertCents(value, label = "amount") {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer number of cents.`);
  }
  return value;
}

export function calculateProjectAmounts(
  projectExGstCents = STANDARD_PROJECT_EX_GST_CENTS,
) {
  assertCents(projectExGstCents, "projectExGstCents");

  const projectGstCents = percentOf(projectExGstCents, GST_RATE_PERCENT);
  const projectIncGstCents = projectExGstCents + projectGstCents;
  const depositExGstCents = percentOf(projectExGstCents, DEPOSIT_PERCENT);
  const depositGstCents = percentOf(depositExGstCents, GST_RATE_PERCENT);
  const depositIncGstCents = depositExGstCents + depositGstCents;
  const balanceExGstCents = projectExGstCents - depositExGstCents;
  const balanceGstCents = projectGstCents - depositGstCents;
  const balanceIncGstCents = balanceExGstCents + balanceGstCents;

  return {
    projectExGstCents,
    projectGstCents,
    projectIncGstCents,
    depositExGstCents,
    depositGstCents,
    depositIncGstCents,
    balanceExGstCents,
    balanceGstCents,
    balanceIncGstCents,
  };
}

export function calculateHostingAmounts() {
  const hostingGstCents = percentOf(HOSTING_EX_GST_CENTS, GST_RATE_PERCENT);
  return {
    hostingExGstCents: HOSTING_EX_GST_CENTS,
    hostingGstCents,
    hostingIncGstCents: HOSTING_EX_GST_CENTS + hostingGstCents,
  };
}

export function formatAud(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error("cents must be an integer");
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

export function nextBrisbaneFirstUnix(now = new Date()) {
  const brisbaneOffsetMs = 10 * 60 * 60 * 1000;
  const brisbaneNow = new Date(now.getTime() + brisbaneOffsetMs);
  const year = brisbaneNow.getUTCFullYear();
  const month = brisbaneNow.getUTCMonth();
  const nextFirstAtFivePastMidnightUtc = Date.UTC(year, month + 1, 1, 0, 5);
  return Math.floor((nextFirstAtFivePastMidnightUtc - brisbaneOffsetMs) / 1000);
}

