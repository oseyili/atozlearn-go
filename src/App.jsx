function MasterPortal() {
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const list = await loadAllCourses();
        setCourses(list);

        const subs = [...new Set(
          list.map(c => c.subject || c.category || "General")
        )].sort();

        setSubjects(subs);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="notice">Loading 7000+ courses…</div>;
  if (err) return <div className="notice error">{err}</div>;

  return (
    <section>
      <h1 className="portalTitle">AtoZlearn Master Portal</h1>

      <div className="stats">
        <span>{courses.length} Courses</span>
        <span>{subjects.length} Subjects</span>
      </div>

      <div className="subjectGrid">
        {subjects.map(s => (
          <Link key={s} to={`/subjects/${encodeURIComponent(s)}`} className="subjectCard">
            <h3>{s}</h3>
            <p>{courses.filter(c =>
              (c.subject || c.category || "General") === s
            ).length} courses</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
