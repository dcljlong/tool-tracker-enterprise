// Borrowers: people you lend tools to who don't have a login (a mate, a family member, a subbie).
// Lending itself happens on the tool's page (Check Out -> "Who's taking it?").
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Contact, Mail, Pencil, Phone, Plus, RefreshCw, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY = { name: "", phone: "", email: "", notes: "" };

const errorMessage = (error, fallback) => error?.response?.data?.detail || fallback;

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "";

export function BorrowerForm({ value, onChange, error }) {
  const set = (field) => (event) => onChange({ ...value, [field]: event.target.value });
  return (
    <div className="grid gap-3">
      <div>
        <Label className="text-xs font-black uppercase tracking-wider">Name *</Label>
        <Input data-testid="borrower-name" className="mt-1 rounded-none border-2" value={value.name} onChange={set("name")} maxLength={120} autoFocus />
        {error && (
          <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle size={12} />{error}</p>
        )}
      </div>
      <div>
        <Label className="text-xs font-black uppercase tracking-wider">Phone</Label>
        <Input data-testid="borrower-phone" type="tel" className="mt-1 rounded-none border-2" value={value.phone} onChange={set("phone")} maxLength={40} />
      </div>
      <div>
        <Label className="text-xs font-black uppercase tracking-wider">Email</Label>
        <Input data-testid="borrower-email" type="email" className="mt-1 rounded-none border-2" value={value.email} onChange={set("email")} maxLength={200} />
      </div>
      {"notes" in value && (
        <div>
          <Label className="text-xs font-black uppercase tracking-wider">Notes</Label>
          <Textarea data-testid="borrower-notes" className="mt-1 rounded-none border-2" rows={2} value={value.notes} onChange={set("notes")} />
        </div>
      )}
    </div>
  );
}

function BorrowerCard({ person, canDelete, onEdit, onDelete }) {
  const out = person.tools_out || [];
  const overdue = out.some((t) => t.overdue);
  return (
    <Card className={`rounded-sm border-2 shadow-none ${overdue ? "border-rose-500/40" : "border-border"}`} data-testid="borrower-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{person.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {person.phone && (
                <a className="flex items-center gap-1 hover:underline" href={`tel:${person.phone.replace(/\s+/g, "")}`}><Phone size={13} />{person.phone}</a>
              )}
              {person.email && (
                <a className="flex items-center gap-1 hover:underline" href={`mailto:${person.email}`}><Mail size={13} />{person.email}</a>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" onClick={() => onEdit(person)} aria-label={`Edit ${person.name}`} data-testid="borrower-edit"><Pencil size={15} /></Button>
            {canDelete && (
              <Button size="icon" variant="ghost" onClick={() => onDelete(person)} aria-label={`Remove ${person.name}`} data-testid="borrower-delete"><Trash2 size={15} /></Button>
            )}
          </div>
        </div>

        {person.notes && <p className="mt-2 whitespace-pre-line text-sm">{person.notes}</p>}

        <div className="mt-3 border-t pt-3">
          {out.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing borrowed right now.</p>
          ) : (
            <ul className="grid gap-1.5">
              {out.map((t) => (
                <li key={t.checkout_id} className="flex items-center justify-between gap-2 text-sm">
                  <Link to={`/tools/${t.tool_id}`} className="flex min-w-0 items-center gap-1.5 font-semibold hover:underline">
                    <Wrench size={13} className="shrink-0" />
                    <span className="truncate">{t.description || t.asset_id}</span>
                    {t.asset_id && <span className="shrink-0 text-xs text-muted-foreground">({t.asset_id})</span>}
                  </Link>
                  {t.expected_return_date && (
                    <Badge variant="outline" className={`shrink-0 rounded-none text-[10px] ${t.overdue ? "border-rose-500/40 text-rose-600" : ""}`}>
                      {t.overdue ? "Overdue " : "Due "}{fmtDate(t.expected_return_date)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Borrowed {person.times_borrowed} time{person.times_borrowed === 1 ? "" : "s"}
            {person.last_borrowed_at ? `, last on ${fmtDate(person.last_borrowed_at)}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Borrowers() {
  const { user } = useAuth();
  const canDelete = ["admin", "site_manager"].includes(user?.role);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {id...} = edit
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/borrowers");
      setPeople(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't load borrowers."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? people.filter((p) => [p.name, p.phone, p.email, p.notes].some((v) => String(v || "").toLowerCase().includes(q)))
      : people;
    // People holding tools first, then by name.
    return [...list].sort((a, b) => (b.tools_out.length > 0) - (a.tools_out.length > 0) || a.name.localeCompare(b.name));
  }, [people, search]);

  const toolsOut = people.reduce((n, p) => n + p.tools_out.length, 0);
  const overdue = people.reduce((n, p) => n + p.tools_out.filter((t) => t.overdue).length, 0);

  const openNew = () => { setForm(EMPTY); setFormError(""); setEditing({}); };
  const openEdit = (p) => {
    setForm({ name: p.name || "", phone: p.phone || "", email: p.email || "", notes: p.notes || "" });
    setFormError("");
    setEditing(p);
  };

  const save = async () => {
    if (!form.name.trim()) { setFormError("Enter a name."); return; }
    setSaving(true);
    try {
      if (editing?.id) await api.put(`/borrowers/${editing.id}`, form);
      else await api.post("/borrowers", form);
      toast.success(editing?.id ? "Saved" : `${form.name.trim()} added`);
      setEditing(null);
      await load();
    } catch (error) {
      setFormError(errorMessage(error, "Couldn't save."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (p.tools_out.length) { toast.error(`${p.name} still has tools. Return them first.`); return; }
    if (!window.confirm(`Remove ${p.name} from your borrowers list?`)) return;
    try {
      await api.delete(`/borrowers/${p.id}`);
      toast.success(`${p.name} removed`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't remove."));
    }
  };

  return (
    <div className="space-y-5" data-testid="borrowers-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl font-black uppercase">Borrowers</h1>
          <p className="text-sm text-muted-foreground">
            People you lend tools to who don't need a login. To lend a tool, open it and press Check Out.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 rounded-none border-2" onClick={load} aria-label="Refresh"><RefreshCw size={15} /></Button>
          <Button className="h-10 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]" onClick={openNew} data-testid="add-borrower-btn">
            <Plus size={15} className="mr-1" />Add person
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="rounded-sm border-2 shadow-none"><CardContent className="p-3"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">People</p><p className="font-['Barlow_Condensed'] text-3xl font-black">{people.length}</p></CardContent></Card>
        <Card className="rounded-sm border-2 shadow-none"><CardContent className="p-3"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Tools out</p><p className="font-['Barlow_Condensed'] text-3xl font-black">{toolsOut}</p></CardContent></Card>
        <Card className={`rounded-sm border-2 shadow-none ${overdue ? "border-rose-500/40" : ""}`}><CardContent className="p-3"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Overdue</p><p className={`font-['Barlow_Condensed'] text-3xl font-black ${overdue ? "text-rose-600" : ""}`}>{overdue}</p></CardContent></Card>
      </div>

      {people.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 rounded-none border-2 pl-9" placeholder="Search name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="borrower-search" />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-sm bg-muted" />)}
        </div>
      ) : shown.length === 0 ? (
        <Card className="rounded-sm border shadow-none" data-testid="borrowers-empty">
          <CardContent className="py-12 text-center">
            <Contact size={44} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-lg font-bold">{search ? "No one matches that search" : "No borrowers yet"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {search ? "Clear the search to see everyone." : "Add the people you lend tools to, or add them on the spot when you check a tool out."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => <BorrowerCard key={p.id} person={p} canDelete={canDelete} onEdit={openEdit} onDelete={remove} />)}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">{editing?.id ? "Edit person" : "Add person"}</DialogTitle>
          </DialogHeader>
          <BorrowerForm value={form} onChange={(v) => { setForm(v); setFormError(""); }} error={formError} />
          <Button onClick={save} disabled={saving} className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]" data-testid="save-borrower-btn">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
