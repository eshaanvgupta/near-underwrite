use near_sdk::store::{LookupMap, Vector};
use near_sdk::json_types::U64;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
};

const DOMAIN: &[u8] = b"NEAR_UNDERWRITE_PUBLICATION_V1\0";
const MAX_SCHEMA_BYTES: usize = 64;
const MAX_PARENT_BYTES: usize = 64;
const MAX_PAGE: u32 = 100;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Publications,
    IdToIndex,
    AuthorCounts,
    AuthorIndex,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Publication {
    pub publication_id: String,
    pub author: AccountId,
    pub report_digest: String,
    pub evidence_digest: String,
    pub model_digest: String,
    pub schema_version: String,
    pub parent_id: Option<String>,
    pub lineage_root_id: String,
    pub block_height: U64,
    pub chain_timestamp_ns: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    publications: Vector<Publication>,
    id_to_index: LookupMap<String, u64>,
    author_counts: LookupMap<AccountId, u64>,
    author_index: LookupMap<String, String>,
}

#[near]
impl Registry {
    #[init]
    pub fn new() -> Self {
        Self {
            publications: Vector::new(StorageKey::Publications),
            id_to_index: LookupMap::new(StorageKey::IdToIndex),
            author_counts: LookupMap::new(StorageKey::AuthorCounts),
            author_index: LookupMap::new(StorageKey::AuthorIndex),
        }
    }

    #[payable]
    pub fn publish(
        &mut self,
        report_digest: String,
        evidence_digest: String,
        model_digest: String,
        schema_version: String,
        parent_id: Option<String>,
    ) -> Publication {
        let initial_storage = env::storage_usage();
        let author = env::predecessor_account_id();
        let report = decode_digest(&report_digest, "report_digest");
        let evidence = decode_digest(&evidence_digest, "evidence_digest");
        let model = decode_digest(&model_digest, "model_digest");
        require!(!schema_version.is_empty() && schema_version.len() <= MAX_SCHEMA_BYTES, "schema_version must be 1..64 bytes");
        if let Some(parent) = &parent_id {
            require!(!parent.is_empty() && parent.len() <= MAX_PARENT_BYTES, "parent_id must be at most 64 bytes");
        }

        let (lineage_root_id, parent_record) = match &parent_id {
            Some(parent) => {
                let record = self.get_publication(parent.clone()).unwrap_or_else(|| env::panic_str("parent publication does not exist"));
                require!(record.author == author, "parent publication belongs to another author");
                (record.lineage_root_id.clone(), Some(record))
            }
            None => (String::new(), None),
        };

        let block_height = env::block_height();
        let chain_timestamp_ns = env::block_timestamp();
        let publication_id = commitment_id(
            &author,
            &report,
            &evidence,
            &model,
            &schema_version,
            parent_id.as_deref(),
            block_height,
            chain_timestamp_ns,
        );
        require!(self.id_to_index.get(&publication_id).is_none(), "publication already exists");

        let final_root = if parent_record.is_some() { lineage_root_id } else { publication_id.clone() };
        let publication = Publication {
            publication_id: publication_id.clone(),
            author: author.clone(),
            report_digest,
            evidence_digest,
            model_digest,
            schema_version,
            parent_id,
            lineage_root_id: final_root,
            block_height: U64(block_height),
            chain_timestamp_ns: U64(chain_timestamp_ns),
        };
        let index = self.publications.len() as u64;
        self.publications.push(publication.clone());
        self.id_to_index.insert(publication_id.clone(), index);
        let author_count = self.author_counts.get(&author).copied().unwrap_or(0);
        self.author_index.insert(author_key(&author, author_count), publication_id.clone());
        self.author_counts.insert(author.clone(), author_count.checked_add(1).expect("author publication count overflow"));

        self.publications.flush();
        self.id_to_index.flush();
        self.author_counts.flush();
        self.author_index.flush();
        let bytes = env::storage_usage().checked_sub(initial_storage).expect("storage usage underflow");
        let required = env::storage_byte_cost()
            .checked_mul(bytes as u128)
            .unwrap_or_else(|| env::panic_str("storage cost overflow"));
        let attached = env::attached_deposit();
        require!(attached >= required, format!("insufficient storage deposit: require {} yoctoNEAR", required.as_yoctonear()));
        let refund = attached.checked_sub(required).expect("deposit subtraction underflow");
        if refund > NearToken::from_yoctonear(1) {
            Promise::new(author.clone()).transfer(refund).detach();
        }
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"near_underwrite\",\"version\":\"1.0.0\",\"event\":\"publication_created\",\"data\":[{{\"publication_id\":\"{}\",\"author\":\"{}\",\"parent_id\":{}}}]}}",
            publication_id,
            author,
            publication.parent_id.as_ref().map(|id| format!("\"{}\"", id)).unwrap_or_else(|| "null".to_string())
        ));
        publication
    }

    pub fn get_publication(&self, publication_id: String) -> Option<Publication> {
        self.id_to_index
            .get(&publication_id)
            .and_then(|index| self.publications.get(*index as u32))
            .cloned()
    }

    pub fn get_author_count(&self, author: AccountId) -> u64 {
        self.author_counts.get(&author).copied().unwrap_or(0)
    }

    pub fn get_author_history(&self, author: AccountId, from_index: Option<u64>, limit: Option<u32>) -> Vec<Publication> {
        let start = from_index.unwrap_or(0);
        let take = limit.unwrap_or(20).min(MAX_PAGE);
        let count = self.get_author_count(author.clone());
        if start >= count {
            return vec![];
        }
        (start..count.min(start.saturating_add(take as u64)))
            .filter_map(|author_position| self.author_index.get(&author_key(&author, author_position)))
            .filter_map(|id| self.get_publication(id.clone()))
            .collect()
    }

    pub fn total_publications(&self) -> u64 {
        self.publications.len() as u64
    }

    pub fn publication_domain(&self) -> String {
        String::from_utf8(DOMAIN.to_vec()).expect("domain is utf8")
    }
}

fn author_key(author: &AccountId, index: u64) -> String {
    format!("{}\0{:020}", author, index)
}

fn decode_digest(value: &str, name: &str) -> [u8; 32] {
    require!(value.len() == 64, format!("{name} must be exactly 64 lowercase hexadecimal characters"));
    require!(value.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)), format!("{name} must be lowercase hexadecimal"));
    let mut output = [0u8; 32];
    for (index, chunk) in value.as_bytes().chunks_exact(2).enumerate() {
        output[index] = (hex_nibble(chunk[0]) << 4) | hex_nibble(chunk[1]);
    }
    output
}

fn hex_nibble(value: u8) -> u8 {
    match value {
        b'0'..=b'9' => value - b'0',
        b'a'..=b'f' => value - b'a' + 10,
        _ => env::panic_str("invalid lowercase hexadecimal"),
    }
}

fn push_lp32(buffer: &mut Vec<u8>, value: &[u8]) {
    let length = u32::try_from(value.len()).unwrap_or_else(|_| env::panic_str("field too long"));
    buffer.extend_from_slice(&length.to_le_bytes());
    buffer.extend_from_slice(value);
}

fn commitment_id(
    author: &AccountId,
    report: &[u8; 32],
    evidence: &[u8; 32],
    model: &[u8; 32],
    schema_version: &str,
    parent_id: Option<&str>,
    block_height: u64,
    chain_timestamp_ns: u64,
) -> String {
    let mut preimage = Vec::with_capacity(256);
    preimage.extend_from_slice(DOMAIN);
    push_lp32(&mut preimage, author.as_bytes());
    preimage.extend_from_slice(report);
    preimage.extend_from_slice(evidence);
    preimage.extend_from_slice(model);
    push_lp32(&mut preimage, schema_version.as_bytes());
    match parent_id {
        Some(parent) => {
            preimage.push(1);
            push_lp32(&mut preimage, parent.as_bytes());
        }
        None => preimage.push(0),
    }
    preimage.extend_from_slice(&block_height.to_le_bytes());
    preimage.extend_from_slice(&chain_timestamp_ns.to_le_bytes());
    env::sha256_array(&preimage).iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, NearToken};

    fn context(predecessor: &str, timestamp: u64) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("registry.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .block_height(123)
            .block_timestamp(timestamp)
            .account_balance(NearToken::from_near(100))
            .attached_deposit(NearToken::from_near(1));
        testing_env!(builder.build());
    }

    fn digest(ch: char) -> String {
        std::iter::repeat_n(ch, 64).collect()
    }

    #[test]
    fn publishes_append_only_revision_lineage_and_pages() {
        context("alice.testnet", 1000);
        let mut registry = Registry::new();
        let first = registry.publish(digest('a'), digest('b'), digest('c'), "near-underwrite.bundle.v1".into(), None);
        context("alice.testnet", 1001);
        let second = registry.publish(digest('d'), digest('e'), digest('f'), "near-underwrite.bundle.v1".into(), Some(first.publication_id.clone()));
        assert_eq!(second.parent_id, Some(first.publication_id.clone()));
        assert_eq!(second.lineage_root_id, first.publication_id);
        assert_eq!(registry.get_author_count("alice.testnet".parse().unwrap()), 2);
        assert_eq!(registry.get_author_history("alice.testnet".parse().unwrap(), Some(1), Some(1))[0].publication_id, second.publication_id);
    }

    #[test]
    #[should_panic(expected = "lowercase hexadecimal")]
    fn rejects_invalid_hash_encoding() {
        context("alice.testnet", 1000);
        Registry::new().publish(digest('A'), digest('b'), digest('c'), "v1".into(), None);
    }

    #[test]
    #[should_panic(expected = "another author")]
    fn rejects_cross_author_parent() {
        context("alice.testnet", 1000);
        let mut registry = Registry::new();
        let first = registry.publish(digest('a'), digest('b'), digest('c'), "v1".into(), None);
        context("bob.testnet", 1001);
        registry.publish(digest('d'), digest('e'), digest('f'), "v1".into(), Some(first.publication_id));
    }

    #[test]
    #[should_panic(expected = "insufficient storage deposit")]
    fn rejects_underfunded_storage() {
        let mut builder = VMContextBuilder::new();
        builder.current_account_id("registry.testnet".parse().unwrap()).predecessor_account_id("alice.testnet".parse().unwrap()).attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(builder.build());
        Registry::new().publish(digest('a'), digest('b'), digest('c'), "v1".into(), None);
    }

    #[test]
    #[should_panic(expected = "parent publication does not exist")]
    fn rejects_missing_parent() {
        context("alice.testnet", 1000);
        Registry::new().publish(digest('a'), digest('b'), digest('c'), "v1".into(), Some(digest('d')));
    }

    #[test]
    #[should_panic(expected = "schema_version must be")]
    fn rejects_oversized_schema() {
        context("alice.testnet", 1000);
        Registry::new().publish(digest('a'), digest('b'), digest('c'), "v".repeat(65), None);
    }
}
