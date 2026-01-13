function Courses() {
  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const [err, setErr] = useState("");

  const subjects = [
    "all",
    "Mathematics",
    "Science",
    "Computer Science",
    "Business",
    "Finance",
    "Economics",
    "English & Writing",
    "History",
    "Geography",
    "Languages",
    "Arts & Design",
    "Music",
    "Health & Wellness",
    "Psychology",
    "Law",
    "Engineering",
    "Medicine",
    "Education",
    "Marketing",
    "Data & AI",
    "Cybersecurity",
    "Exam Prep",
    "Career Skills",
  ];

  useEffect(() => {
    (async () => {
      setErr("");
      const { data, error } = await supabase.from("courses").select("*").limit(5000);
      if (error) setErr(error.message);

      // ✅ Deduplicate: prefer unique by id, fallback by title
      const map = new Map();
      (data || []).forEach((c) => {
        const key = c?.id || (c?.title ? `title:${c.title}` : Math.random().toString());
        if (!map.has(key)) map.set(key, c);
      });

      setCourses(Array.from(map.values()));
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return courses.filter((c) => {
      const title = (c.title || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      const subj = (c.subject || c.category || "").toString();

      const matchesSearch = !s || title.includes(s) || desc.includes(s);
      const matchesSubject = subject === "all" || subj === subject;

      return matchesSearch && matchesSubject;
    });
  }, [q, subject, courses]);

  return (
    <section>
      <div className="pageHead">
        <h2>Courses</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            className="search"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ maxWidth: 260 }}
          >
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            className="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses…"
          />
        </div>
      </div>

      {err && <div className="notice error">{err}</div>}

      <div className="grid">
        {filtered.map((c) => (
          <Link key={c.id || c.title} className="card" to={`/courses/${c.id}`}>
            <div className="cardTitle">{c.title}</div>
            <div className="cardDesc">{c.description}</div>
            <div className="cardLink">Open course →</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
