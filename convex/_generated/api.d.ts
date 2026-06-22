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
import type * as chat from "../chat.js";
import type * as guard from "../guard.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as knowledgeChunks from "../knowledgeChunks.js";
import type * as leads from "../leads.js";
import type * as lib___fixtures___vapiEndOfCallReport from "../lib/__fixtures__/vapiEndOfCallReport.js";
import type * as lib_bookingSlot from "../lib/bookingSlot.js";
import type * as lib_hours from "../lib/hours.js";
import type * as lib_ingest_helpers from "../lib/ingest_helpers.js";
import type * as lib_vapiReport from "../lib/vapiReport.js";
import type * as lib_vapiWire from "../lib/vapiWire.js";
import type * as lifecycle from "../lifecycle.js";
import type * as ownerStats from "../ownerStats.js";
import type * as providerStats from "../providerStats.js";
import type * as providers from "../providers.js";
import type * as seed from "../seed.js";
import type * as seedPresets from "../seedPresets.js";
import type * as sources from "../sources.js";
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
  chat: typeof chat;
  guard: typeof guard;
  http: typeof http;
  ingest: typeof ingest;
  knowledgeChunks: typeof knowledgeChunks;
  leads: typeof leads;
  "lib/__fixtures__/vapiEndOfCallReport": typeof lib___fixtures___vapiEndOfCallReport;
  "lib/bookingSlot": typeof lib_bookingSlot;
  "lib/hours": typeof lib_hours;
  "lib/ingest_helpers": typeof lib_ingest_helpers;
  "lib/vapiReport": typeof lib_vapiReport;
  "lib/vapiWire": typeof lib_vapiWire;
  lifecycle: typeof lifecycle;
  ownerStats: typeof ownerStats;
  providerStats: typeof providerStats;
  providers: typeof providers;
  seed: typeof seed;
  seedPresets: typeof seedPresets;
  sources: typeof sources;
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
