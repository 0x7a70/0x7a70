export type Potato = {
  _id?: string;
  slug: string;
  name: string;
  corruption: number;
  hobbySlugs: string[];
  createdAt: number;
  updatedAt: number;
};

export type Hobby = {
  _id?: string;
  slug: string;
  title: string;
};

export type EventType = "initialization" | "corruption" | "hobby_added" | "hobby_removed" | "thought" | "work_created" | "token_launched";

export type PatchEvent = {
  _id?: string;
  type: EventType;
  potatoSlug: string;
  potatoName: string;
  text: string;
  createdAt: number;
  delta?: number;
  hobbySlug?: string;
  workSlug?: string;
  workTitle?: string;
  tokenAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
};

export type Work = {
  _id?: string;
  slug: string;
  potatoSlug: string;
  potatoName: string;
  hobbySlug: string;
  hobbyTitle: string;
  title: string;
  description: string;
  insight?: string;
  shareSummary: string;
  shareAction: string;
  webAscii: string;
  xAscii: string;
  telegramAscii: string;
  corruptionAtCreation: number;
  createdAt: number;
};

export type TokenLaunch = {
  name: string;
  symbol: string;
  imageUri: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  devBuyWei: string;
  transactionHash: string;
  tokenAddress: string;
  poolAddress?: string;
  positionId?: string;
  devBuySucceeded?: boolean;
  createdAt: number;
  updatedAt: number;
  launcherUsername?: string;
};

export type TerminalTurn = { role: "user" | "potato"; text: string };
export type TerminalResponse = { reply: string; timestamp: number; fallback: boolean };
