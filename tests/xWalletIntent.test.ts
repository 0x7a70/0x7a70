import { describe, expect, it } from "vitest";
import { unknownWalletMessage, walletHelpMessage } from "../convex/xWalletIntent";

describe("deterministic X wallet replies", () => {
  it("keeps every help and ambiguity response within X's limit", () => {
    const topics = ["capabilities", "wallet", "fund", "balance", "send", "buy_sell", "burn", "launch", "fees"] as const;
    for (const topic of topics) expect(walletHelpMessage(topic).length).toBeLessThanOrEqual(280);
    expect(unknownWalletMessage().length).toBeLessThanOrEqual(280);
  });

  it("uses the approved launch instructions", () => {
    expect(walletHelpMessage("launch")).toBe("Ask me for your wallet, then fund it with ETH. Ask me to launch your token with a name and ticker. An image, website, social links, and dev buy are optional. If you attach an image, I'll use it. It goes live on PotatoPad instantly.");
  });
});
