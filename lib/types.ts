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

export type EventType = "initialization" | "corruption" | "hobby_added" | "hobby_removed" | "thought" | "work_created";

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
  shareSummary: string;
  shareAction: string;
  webAscii: string;
  xAscii: string;
  telegramAscii: string;
  corruptionAtCreation: number;
  createdAt: number;
};

export type TerminalTurn = { role: "user" | "potato"; text: string };
export type TerminalResponse = { reply: string; timestamp: number; fallback: boolean };
