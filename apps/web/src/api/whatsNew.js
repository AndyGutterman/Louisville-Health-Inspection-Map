// What's New's lists: get_latest_inspections, get_whats_new and get_top_scores (the tabs
// in lib/whatsNew.js name them). 20 rows each, read the first time a tab is shown.
import { supabase } from "../lib/supabase.js";

/** @returns the request for one tab's rows ({ data, error }) */
export const fetchWhatsNewList = (rpc) => supabase.rpc(rpc, { limit_n: 20 });
