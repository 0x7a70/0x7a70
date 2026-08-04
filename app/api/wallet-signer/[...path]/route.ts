import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { balanceRequestSchema, executionRequestSchema, walletRequestSchema } from "@/lib/wallet-signer/policy";
import { authorizeSigner, executeTransaction, provisionWallet, walletBalance } from "@/lib/wallet-signer/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "invalid signer request" }, { status: 400 });
  const message = error instanceof Error ? error.message : "signer request failed";
  const safe = /disabled|configured|limit|reserve|insufficient|invalid|unverified|unsupported|mismatch|simulation|revert|quote|receipt|claim/i.test(message)
    ? message : "signer request failed";
  console.error("wallet_signer_failed", { reason: safe });
  return NextResponse.json({ error: safe }, { status: 400 });
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!authorizeSigner(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") || "0") > 16_384) return NextResponse.json({ error: "request too large" }, { status: 413 });
  try {
    const body = await request.json();
    const path = (await context.params).path.join("/");
    if (path === "v1/wallets") {
      const input = walletRequestSchema.parse(body);
      return NextResponse.json(await provisionWallet(input.ownerReference));
    }
    if (path === "v1/wallets/balance") {
      const input = balanceRequestSchema.parse(body);
      if (input.walletRef.toLowerCase() !== input.expectedAddress.toLowerCase()) throw new Error("wallet reference mismatch");
      const expected = await provisionWallet(input.ownerReference);
      if (expected.address.toLowerCase() !== input.expectedAddress.toLowerCase()) throw new Error("wallet owner mismatch");
      return NextResponse.json(await walletBalance(input.expectedAddress as `0x${string}`, input.token));
    }
    if (path === "v1/transactions/execute") return NextResponse.json(await executeTransaction(executionRequestSchema.parse(body)));
    return NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
