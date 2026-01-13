import { supabase } from "./supabase";

export async function loadAllCourses() {
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // de-duplicate safety
  const map = new Map();
  for (const c of all) map.set(c.id, c);
  return [...map.values()];
}
