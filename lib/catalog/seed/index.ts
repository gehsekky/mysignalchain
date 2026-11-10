/** Everything the catalog sync loads. See docs/PLAN.md, "Data model". */
import { amps } from "./amps";
import { brands } from "./brands";
import { categories } from "./categories";
import { pedals } from "./pedals";
import { rig } from "./rig";

export { brands, categories };
export const seedItems = [...pedals, ...rig, ...amps];
