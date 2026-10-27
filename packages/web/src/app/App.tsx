import { RouterProvider } from "react-router";
import { LiveSourceProvider } from "../api/LiveSourceContext";
import { IncidentProvider } from "../incident/IncidentContext";
import { SessionProvider } from "../session/SessionContext";
import { router } from "./router";

export function App() {
  return (
    <SessionProvider>
      <LiveSourceProvider>
        <IncidentProvider>
          <RouterProvider router={router} />
        </IncidentProvider>
      </LiveSourceProvider>
    </SessionProvider>
  );
}
