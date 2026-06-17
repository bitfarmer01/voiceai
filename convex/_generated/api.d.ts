/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _contracts from "../_contracts.js";
import type * as budget from "../budget.js";
import type * as businesses from "../businesses.js";
import type * as calls from "../calls.js";
import type * as guard from "../guard.js";
import type * as http from "../http.js";
import type * as lib___fixtures___vapiEndOfCallReport from "../lib/__fixtures__/vapiEndOfCallReport.js";
import type * as lib_vapiReport from "../lib/vapiReport.js";
import type * as lifecycle from "../lifecycle.js";
import type * as providerStats from "../providerStats.js";
import type * as providers from "../providers.js";
import type * as seed from "../seed.js";
import type * as spans from "../spans.js";
import type * as telemetry from "../telemetry.js";
import type * as tools from "../tools.js";
import type * as transcriptTurns from "../transcriptTurns.js";
import type * as voiceRatings from "../voiceRatings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _contracts: typeof _contracts;
  budget: typeof budget;
  businesses: typeof businesses;
  calls: typeof calls;
  guard: typeof guard;
  http: typeof http;
  "lib/__fixtures__/vapiEndOfCallReport": typeof lib___fixtures___vapiEndOfCallReport;
  "lib/vapiReport": typeof lib_vapiReport;
  lifecycle: typeof lifecycle;
  providerStats: typeof providerStats;
  providers: typeof providers;
  seed: typeof seed;
  spans: typeof spans;
  telemetry: typeof telemetry;
  tools: typeof tools;
  transcriptTurns: typeof transcriptTurns;
  voiceRatings: typeof voiceRatings;
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
