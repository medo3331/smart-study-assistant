// @ts-expect-error -- Node --experimental-strip-types requires the .ts extension
import { DeepSeekProvider } from "./deepseek.ts";
// @ts-expect-error -- Node --experimental-strip-types requires the .ts extension
import { NvidiaProvider } from "./nvidia.ts";
// @ts-expect-error -- Node --experimental-strip-types requires the .ts extension
import { GroqProvider } from "./groq.ts";
import type { ProviderInterface } from "./types.ts";

export type { ProviderInterface, ProviderHealth } from "./types.ts";

/** Every provider the agent layer knows about. Order = preference. */
export const INTERFACES: Readonly<Record<string, ProviderInterface>> = Object.freeze({
  nvidia: NvidiaProvider,
  deepseek: new DeepSeekProvider(),
  groq: GroqProvider,
});

export { DeepSeekProvider, NvidiaProvider, GroqProvider };
