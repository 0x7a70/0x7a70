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

export type EventType = "initialization" | "corruption" | "hobby_added" | "hobby_removed" | "thought";

export type PatchEvent = {
  _id?: string;
  type: EventType;
  potatoSlug: string;
  potatoName: string;
  text: string;
  createdAt: number;
  delta?: number;
  hobbySlug?: string;
};

export type TerminalTurn = { role: "user" | "potato"; text: string };
export type TerminalResponse = { reply: string; timestamp: number; fallback: boolean };
