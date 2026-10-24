import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useIncidentDispatch } from "../incident/IncidentContext";
import { useSession } from "../session/SessionContext";

/** /reset restarts the story from step 0, not a designed screen */
export function ResetDemo() {
  const dispatch = useIncidentDispatch();
  const { signOut } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    dispatch({ type: "reset" });
    signOut();
    navigate("/", { replace: true });
  }, [dispatch, signOut, navigate]);
  return null;
}
