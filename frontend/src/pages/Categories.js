import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FolderOpen, Wrench } from "lucide-react";

export default function Categories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [newCat, setNewCat] = useState({ name: "", description: "" });
  const [editData, setEditData] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(() => {
    api.get('/categories').then(res => setCategories(res.data)).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleAdd = async () => {
    if (!newCat.name.trim()) { toast.error("Category name required"); return; }
    setSaving(true);
    try {
      await api.post('/categories', newCat);
      toast.success("Category created");
      setShowAdd(false);
      setNewCat({ name: "", description: "" });
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create");
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editData.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      await api.put(`/categories/${editCat.id}`, editData);
      toast.success("Category updated");
      setEditCat(null);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update");
    } finally { setSaving(false); }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/categories/${cat.id}`);
      toast.success("Category deleted");
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    }
  };

  if (user?.role !== "admin") {
    return <p className="text-muted-foreground">Admin access required</p>;
  }

  return (
    <div className="space-y-6" data-testid="categories-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">{categories.length} tool categories</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="add-category-btn">
              <Plus size={14} className="mr-2" /> Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">New Category</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Name *</Label>
                <Input data-testid="new-category-name" className="rounded-none border-2 mt-1" placeholder="e.g. Welding Equipment"
                  value={newCat.name} onChange={e => setNewCat({...newCat, name: e.target.value})} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Description</Label>
                <Textarea data-testid="new-category-desc" className="rounded-none border-2 mt-1" rows={2} placeholder="Optional description"
                  value={newCat.description} onChange={e => setNewCat({...newCat, description: e.target.value})} />
              </div>
              <Button onClick={handleAdd} disabled={saving} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="save-category-btn">
                {saving ? "Creating..." : "Create Category"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editCat} onOpenChange={(open) => { if (!open) setEditCat(null); }}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Edit Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider font-bold">Name</Label>
              <Input className="rounded-none border-2 mt-1" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} data-testid="edit-category-name" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-bold">Description</Label>
              <Textarea className="rounded-none border-2 mt-1" rows={2} value={editData.description} onChange={e => setEditData({...editData, description: e.target.value})} data-testid="edit-category-desc" />
            </div>
            <Button onClick={handleEdit} disabled={saving} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-edit-category-btn">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-sm" />)}</div>
      ) : categories.length === 0 ? (
        <Card className="rounded-sm shadow-none border border-border">
          <CardContent className="py-12 text-center">
            <FolderOpen size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No categories</p>
            <p className="text-sm text-muted-foreground mt-1">Add your first tool category</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => (
            <Card key={cat.id} className="rounded-sm shadow-none border border-border hover:border-[hsl(38,92%,50%)]/50 transition-colors" data-testid={`category-card-${cat.name}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={16} className="text-[hsl(38,92%,50%)] shrink-0" />
                      <h3 className="font-medium truncate">{cat.name}</h3>
                    </div>
                    {cat.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cat.description}</p>}
                    <div className="mt-2">
                      <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0">
                        <Wrench size={10} className="mr-1" /> {cat.tool_count || 0} tools
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button variant="ghost" size="sm" className="rounded-none h-8 w-8 p-0" data-testid={`edit-category-${cat.name}`}
                      onClick={() => { setEditCat(cat); setEditData({ name: cat.name, description: cat.description || "" }); }}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-none h-8 w-8 p-0 text-destructive" data-testid={`delete-category-${cat.name}`}
                      onClick={() => handleDelete(cat)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
