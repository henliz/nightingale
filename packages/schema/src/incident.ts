import { z } from "zod";
import { IsoDateTime } from "./common.js";

export const Incident = z.object({
  id: z.string(),
  createdAt: IsoDateTime,
  orgsInvolved: z.array(z.string()),
  /** needs destinationConfirmed true before ED can see anything, don't skip this check */
  destinationHospitalId: z.string().optional(),
  destinationConfirmed: z.boolean(),
});
export type Incident = z.infer<typeof Incident>;
