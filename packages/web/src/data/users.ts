export type Role = "firefighter" | "paramedic";

export interface User {
  id: string;
  /** Short first name used in greetings */
  firstName: string;
  fullName: string;
  /** Account row title, e.g. "Captain" */
  title: string;
  /** Account row subtitle, e.g. "Woolwich Township Fire, Station 2" */
  org: string;
  /** Short unit/station label shown under the greeting */
  station: string;
  role: Role;
}

export const USERS: readonly User[] = [
  {
    id: "alvin",
    firstName: "Alvin",
    fullName: "Alvin Seville",
    title: "Captain",
    org: "Woolwich Township Fire, Station 2",
    station: "Guelph station",
    role: "firefighter",
  },
  {
    id: "rick",
    firstName: "Rick",
    fullName: "Rick Sanchez",
    title: "Primary Care Paramedic",
    org: "Region of Waterloo Paramedic Services, Unit 4471",
    station: "Guelph-Wellington Paramedic Service",
    role: "paramedic",
  },
];

export function findUser(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}
