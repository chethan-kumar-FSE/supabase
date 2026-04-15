import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supbase-client";

// ─── Debounce ────────────────────────────────────────────────────────────────
const debounce = (fn, delay) => {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// ─── Toast ───────────────────────────────────────────────────────────────────
let toastId = 0;

function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 min-w-[260px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 px-4 py-3 border text-xs tracking-widest uppercase font-mono
                     animate-[fadeSlideIn_0.2s_ease-out]"
          style={{
            background: t.type === "error" ? "rgba(239,68,68,0.08)" : "rgba(74,222,128,0.08)",
            borderColor: t.type === "error" ? "rgba(239,68,68,0.4)" : "rgba(74,222,128,0.4)",
            color: t.type === "error" ? "#f87171" : "#4ade80",
            boxShadow: t.type === "error"
              ? "0 0 16px rgba(239,68,68,0.15)"
              : "0 0 16px rgba(74,222,128,0.15)",
          }}
        >
          <span>{t.type === "error" ? "✕" : "✓"}</span>
          <span className="flex-1 leading-relaxed normal-case tracking-normal">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinner({ size = "w-3.5 h-3.5", color = "text-indigo-400" }) {
  return (
    <svg className={`animate-spin ${size} ${color}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const Dash = () => {
  const [todos, setTodos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newTodo, setNewTodo] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Per-item loading: { [id]: "editing" | "deleting" }
  const [itemLoading, setItemLoading] = useState({});

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef(null);

  // Toasts
  const [toasts, setToasts] = useState([]);

  const pushToast = (message, type = "success") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 3500);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchTodos(searchQ) {
    let query = supabase.from("todo").select("*");
    const trimmed = searchQ.trim();
    if (trimmed.length > 0) query = query.ilike("title", `%${trimmed}%`);
    const { data, error } = await query;
    if (error) { console.error(error); return; }
    setTodos(data || []);
  }

  const debouncedFetch = useMemo(() => debounce(fetchTodos, 500), []);
  useEffect(() => { debouncedFetch(searchQuery); }, [searchQuery]);

  // Tracks temp IDs used for optimistic inserts so real-time can deduplicate
  const pendingTempIds = useRef(new Set());

  // ── Real-time: INSERT / UPDATE / DELETE ────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("todo-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "todo" },
        (payload) => setTodos((prev) => {
          // Skip if already present (added optimistically and confirmed via .select())
          if (prev.some((t) => t.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        })
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "todo" },
        (payload) => setTodos((prev) =>
          prev.map((t) => (t.id === payload.new.id ? payload.new : t))
        )
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "todo" },
        (payload) => setTodos((prev) => prev.filter((t) => t.id !== payload.old.id))
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── Add (optimistic) ───────────────────────────────────────────────────────
  const addTodo = async (e) => {
    e.preventDefault();
    const title = newTodo.trim();
    if (!title) return;

    // Optimistic: add item immediately with a temp string ID
    const tempId = `temp_${Date.now()}`;
    pendingTempIds.current.add(tempId);
    setTodos((prev) => [...prev, { id: tempId, title, _pending: true }]);
    setNewTodo("");   // clear input right away — no waiting
    setIsAdding(true);

    const { data, error } = await supabase
      .from("todo")
      .insert([{ title }])
      .select()
      .single();

    pendingTempIds.current.delete(tempId);

    if (error) {
      // Roll back the optimistic item
      setTodos((prev) => prev.filter((t) => t.id !== tempId));
      setNewTodo(title); // restore input so user doesn't lose their text
      pushToast("Failed to add quest.", "error");
    } else {
      // Replace temp item with real row (real-time INSERT will be deduplicated)
      setTodos((prev) => prev.map((t) => (t.id === tempId ? data : t)));
      pushToast("Quest added to the log.");
    }
    setIsAdding(false);
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const startEdit = (todo) => {
    setEditingId(todo.id);
    setEditValue(todo.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async (id) => {
    const trimmed = editValue.trim();
    const original = todos.find((t) => t.id === id);

    if (!trimmed || trimmed === original?.title) {
      cancelEdit();
      return;
    }

    setItemLoading((prev) => ({ ...prev, [id]: "editing" }));
    cancelEdit();

    const { error } = await supabase
      .from("todo")
      .update({ title: trimmed })
      .eq("id", id);

    if (error) {
      pushToast("Failed to update quest.", "error");
      // Roll back optimistic UI via real-time; no extra work needed
    } else {
      // Update local state immediately (real-time also fires but this is faster)
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)));
      pushToast("Quest updated successfully.");
    }

    setItemLoading((prev) => { const s = { ...prev }; delete s[id]; return s; });
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteTodo = async (id) => {
    setItemLoading((prev) => ({ ...prev, [id]: "deleting" }));

    const { error } = await supabase.from("todo").delete().eq("id", id);

    if (error) {
      pushToast("Failed to delete quest.", "error");
      setItemLoading((prev) => { const s = { ...prev }; delete s[id]; return s; });
    } else {
      // Remove locally immediately (real-time also fires)
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setItemLoading((prev) => { const s = { ...prev }; delete s[id]; return s; });
      pushToast("Quest removed from the log.");
    }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 py-10 font-mono" style={{ background: "#050510" }}>

      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,170,0.015) 2px, rgba(0,255,170,0.015) 4px)",
        }}
      />

      {/* Toasts */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="relative z-10 max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: "0 0 8px #4ade80" }} />
            <span className="text-xs tracking-[0.3em] uppercase text-green-400">System Online</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <h1
                className="text-4xl font-bold uppercase tracking-wider text-white"
                style={{ textShadow: "0 0 20px rgba(99,102,241,0.8), 0 0 40px rgba(99,102,241,0.4)" }}
              >
                Quest Log
              </h1>
              <p className="text-xs text-indigo-400 mt-1 tracking-widest">
                {todos.length} / ∞ &nbsp;TASKS LOADED
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs tracking-widest uppercase text-red-500 hover:text-red-300
                         border border-red-900 hover:border-red-500 px-3 py-1.5
                         transition-all hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]"
            >
              ⏻ Exit
            </button>
          </div>
          <div className="mt-4 h-px w-full" style={{ background: "linear-gradient(to right, #6366f1, transparent)" }} />
        </div>

        {/* Add task */}
        <form onSubmit={addTodo} className="mb-6">
          <div
            className="flex items-center gap-3 px-4 py-3 border border-indigo-900 focus-within:border-indigo-500 transition-all"
            style={{ background: "rgba(99,102,241,0.05)" }}
          >
            <span className="text-indigo-500 text-xs tracking-widest shrink-0">NEW&gt;</span>
            <input
              type="text"
              placeholder="Enter new quest..."
              value={newTodo}
              disabled={isAdding}
              onChange={(e) => setNewTodo(e.target.value)}
              className="flex-1 bg-transparent text-green-300 placeholder-indigo-800
                         text-sm focus:outline-none disabled:opacity-40 tracking-wide caret-green-400"
            />
            <button
              type="submit"
              disabled={isAdding || !newTodo.trim()}
              className="shrink-0 text-xs font-bold tracking-widest uppercase px-4 py-1.5
                         border border-indigo-600 text-indigo-300
                         hover:bg-indigo-600 hover:text-white hover:shadow-[0_0_16px_rgba(99,102,241,0.5)]
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {isAdding ? <Spinner /> : "+ Add"}
            </button>
          </div>
        </form>

        {/* Search */}
        <div className="relative mb-8">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-700 text-xs tracking-widest">
            SRC&gt;
          </span>
          <input
            type="text"
            placeholder="Search quests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-14 pr-10 py-2.5 text-sm tracking-wide
                       bg-transparent border border-indigo-950 hover:border-indigo-800
                       text-green-300 placeholder-indigo-900
                       focus:outline-none focus:border-indigo-600 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-700 hover:text-indigo-400 transition-colors text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Quest list */}
        {todos.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-indigo-950">
            <p className="text-indigo-800 text-xs tracking-[0.4em] uppercase mb-2">— No Quests Found —</p>
            <p className="text-indigo-900 text-xs">
              {searchQuery ? `No match for "${searchQuery}"` : "Add your first quest above"}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {todos.map((t, i) => {
              const loading = itemLoading[t.id];
              const isEditingThis = editingId === t.id;

              return (
                <li
                  key={t.id}
                  className="group flex items-center gap-3 px-4 py-3 border-l-2 border-transparent
                             hover:border-l-indigo-500 transition-all"
                  style={{ background: "rgba(99,102,241,0.0)", transition: "background 0.2s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(99,102,241,0.07)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(99,102,241,0.0)"}
                >
                  {/* Index */}
                  <span className="text-xs text-indigo-800 group-hover:text-indigo-500 w-6 shrink-0 transition-colors">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  {/* Bullet */}
                  <span
                    className="w-1.5 h-1.5 shrink-0 bg-green-500 group-hover:bg-green-300 transition-all"
                    style={{ boxShadow: "0 0 6px #4ade80" }}
                  />

                  {/* Title or Edit input */}
                  {isEditingThis ? (
                    <input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(t.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      onBlur={() => saveEdit(t.id)}
                      className="flex-1 bg-transparent border-b border-indigo-500 text-green-300
                                 text-sm tracking-wide focus:outline-none caret-green-400 pb-0.5"
                    />
                  ) : (
                    <span className={`flex-1 text-sm tracking-wide transition-colors
                      ${loading ? "text-indigo-700" : t._pending ? "text-indigo-400 italic" : "text-indigo-200 group-hover:text-white"}`}>
                      {t.title}
                    </span>
                  )}

                  {/* Actions */}
                  {t._pending ? (
                    <div className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase">
                      <Spinner size="w-3 h-3" color="text-indigo-600" />
                      <span className="text-indigo-700">Saving...</span>
                    </div>
                  ) : loading ? (
                    <div className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase">
                      <Spinner size="w-3 h-3" />
                      <span className="text-indigo-600">
                        {loading === "deleting" ? "Removing..." : "Saving..."}
                      </span>
                    </div>
                  ) : isEditingThis ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveEdit(t.id)}
                        className="text-[10px] tracking-widest uppercase text-green-500 hover:text-green-300
                                   border border-green-900 hover:border-green-600 px-2 py-0.5 transition-all"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-[10px] tracking-widest uppercase text-indigo-600 hover:text-indigo-400
                                   border border-indigo-900 hover:border-indigo-600 px-2 py-0.5 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Edit button */}
                      <button
                        onClick={() => startEdit(t)}
                        title="Edit quest"
                        className="text-indigo-600 hover:text-indigo-300 transition-colors p-1
                                   hover:shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => deleteTodo(t.id)}
                        title="Delete quest"
                        className="text-red-800 hover:text-red-400 transition-colors p-1
                                   hover:shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer */}
        <div className="mt-10 h-px w-full" style={{ background: "linear-gradient(to right, transparent, #6366f1, transparent)" }} />
        <p className="text-center text-[10px] text-indigo-900 tracking-widest uppercase mt-3">
          {searchQuery
            ? `${todos.length} result${todos.length !== 1 ? "s" : ""} · filtered`
            : `${todos.length} quest${todos.length !== 1 ? "s" : ""} · live sync active`}
        </p>

      </div>
    </div>
  );
};

export default Dash;
