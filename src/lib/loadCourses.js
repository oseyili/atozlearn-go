import { supabase } from "../supabaseClient";

export async function loadCourses({ subjectId = null, search = "", limit = 200 } = {}) {
  // Subjects list
  const { data: subjects, error: subjectsError } = await supabase
    .from("portal_subjects")
    .select("id,name")
    .order("name", { ascending: true });

  if (subjectsError) {
    console.error("loadCourses subjectsError:", subjectsError);
    return { courses: [], subjects: [], error: subjectsError.message };
  }

  // Subject counts (NOTE: 105,800 mappings is big; this is OK short-term but we can optimize next)
  const { data: mappings, error: mappingsError } = await supabase
    .from("portal_course_subjects")
    .select("subject_id,course_id");

  if (mappingsError) {
    console.error("loadCourses mappingsError:", mappingsError);
    return { courses: [], subjects: [], error: mappingsError.message };
  }

  const counts = new Map();
  for (const m of mappings || []) {
    counts.set(m.subject_id, (counts.get(m.subject_id) || 0) + 1);
  }

  const subjectsWithCounts = (subjects || []).map((s) => ({
    id: s.id,
    name: s.name,
    course_count: counts.get(s.id) || 0,
  }));

  // Courses (LEFT join so we never drop courses)
  let q = supabase
    .from("portal_courses")
    .select(
      `
      id,
      title,
      description,
      provider,
      external_id,
      source_url,
      language,
      level,
      duration_hours,
      image_url,
      is_paid,
      currency,
      list_price,
      is_published,
      created_at,
      updated_at,
      portal_course_subjects (
        is_primary,
        subject_id,
        portal_subjects (
          id,
          name
        )
      )
    `
    )
    .eq("is_published", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  // Filter by subject using the mapping table field (works with LEFT join too)
  if (subjectId) {
    q = q.eq("portal_course_subjects.subject_id", subjectId);
  }

  if (search && search.trim()) {
    q = q.ilike("title", `%${search.trim()}%`);
  }

  const { data: raw, error: coursesError } = await q;

  if (coursesError) {
    console.error("loadCourses coursesError:", coursesError);
    return { courses: [], subjects: subjectsWithCounts, error: coursesError.message };
  }

  // Pick the PRIMARY subject if present; otherwise first subject; otherwise General
  const courses = (raw || []).map((c) => {
    const rows = Array.isArray(c.portal_course_subjects) ? c.portal_course_subjects : [];
    const primary = rows.find((r) => r.is_primary) || rows[0];

    const subjectName =
      primary?.portal_subjects?.name ||
      primary?.portal_subjects?.[0]?.name ||
      "General";

    return { ...c, subject: subjectName };
  });

  return { courses, subjects: subjectsWithCounts, error: null };
}
