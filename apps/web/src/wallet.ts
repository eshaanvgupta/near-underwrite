import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

export interface WalletConnection {
  selector: WalletSelector;
  modal: WalletSelectorModal;
}

export async function setupTestnetWallet(contractId: string): Promise<WalletConnection> {
  const selector = await setupWalletSelector({
    network: "testnet",
    modules: [setupMyNearWallet()],
  });
  const modal = setupModal(selector, { contractId, description: "Publish a NEAR UNDERWRITE research commitment on testnet." });
  return { selector, modal };
}

export async function viewRegistry(contractId: string, methodName: string, args: unknown): Promise<unknown> {
  const rpc = import.meta.env.VITE_TESTNET_RPC_URL ?? "https://test.rpc.fastnear.com";
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "near-underwrite",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: methodName,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const payload = await response.json() as { result?: { result?: number[] }; error?: unknown };
  if (!payload.result?.result) throw new Error("Registry view call unavailable");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(payload.result.result)));
}
