import { useLiveSource } from "../../api/LiveSourceContext";
import { buildEpcrForm, type EpcrForm } from "../../api/epcrForm";
import { EPCR_SECTIONS, EPCR_TABS } from "../../data/epcr";
import type { Role } from "../../data/users";
import { HANDOFF_REQUIRED_KEYS } from "../../incident/selectors";

/** the ePCR for the call on screen, from that role's side. the sample call keeps its figma sheet */
export function useEpcrForm(role: Role): EpcrForm {
  const live = useLiveSource();
  if (live.source === "demo") return { tabs: [...EPCR_TABS], sections: [...EPCR_SECTIONS], requiredKeys: [...HANDOFF_REQUIRED_KEYS] };
  return buildEpcrForm(live.session?.epcr, role);
}
