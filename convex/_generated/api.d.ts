/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as automation from "../automation.js";
import type * as crons from "../crons.js";
import type * as data from "../data.js";
import type * as generatedContent from "../generatedContent.js";
import type * as queries from "../queries.js";
import type * as seed from "../seed.js";
import type * as telegram from "../telegram.js";
import type * as terminalSupport from "../terminalSupport.js";
import type * as workKinds from "../workKinds.js";
import type * as x from "../x.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  automation: typeof automation;
  crons: typeof crons;
  data: typeof data;
  generatedContent: typeof generatedContent;
  queries: typeof queries;
  seed: typeof seed;
  telegram: typeof telegram;
  terminalSupport: typeof terminalSupport;
  workKinds: typeof workKinds;
  x: typeof x;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
