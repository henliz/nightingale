import { fallWithFracture } from "./scenarios/fall-with-fracture.js";
import { mvaSingleVehicle } from "./scenarios/mva-single-vehicle.js";

export type { Scenario } from "./scenario.js";
export { fallWithFracture } from "./scenarios/fall-with-fracture.js";
export { mvaSingleVehicle } from "./scenarios/mva-single-vehicle.js";

export const scenarios = [fallWithFracture, mvaSingleVehicle];
