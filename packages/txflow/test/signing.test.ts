import { bytesToHex, hashStruct, hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { NETWORKS } from "../src/config";
import {
  actionMsgpack,
  agentTypedData,
  connectionId,
  directTypedData,
  signAgent,
  signDirect,
  type ApproveAgentAction,
} from "../src/signing";

// Test vectors from https://docs.txflow.com/api/signing#test-vectors
const net = NETWORKS.testnet;
const key = `0x${"ab".repeat(32)}` as const;
const account = privateKeyToAccount(key);

const orderAction = {
  type: "order",
  grouping: "na",
  orders: [{ a: 1, b: true, p: "50000.0", s: "0.01", r: false, t: { limit: { tif: "Gtc" } } }],
};

const approveAgent: ApproveAgentAction = {
  type: "approveAgent",
  txflowNetwork: "TxFlow-Testnet",
  chainId: 2511,
  apiVersion: 1,
  agentAddress: "0x0202020202020202020202020202020202020202",
  agentName: "my-trading-bot",
  nonce: 2000,
};

describe("signing test vectors", () => {
  it("uses the documented throwaway key", () => {
    expect(account.address.toLowerCase()).toBe("0xe239cdc5fbe977a8a141b72194d3cf8c41bc5bc6");
  });

  it("order: msgpack bytes", () => {
    expect(bytesToHex(actionMsgpack(orderAction))).toBe(
      "0x82a867726f7570696e67a26e61a66f72646572739186a16101a162c3a170a735303030302e30a173a4302e3031a172c2a17481a56c696d697481a3746966a3477463",
    );
  });

  it("order: connectionId", () => {
    expect(connectionId(orderAction, 1700000000000)).toBe(
      "0x6546d1c3acf430a28a0b2552c66e985f6543646660874734732ae9e9daf4d806",
    );
  });

  it("order: signingHash and signature", async () => {
    const td = agentTypedData(net, connectionId(orderAction, 1700000000000));
    expect(hashTypedData(td)).toBe("0xeae1ae63709636fb9567accd33bc5dd2717bfac4d97e9a853f91c7fb391e1cc6");
    const env = await signAgent(net, account, orderAction, 1700000000000);
    expect(env.signature).toEqual({
      r: "0x4064848dd881985c52dacdc00f7046f1010f7f370e34620d36fcf3b2d1ecb3e0",
      s: "0x25c45ad67b9506ac653fc3658f47aa8b6002bfa86a31ae619b334d71aa8b4f6f",
      v: 27,
    });
    expect(env.nonce).toBe(1700000000000);
  });

  it("approveAgent: structHash, signingHash and signature", async () => {
    const td = directTypedData(net, approveAgent);
    expect(
      hashStruct({ data: td.message as never, primaryType: "ApproveAgent" as never, types: td.types as never }),
    ).toBe("0xbb5293971660f3252f455b6debbda781841fb23bd45cbbf0199c4de5250573b9");
    expect(hashTypedData(td)).toBe("0x1df22801b48ae1402ad36b244aa245fd6e842fa5fef2c40819b1e6c661cd2212");
    const env = await signDirect(net, account, approveAgent);
    expect(env.signature).toEqual({
      r: "0x4431d4afb9fcd0dcd619afd55a7044cc26cb0ee1d436a1b06d836da217842ead",
      s: "0x54a0755ee3d8c241235a1828a2be732d72e9c152b5de25fc7c169966de4210f7",
      v: 27,
    });
    expect(env.nonce).toBe(2000);
  });
});
