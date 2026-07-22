import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateHostingAmounts,
  calculateProjectAmounts,
  nextBrisbaneFirstUnix,
} from "../functions/_shared/commercial.js";

test("calculates the standard 30/70 project split including GST", () => {
  assert.deepEqual(calculateProjectAmounts(), {
    projectExGstCents: 495000,
    projectGstCents: 49500,
    projectIncGstCents: 544500,
    depositExGstCents: 148500,
    depositGstCents: 14850,
    depositIncGstCents: 163350,
    balanceExGstCents: 346500,
    balanceGstCents: 34650,
    balanceIncGstCents: 381150,
  });
});

test("calculates monthly hosting including GST", () => {
  assert.deepEqual(calculateHostingAmounts(), {
    hostingExGstCents: 9900,
    hostingGstCents: 990,
    hostingIncGstCents: 10890,
  });
});

test("anchors hosting to the next first in Brisbane without proration", () => {
  const anchor = nextBrisbaneFirstUnix(new Date("2026-07-22T02:00:00.000Z"));
  assert.equal(
    new Date(anchor * 1000).toISOString(),
    "2026-07-31T14:05:00.000Z",
  );
});

