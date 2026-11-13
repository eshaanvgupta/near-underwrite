import { expect, test } from "@playwright/test";

const snapshot = {
  schema_version: "near-underwrite.snapshot.v1",
  id: "mainnet-224227015-test",
  network: "mainnet",
  created_at: "2026-11-12T12:00:00.000Z",
  finalized_block: {
    height: "224227015",
    hash: "3D2pZ1QGvND9pdcyDqg5zBdFDGvhLH2uZmrb2Jtm3uar",
    timestamp_ns: "1794493949428225703",
    timestamp_iso: "2026-11-12T12:00:00.000Z",
    total_supply_yocto: "1311524128808684245442073451159003",
    gas_price_yocto: "100000000",
    protocol_version: 88,
    chunk_ids: ["chunk"],
  },
  epoch: {
    epoch_height: "1",
    epoch_start_height: "224221937",
    validator_accounts: [
      { account_id: "a.pool.near", stake_yocto: "600" },
      { account_id: "b.pool.near", stake_yocto: "300" },
      { account_id: "c.pool.near", stake_yocto: "100" },
    ],
    beneficial_operator_caveat: "Accounts are not owners.",
  },
  protocol: {
    protocol_version: 88,
    epoch_length: "43200",
    max_inflation_rate: [1, 40],
    protocol_reward_rate: [0, 1],
    num_blocks_per_year: "31536000",
    configuration_digest: "a".repeat(64),
  },
  activity: {
    from_height: "224227013",
    to_height: "224227015",
    requested_blocks: 3,
    processed_blocks: 3,
    missing_blocks: 0,
    chunk_ids: ["chunk"],
    transaction_ids: ["tx"],
    receipt_ids: ["receipt"],
    outcome_ids: ["tx", "receipt"],
    transactions_seen: 1,
    outcomes_processed: 2,
    total_gas_burnt: "1000",
    execution_tokens_burnt_yocto: "50",
    note: "Bounded sample.",
  },
  history: [
    { date: "2026-11-11", total_supply_yocto: "1311524000000000000000000000000000", transactions: "891297", receipts: "4399044", transaction_fees_near: "931.17", transaction_volume_near: "32014594", price_usd: "3.58", market_cap_usd: "4700127150", source_digest: "b".repeat(64), quality_flags: [] },
    { date: "2026-11-10", total_supply_yocto: "1311369000000000000000000000000000", transactions: "970505", receipts: "4412473", transaction_fees_near: "1006.80", transaction_volume_near: "50033135", price_usd: "3.62", market_cap_usd: "4752056551", source_digest: "c".repeat(64), quality_flags: [] },
  ],
  observations: [
    {
      metric_id: "near.mainnet.finalized.total_supply",
      network: "mainnet",
      status: "measured",
      value: "1311524128808684245442073451159003",
      unit: "yoctoNEAR",
      source: { url: "https://free.rpc.fastnear.com", method: "block", parameters: { finality: "final" } },
      retrieved_at: "2026-11-12T12:00:00.000Z",
      source_time: "2026-11-12T12:00:00.000Z",
      block_height: "224227015",
      block_hash: "hash",
      epoch_id: "epoch",
      raw_response_digest: "d".repeat(64),
      transformation_version: "near-underwrite.collector.v1",
      quality_flags: [],
    },
    {
      metric_id: "nearblocks.daily.total_supply",
      network: "mainnet",
      status: "measured",
      value: [],
      unit: "daily records",
      source: { url: "https://api.nearblocks.io/v3/block-stats", method: "GET", parameters: { limit: 30 } },
      retrieved_at: "2026-11-12T12:00:00.000Z",
      source_time: "2026-11-11",
      block_height: null,
      block_hash: null,
      epoch_id: null,
      raw_response_digest: "e".repeat(64),
      transformation_version: "near-underwrite.collector.v1",
      quality_flags: [],
    },
  ],
  completeness: { status: "complete", problems: [] },
  source_digests: { finalized_block: "d".repeat(64), history: "e".repeat(64) },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/evidence/deployment.json", route => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/v1/workspaces/*", route => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/v1/snapshots/latest", (route) => route.fulfill({ json: snapshot }));
  await page.route("**/v1/snapshots?limit=30", (route) => route.fulfill({ json: { snapshots: [snapshot] } }));
  await page.route("**/v1/workspaces", (route) => route.fulfill({ json: route.request().postDataJSON() }));
});

test("no-key visitor inspects evidence, assumptions, and honest AI setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Usage is visible. Value capture still has to be proved." })).toBeVisible();
  await expect(page.getByText("NEAR · measured at block 224227015")).toBeVisible();
  await expect(page.getByText("No missing value is replaced with zero.")).toBeVisible();
  await page.getByRole("button", { name: "Scenario workbench" }).click();
  await expect(page.getByRole("heading", { name: "Change one bridge. See what survives." })).toBeVisible();
  await page.getByLabel("Annual actual protocol burn").fill("30000000");
  await expect(page.getByText("-10000000 NEAR")).toBeVisible();
  await page.getByRole("button", { name: "Bull / Bear room" }).click();
  await expect(page.getByText("No AI credential is in browser memory.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run one visible request" }).first()).toBeDisabled();
});

test("workspace saves and report exports a credential-free bundle", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Scenario workbench" }).click();
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText(/Saved \d/)).toBeVisible();
  await page.getByRole("button", { name: "Report & export" }).click();
  await page.getByLabel("Research notes").fill("Measured evidence and explicit assumptions remain separate.");
  await page.getByRole("button", { name: "Freeze current report" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export reproducibility JSON" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^near-underwrite-.*\.json$/);
});

test("publication screen is truthful when no deployment is configured", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Publication registry" }).click();
  await expect(page.getByText("contract not configured")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish commitment on testnet" })).toBeDisabled();
  await expect(page.getByText("A timestamped hash proves integrity and timing—not correctness.")).toBeVisible();
});

test("mobile workflow has no viewport overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "AI settings" }).click();
  await expect(page.getByRole("heading", { name: "Your provider. Your key. One request at a time." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
