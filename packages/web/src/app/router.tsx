import { createBrowserRouter } from "react-router";
import { SignInPage } from "../features/auth/SignInPage";
import { FireHomePage } from "../features/fire/FireHomePage";
import { FireRecordPage } from "../features/fire/FireRecordPage";
import { HandoffPage } from "../features/handoff/HandoffPage";
import { ParamedicHomePage } from "../features/paramedic/ParamedicHomePage";
import { ParamedicRecordPage } from "../features/paramedic/ParamedicRecordPage";
import { RequireRole } from "./RequireRole";
import { ResetDemo } from "./ResetDemo";

export const router = createBrowserRouter([
  { path: "/", element: <SignInPage /> },
  { path: "/reset", element: <ResetDemo /> },
  {
    path: "/fire",
    element: <RequireRole role="firefighter" />,
    children: [
      { index: true, element: <FireHomePage /> },
      { path: "record", element: <FireRecordPage /> },
    ],
  },
  {
    path: "/paramedic",
    element: <RequireRole role="paramedic" />,
    children: [
      { index: true, element: <ParamedicHomePage /> },
      { path: "record", element: <ParamedicRecordPage /> },
    ],
  },
  /* the secure link the triage nurse scans, no account, read-only */
  { path: "/handoff/:token", element: <HandoffPage /> },
]);
