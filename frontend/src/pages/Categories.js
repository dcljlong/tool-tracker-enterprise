import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_CATEGORY = {
  name: "",
  description: "",
};

function getNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseCategoryName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normaliseDescription(value) {
  return String(value || "").trim();
}

function errorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

function categoryIsStored(category) {
  return Boolean(category?.created_at || category?.updated_at);
}

function categoryCanDelete(category) {
  return categoryIsStored(category) && getNumber(category?.tool_count) === 0;
}

function FieldError({ message }) {
  if (!message) return null;

  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertTriangle size={12} />
      {message}
    </p>
  );
}

function AccessDenied() {
  return (
    <Card className="rounded-sm border-2 border-rose-500/30 bg-rose-500/5 shadow-none" data-testid="categories-access-denied">
      <CardContent className="flex items-start gap-3 p-5">
        <ShieldAlert size={22} className="mt-0.5 shrink-0 text-rose-500" />
        <div>
          <p className="font-bold">Admin access required</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Category management controls the shared tool classification list and is restricted to administrators.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, icon: Icon, tone = "default", description }) {
  const toneClass = {
    default: "border-border bg-card text-muted-foreground",
    green: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-500",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-500",
    red: "border-rose-500/30 bg-rose-500/5 text-rose-500",
  }[tone];

  return (
    <Card className={`rounded-sm border-2 shadow-none ${toneClass}`}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 font-['Barlow_Condensed'] text-3xl font-black leading-none text-foreground">
            {value}
          </p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <Icon size={24} className="shrink-0" />
      </CardContent>
    </Card>
  );
}

function LoadingCategories() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="categories-loading">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div key={item} className="h-40 animate-pulse rounded-sm bg-muted" />
      ))}
    </div>
  );
}

function EmptyCategories({ hasSearch }) {
  return (
    <Card className="rounded-sm border border-border shadow-none" data-testid="categories-empty">
      <CardContent className="py-12 text-center">
        <FolderOpen size={48} className="mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-bold">
          {hasSearch ? "No categories match your search" : "No categories"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {hasSearch
            ? "Clear the search field to see all tool categories."
            : "Add categories such as Power Tools, Safety Equipment, Lifting Gear, and Measuring Equipment."}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Categories() {
  const { user } = useAuth();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [editCat, setEditCat] = useState(null);

  const [newCat, setNewCat] = useState(EMPTY_CATEGORY);
  const [editData, setEditData] = useState(EMPTY_CATEGORY);

  const [busyAction, setBusyAction] = useState("");
  const [errors, setErrors] = useState({});
  const [search, setSearch] = useState("");

  const isAdmin = user?.role === "admin";

  const fetchCategories = useCallback(async ({ showRefresh = false } = {}) => {
    if (showRefresh) setRefreshing(true);

    try {
      const response = await api.get("/categories");
      const items = Array.isArray(response.data) ? response.data : [];
      const sorted = [...items].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      setCategories(sorted);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to load categories."));
      setCategories([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchCategories();
  }, [isAdmin, fetchCategories]);

  const stats = useMemo(() => {
    const toolCount = categories.reduce((total, category) => total + getNumber(category.tool_count), 0);
    const inUse = categories.filter((category) => getNumber(category.tool_count) > 0).length;
    const empty = categories.length - inUse;
    const toolDerived = categories.filter((category) => !categoryIsStored(category)).length;

    return {
      total: categories.length,
      inUse,
      empty,
      toolCount,
      toolDerived,
    };
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return categories;

    return categories.filter((category) => {
      const name = String(category.name || "").toLowerCase();
      const description = String(category.description || "").toLowerCase();

      return name.includes(term) || description.includes(term);
    });
  }, [categories, search]);

  const hasSearch = Boolean(search.trim());

  const updateNewCat = (field, value) => {
    setNewCat((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`new_${field}`]: "" }));
  };

  const updateEditCat = (field, value) => {
    setEditData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`edit_${field}`]: "" }));
  };

  const resetAddDialog = () => {
    setNewCat(EMPTY_CATEGORY);
    setErrors({});
    setShowAdd(false);
  };

  const openEditDialog = (category) => {
    setEditCat(category);
    setEditData({
      name: category?.name || "",
      description: category?.description || "",
    });
    setErrors({});
  };

  const validateCategory = (data, mode) => {
    const nextErrors = {};
    const name = normaliseCategoryName(data.name);
    const description = normaliseDescription(data.description);

    if (!name) {
      nextErrors[`${mode}_name`] = "Category name is required.";
    } else if (name.length < 2) {
      nextErrors[`${mode}_name`] = "Category name must be at least 2 characters.";
    } else {
      const duplicate = categories.find((category) => {
        const sameName = String(category.name || "").toLowerCase() === name.toLowerCase();
        const sameRecord = mode === "edit" && category.id === editCat?.id;
        return sameName && !sameRecord;
      });

      if (duplicate) {
        nextErrors[`${mode}_name`] = "A category with this name already exists.";
      }
    }

    if (description.length > 240) {
      nextErrors[`${mode}_description`] = "Description must be 240 characters or less.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleAdd = async () => {
    if (!validateCategory(newCat, "new")) return;

    setBusyAction("add");

    try {
      await api.post("/categories", {
        name: normaliseCategoryName(newCat.name),
        description: normaliseDescription(newCat.description),
      });

      toast.success("Category created");
      resetAddDialog();
      fetchCategories();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to create category."));
    } finally {
      setBusyAction("");
    }
  };

  const handleEdit = async () => {
    if (!editCat) return;
    if (!validateCategory(editData, "edit")) return;

    const nextName = normaliseCategoryName(editData.name);
    const nextDescription = normaliseDescription(editData.description);

    const updates = {};
    if (nextName !== editCat.name) updates.name = nextName;
    if (nextDescription !== (editCat.description || "")) updates.description = nextDescription;

    if (Object.keys(updates).length === 0) {
      toast.error("No changes to save.");
      return;
    }

    setBusyAction("edit");

    try {
      await api.put(`/categories/${editCat.id}`, updates);
      toast.success(updates.name ? "Category updated and matching tools reassigned" : "Category updated");
      setEditCat(null);
      fetchCategories();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update category."));
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async (category) => {
    if (!category?.id) return;

    if (!categoryIsStored(category)) {
      toast.error("This category is tool-derived. Create it as a managed category before editing or deleting it.");
      return;
    }

    if (getNumber(category.tool_count) > 0) {
      toast.error(`Cannot delete: ${category.tool_count} tools use this category. Reassign them first.`);
      return;
    }

    const confirmed = window.confirm(`Delete category "${category.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setBusyAction(`delete-${category.id}`);

    try {
      await api.delete(`/categories/${category.id}`);
      toast.success("Category deleted");
      fetchCategories();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to delete category."));
    } finally {
      setBusyAction("");
    }
  };

  const clearSearch = () => setSearch("");

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="space-y-6" data-testid="categories-page">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Tool classification
          </p>
          <h1 className="mt-1 font-['Barlow_Condensed'] text-4xl font-black uppercase tracking-tight md:text-5xl">
            Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the shared category list used by Tool Catalog filters, imports, and new tool creation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={() => fetchCategories({ showRefresh: true })}
            disabled={refreshing}
            data-testid="refresh-categories-btn"
          >
            <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Dialog open={showAdd} onOpenChange={(open) => (open ? setShowAdd(true) : resetAddDialog())}>
            <DialogTrigger asChild>
              <Button
                className="h-10 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                data-testid="add-category-btn"
              >
                <Plus size={14} className="mr-2" />
                Add Category
              </Button>
            </DialogTrigger>

            <DialogContent className="rounded-sm">
              <DialogHeader>
                <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
                  New Category
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-3">
                <div>
                  <Label className="text-xs font-black uppercase tracking-wider">Name *</Label>
                  <Input
                    data-testid="new-category-name"
                    className="mt-1 rounded-none border-2"
                    placeholder="e.g. Lifting Gear"
                    value={newCat.name}
                    onChange={(event) => updateNewCat("name", event.target.value)}
                  />
                  <FieldError message={errors.new_name} />
                </div>

                <div>
                  <Label className="text-xs font-black uppercase tracking-wider">Description</Label>
                  <Textarea
                    data-testid="new-category-desc"
                    className="mt-1 rounded-none border-2"
                    rows={3}
                    placeholder="Optional description or usage notes"
                    value={newCat.description}
                    onChange={(event) => updateNewCat("description", event.target.value)}
                  />
                  <FieldError message={errors.new_description} />
                </div>

                <Button
                  onClick={handleAdd}
                  disabled={busyAction === "add"}
                  className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                  data-testid="save-category-btn"
                >
                  {busyAction === "add" ? "Creating..." : "Create Category"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Categories" value={stats.total} icon={FolderOpen} />
        <StatCard title="In Use" value={stats.inUse} icon={Wrench} tone="blue" />
        <StatCard title="Empty" value={stats.empty} icon={CheckCircle} tone="green" />
        <StatCard title="Tools Linked" value={stats.toolCount} icon={Wrench} tone="amber" />
        <StatCard title="Tool-Derived" value={stats.toolDerived} icon={AlertTriangle} tone={stats.toolDerived > 0 ? "amber" : "default"} />
      </section>

      <section className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="category-search"
            className="rounded-none border-2 pl-10"
            placeholder="Search category name or description..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Button
          variant="outline"
          className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider md:w-28"
          onClick={clearSearch}
          disabled={!hasSearch}
          data-testid="clear-category-search-btn"
        >
          Clear
        </Button>
      </section>

      <Dialog open={Boolean(editCat)} onOpenChange={(open) => { if (!open) setEditCat(null); }}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
              Edit Category
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            {editCat && getNumber(editCat.tool_count) > 0 && (
              <Card className="rounded-sm border-amber-500/30 bg-amber-500/5 shadow-none">
                <CardContent className="flex items-start gap-2 p-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <p className="text-xs text-muted-foreground">
                    Renaming this category will also update {editCat.tool_count} linked tool(s).
                  </p>
                </CardContent>
              </Card>
            )}

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Name</Label>
              <Input
                data-testid="edit-category-name"
                className="mt-1 rounded-none border-2"
                value={editData.name}
                onChange={(event) => updateEditCat("name", event.target.value)}
              />
              <FieldError message={errors.edit_name} />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Description</Label>
              <Textarea
                data-testid="edit-category-desc"
                className="mt-1 rounded-none border-2"
                rows={3}
                value={editData.description}
                onChange={(event) => updateEditCat("description", event.target.value)}
              />
              <FieldError message={errors.edit_description} />
            </div>

            <Button
              onClick={handleEdit}
              disabled={busyAction === "edit"}
              className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
              data-testid="confirm-edit-category-btn"
            >
              {busyAction === "edit" ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <LoadingCategories />
      ) : filteredCategories.length === 0 ? (
        <EmptyCategories hasSearch={hasSearch} />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="category-list">
          {filteredCategories.map((category) => {
            const toolCount = getNumber(category.tool_count);
            const stored = categoryIsStored(category);
            const canDelete = categoryCanDelete(category);

            return (
              <Card
                key={category.id || category.name}
                className="rounded-sm border border-border shadow-none transition-colors hover:border-[hsl(38,92%,50%)]/50"
                data-testid={`category-card-${category.name}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex min-w-0 items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderOpen size={18} className="shrink-0 text-[hsl(38,92%,50%)]" />
                      <span className="truncate font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
                        {category.name || "Unnamed category"}
                      </span>
                    </span>

                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full px-2 py-0 text-[10px] uppercase"
                    >
                      {toolCount} tools
                    </Badge>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="min-h-[36px] text-sm text-muted-foreground">
                    {category.description || "No description has been added yet."}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {stored ? (
                      <Badge className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                        Managed
                      </Badge>
                    ) : (
                      <Badge className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                        Tool-Derived
                      </Badge>
                    )}

                    {toolCount > 0 ? (
                      <Badge className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0 text-[10px] font-black uppercase text-blue-600 dark:text-blue-400">
                        In Use
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
                        Empty
                      </Badge>
                    )}
                  </div>

                  {!stored && (
                    <Card className="rounded-sm border-amber-500/30 bg-amber-500/5 shadow-none">
                      <CardContent className="flex items-start gap-2 p-3">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                        <p className="text-xs text-muted-foreground">
                          This category is inferred from existing tools. Create it as a managed category before editing or deleting it.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 flex-1 rounded-none border-2 text-xs font-black uppercase tracking-wider"
                      data-testid={`edit-category-${category.name}`}
                      onClick={() => openEditDialog(category)}
                      disabled={!stored}
                    >
                      <Pencil size={14} className="mr-1" />
                      Edit
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 flex-1 rounded-none text-xs font-black uppercase tracking-wider text-destructive"
                      data-testid={`delete-category-${category.name}`}
                      onClick={() => handleDelete(category)}
                      disabled={!canDelete || busyAction === `delete-${category.id}`}
                      title={!stored ? "Tool-derived category cannot be deleted" : toolCount > 0 ? "Reassign tools before deleting" : "Delete category"}
                    >
                      <Trash2 size={14} className="mr-1" />
                      {busyAction === `delete-${category.id}` ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
