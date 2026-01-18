// CoursePage.jsx — COMPLETE FULL FILE REPLACEMENT
// Links "Unlocked" directly to course content via RPCs:
// - get_course_access(p_course_id)
// - get_course_lessons(p_course_id)
//
// Requires your project to have a Supabase client export.
// IMPORTANT: If your supabase client import path is different, change ONLY the import line below.

import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";

// ✅ Adjust this import path if your project uses a different location/name.
import { supabase } from "../supabaseClient"; // common pattern: src/supabaseClient.js

export default function CoursePage() {
  const params = useParams();

  // Accept either /course/:courseId or /courses/:id style routes.
  const courseId = useMemo(() => {
    return params.courseId || params.id || params.course_id || null;
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [user, setUser] = useState(null);

  const [course, setCourse] = useState(null);
  const [access, setAccess] = useState({ unlocked: false, status: "locked" });

  const [lessons, setLessons] = useState([]);
  const [lessonsError, setLessonsError] = useState("");

  const [subStatus, setSubStatus] = useState(null); // user_subscriptions.status if available
  const [subCancelAtPeriodEnd, setSubCancelAtPeriodEnd] = useState(null);
  const [subPeriodEnd, setSubPeriodEnd] = useState(null);

  const prettyDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  };

  async function loadUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user ?? null;
  }

  async function loadCourseBasics(courseIdValue) {
    // Best effort: only needs title/description/subject fields you actually have.
    // If your schema differs, this still won’t break unlock/content; it only affects display.
    const { data, error } = await supabase
      .from("courses")
      .select("id,title,description,subject,level,created_at")
      .eq("id", courseIdValue)
      .maybeSingle();

    if (error) {
      // If your courses table columns differ, show minimal info but keep the page functional.
      return { id: courseIdValue, title: "Course", description: null };
    }
    return data ?? { id: courseIdValue, title: "Course", description: null };
  }

  async function loadAccess(courseIdValue) {
    // RPC: get_course_access(p_course_id uuid)
    const { data, error } = await supabase.rpc("get_course_access", {
      p_course_id: courseIdValue,
    });

    if (error) {
      return { unlocked: false, status: "locked" };
    }

    // Supabase RPC returns an array for "returns table"
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { unlocked: false, status: "locked" };

    return {
      unlocked: !!row.unlocked,
      status: row.status || (row.unlocked ? "unlocked" : "locked"),
    };
  }

  async function loadLessons(courseIdValue) {
    setLessonsError("");
    setLessons([]);

    // RPC: get_course_lessons(p_course_id uuid)
    const { data, error } = await supabase.rpc("get_course_lessons", {
      p_course_id: courseIdValue,
    });

    if (error) {
      // If locked, RLS may block lessons. We keep error user-friendly.
      setLessonsError(error.message || "Lessons are locked.");
      setLessons([]);
      return;
    }

    setLessons(Array.isArray(data) ? data : []);
  }

  async function loadSubscriptionStatus(courseIdValue, userId) {
    // Optional UX: show subscription status for this course.
    // Policy: user_subscriptions_read_own allows authenticated users to SELECT their row.
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("status,cancel_at_period_end,current_period_end")
      .eq("user_id", userId)
      .eq("course_id", courseIdValue)
      .maybeSingle();

    if (error || !data) {
      setSubStatus(null);
      setSubCancelAtPeriodEnd(null);
      setSubPeriodEnd(null);
      return;
    }

    setSubStatus(data.status ?? null);
    setSubCancelAtPeriodEnd(
      typeof data.cancel_at_period_end === "boolean" ? data.cancel_at_period_end : null,
    );
    setSubPeriodEnd(data.current_period_end ?? null);
  }

  async function refreshAll() {
    if (!courseId) return;

    setLoading(true);
    try {
      const u = await loadUser();
      setUser(u);

      const c = await loadCourseBasics(courseId);
      setCourse(c);

      const a = await loadAccess(courseId);
      setAccess(a);

      if (u?.id) {
        await loadSubscriptionStatus(courseId, u.id);
      } else {
        setSubStatus(null);
        setSubCancelAtPeriodEnd(null);
        setSubPeriodEnd(null);
      }

      // Only fetch lessons if unlocked (even though RLS enforces it too)
      if (a.unlocked) {
        await loadLessons(courseId);
      } else {
        setLessons([]);
        setLessonsError("");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // ---- Actions ----

  async function onEnrollAndPay() {
    if (!courseId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          courseId,
          successUrl: `${window.location.origin}/success`,
          cancelUrl: `${window.location.origin}/cancel`,
        },
      });

      if (error) {
        alert(error.message || "Checkout failed.");
        return;
      }

      if (!data?.url) {
        alert("Checkout failed: missing Stripe URL.");
        return;
      }

      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  async function onRestorePurchases() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("restore-purchases", {
        body: {},
      });

      if (error) {
        alert(error.message || "Restore failed.");
        return;
      }

      alert(`Restore complete. Restored: ${data?.restored ?? 0}`);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function onCancelSubscription() {
    if (!courseId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: { courseId },
      });

      if (error) {
        alert(error.message || "Cancel failed.");
        return;
      }

      alert("Subscription will cancel at period end.");
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  // ---- UI ----

  if (!courseId) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
        <h2>Course</h2>
        <p style={{ opacity: 0.8 }}>
          Missing course id in the route. Expected something like <code>/course/:courseId</code>.
        </p>
        <Link to="/">Go back</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            <Link to="/" style={{ textDecoration: "none" }}>Home</Link>{" "}
            <span style={{ opacity: 0.4 }}>/</span>{" "}
            <Link to="/portal" style={{ textDecoration: "none" }}>Portal</Link>{" "}
            <span style={{ opacity: 0.4 }}>/</span>{" "}
            <span>Course</span>
          </div>
          <h1 style={{ margin: "8px 0 0" }}>{course?.title ?? "Course"}</h1>
          {course?.description ? (
            <p style={{ margin: "8px 0 0", opacity: 0.85 }}>{course.description}</p>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={refreshAll}
            disabled={loading || busy}
            style={{ padding: "10px 12px", cursor: loading || busy ? "not-allowed" : "pointer" }}
          >
            Refresh
          </button>

          <button
            onClick={onRestorePurchases}
            disabled={loading || busy || !user}
            title={!user ? "Sign in to restore purchases" : ""}
            style={{ padding: "10px 12px", cursor: loading || busy || !user ? "not-allowed" : "pointer" }}
          >
            Restore Purchases
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-block",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.12)",
            background: access.unlocked ? "rgba(0,128,0,0.08)" : "rgba(255,165,0,0.10)",
            fontWeight: 700,
          }}
        >
          {access.unlocked ? "Unlocked" : "Locked"}
        </span>

        <span style={{ opacity: 0.75, fontSize: 14 }}>
          {access.unlocked
            ? "You have access to course content."
            : "Locked until you enroll & pay."}
        </span>

        {subStatus ? (
          <span style={{ marginLeft: "auto", opacity: 0.85, fontSize: 14 }}>
            Subscription: <b>{subStatus}</b>
            {subCancelAtPeriodEnd ? (
              <>
                {" "}• Cancels at period end
                {subPeriodEnd ? <> ({prettyDate(subPeriodEnd)})</> : null}
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!user ? (
          <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, width: "100%" }}>
            <b>Sign in required</b>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              You must be signed in to enroll, pay, restore purchases, and manage subscriptions.
            </div>
          </div>
        ) : null}

        {!access.unlocked ? (
          <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, width: "100%" }}>
            <b>Enroll & Pay</b>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Payment will unlock lessons for this course.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={onEnrollAndPay}
                disabled={busy || loading || !user}
                style={{
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: busy || loading || !user ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Working..." : "Enroll & Pay"}
              </button>

              <button
                onClick={onRestorePurchases}
                disabled={busy || loading || !user}
                style={{ padding: "10px 14px", cursor: busy || loading || !user ? "not-allowed" : "pointer" }}
              >
                Restore Purchases
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, width: "100%" }}>
            <b>Course Content</b>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Lessons are unlocked by database security rules linked to your paid enrollment.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={onCancelSubscription}
                disabled={busy || loading || !user}
                style={{ padding: "10px 14px", cursor: busy || loading || !user ? "not-allowed" : "pointer" }}
              >
                Cancel Subscription
              </button>

              <button
                onClick={onRestorePurchases}
                disabled={busy || loading || !user}
                style={{ padding: "10px 14px", cursor: busy || loading || !user ? "not-allowed" : "pointer" }}
              >
                Restore Purchases
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 8 }}>Lessons</h2>

        {!access.unlocked ? (
          <div style={{ padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.03)" }}>
            <b>Locked.</b>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Lessons are locked by database security until your enrollment is paid.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.03)" }}>
                  <th style={{ padding: 10, width: 80 }}>#</th>
                  <th style={{ padding: 10 }}>Lesson</th>
                  <th style={{ padding: 10, width: 140 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={{ padding: 10, opacity: 0.75 }}>{l.lesson_number ?? "-"}</td>
                    <td style={{ padding: 10, fontWeight: 700 }}>{l.title}</td>
                    <td style={{ padding: 10, opacity: 0.75 }}>
                      {l.created_at ? new Date(l.created_at).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                ))}

                {lessons.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: 12, opacity: 0.75 }}>
                      {lessonsError ? lessonsError : "No lessons found."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, opacity: 0.6, fontSize: 12 }}>
        Course ID: <code>{courseId}</code>
      </div>
    </div>
  );
}
