import { z } from "zod";

export const OrgType = z.enum(["fire", "paramedic", "hospital"]);
export type OrgType = z.infer<typeof OrgType>;

export const Org = z.object({
  id: z.string(),
  type: OrgType,
  name: z.string(),
  /** set by the custodian, we don't get to pick this for them */
  retentionDays: z.number().int().positive(),
});
export type Org = z.infer<typeof Org>;
