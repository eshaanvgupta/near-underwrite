# Reproducible walkthrough and demo script

Run Docker Compose from DEPLOYMENT.md. The application uses cached mainnet evidence, and publication transactions use testnet.

1. Evidence board: open the monetary-balance claim. Show source times, finalized height, uncertainty, and counterargument.
2. Workbench: base case shows +10,000,000 NEAR scenario net monetary change and 285,714.28571429 NEAR working-capital inventory. Change annual burn to 30,000,000; net change becomes −10,000,000. Change holding duration from two days to 0.25; inventory declines separately.
3. Save workspace, reload, and restore. Save Scenario A; change one assumption and compare its change separately from block/supply observations.
4. AI room: show disabled requests without a user key. With an authorized user key, discover a model and separately authorize Bull, Bear, and Synthesis. Show reported usage and cited IDs. No paid inference was run during this release's checks; local provider mocks are explicitly test fixtures.
5. Freeze and export JSON/CSV/HTML. Print or save PDF from the HTML report.
6. Registry: inspect the exact public fields before signing. Download the recorded report and use its publication ID in the verifier. Alter one note and observe mismatch.
7. Show the linked revision and final testnet transactions in evidence/deployment.json.

## Recorded chain proof

- Original publication: `56e4078379bdd86fdc54bb71ae89047d74282a6243bcaee071f446ffa6e6f79b`.
- Revision: `1c3a2a24bdb595dbca63db0a687726f72ec4765638bb3f3e75c9cad6b51008c4`, whose parent is the original.
- Report bundles: evidence/report.json and evidence/report-v2.json.
- Each read-only verification command in README returns matching for calculations and registry.

## 75-second video script

0–10s: “NEAR usage is measurable. The research question is whether that usage creates persistent demand for the token.” Open the populated claim.

10–25s: “Every claim links to observations, assumptions, a formula, and a condition that could disprove it.” Expand the claim and show uncertainty.

25–40s: “More transactions do not automatically increase value.” Change burn and holding duration; show monetary supply and inventory responding to different inputs.

40–52s: “Users can challenge the same frozen evidence with Bull, Bear, and Synthesis using their own credentials.” Show setup and the three explicit request buttons. Only show actual model output if a human has authorized a real call.

52–65s: “The report travels with its evidence.” Export JSON and show a matching verifier result against the original testnet publication.

65–75s: “Revisions keep history.” Show the second record's parent and the code-hash identity. “These commitments prove integrity and timing; the underlying thesis remains open to challenge.”

An actual continuous local walkthrough is recorded at [evidence/demo/research-workflow.webm](evidence/demo/research-workflow.webm). It shows real captured mainnet data, scenario edits, report export, and a live read-only matching check against the deployed testnet registry. It includes no AI inference or wallet-signing claim. The human decides whether to post it and must resolve the two-entry eligibility cap before a new submission.
