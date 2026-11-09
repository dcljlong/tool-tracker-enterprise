// The screens import this. When Supabase settings are present the app talks to Supabase;
// otherwise it falls back to the old FastAPI server (REACT_APP_BACKEND_URL) so nothing breaks mid-move.
import restApi from "./restApi";
import supabaseApi from "./supabaseApi";
import { useSupabase } from "./siteConfig";

const api = useSupabase ? supabaseApi : restApi;

export default api;
