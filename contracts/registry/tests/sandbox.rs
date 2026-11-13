use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

#[tokio::test]
#[ignore = "requires compiled WASM and the NEAR sandbox binary"]
async fn actual_wasm_publication_and_revision() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/target/wasm32-unknown-unknown/release/near_underwrite_registry.wasm"))?;
    let contract = worker.dev_deploy(&wasm).await?;
    contract.call("new").transact().await?.into_result()?;
    let alice = worker.dev_create_account().await?;
    let first = alice
        .call(contract.id(), "publish")
        .args_json(json!({
            "report_digest": "a".repeat(64),
            "evidence_digest": "b".repeat(64),
            "model_digest": "c".repeat(64),
            "schema_version": "near-underwrite.bundle.v1",
            "parent_id": null
        }))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;
    let first_value: serde_json::Value = first.json()?;
    let first_id = first_value["publication_id"].as_str().unwrap();
    let second = alice
        .call(contract.id(), "publish")
        .args_json(json!({
            "report_digest": "d".repeat(64),
            "evidence_digest": "e".repeat(64),
            "model_digest": "f".repeat(64),
            "schema_version": "near-underwrite.bundle.v1",
            "parent_id": first_id
        }))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;
    let second_value: serde_json::Value = second.json()?;
    assert_eq!(second_value["lineage_root_id"], first_id);
    let count: u64 = contract.view("get_author_count").args_json(json!({ "author": alice.id() })).await?.json()?;
    assert_eq!(count, 2);
    Ok(())
}
