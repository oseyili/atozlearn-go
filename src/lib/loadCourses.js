import { supabase } from "../supabaseClient";

/**
 * Loads courses for the Master Portal from the NEW portal schema:
 * - portal_courses
 * - portal_subjects
 * - portal_course_subjects
 *
 * Returns:
 * {
 *   courses: [{ id, title, description, subject, ... }],
 *   subjects: [{ id, name, course_count }]
 * }
 */
export async function loadCourses({
  subjectId = null,
  search = "",
  limit = 200,
} = {}) {
  // 1) Subjects sidebar with counts
  // We do this with an RPC-like approach via SQL? Not available here, so we aggregate client-side.
  // Fetch subjects
  const { data: subjects, error: subjectsError } = await supabase
    .from("portal_subjects")
    .select("id,name")
    .order("name", { ascending: true });

  if (subjectsError) {
    console.error("loadCourses subjectsError:", subjectsError);
    return { courses: [], subjects: [], error: subjectsError.message };
  }

  // Fetch mappings for counts (just ids)
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

  // 2) Courses query
  // We load courses and include the subject name via joins:
  // portal_courses -> portal_course_subjects (primary) -> portal_subjects
  let coursesQuery = supabase
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
        portal_course_subjects!inner (
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

  // If filtering by subject, filter through mapping table
  if (subjectId) {
    coursesQuery = coursesQuery.eq("portal_course_subjects.subject_id", subjectId);
  } else {
    // Only want the primary subject row if no filter
    coursesQuery = coursesQuery.eq("portal_course_subjects.is_primary", true);
  }

  // Simple search on title (fast + good enough)
  // If you later want full-text search, we can switch to .textSearch on search_tsv
  if (search && search.trim().length > 0) {
    coursesQuery = coursesQuery.ilike("title", `%${search.trim()}%`);
  }

  const { data: coursesRaw, error: coursesError } = await coursesQuery;

  if (coursesError) {
    console.error("loadCourses coursesError:", coursesError);
    return { courses: [], subjects: subjectsWithCounts, error: coursesError.message };
  }

  // 3) Normalize course shape for UI:
  // Add a top-level `subject` field like legacy code expected.
  const courses = (coursesRaw || []).map((c) => {
    const mapping = Array.isArray(c.portal_course_subjects)
      ? c.portal_course_subjects[0]
      : null;

    const subjectName =
      mapping?.portal_subjects?.name ||
      mapping?.portal_subjects?.[0]?.name ||
      "General";

    return {
      ...c,
      subject: subjectName,
    };
  });

  return { courses, subjects: subjectsWithCounts, error: null };
}
