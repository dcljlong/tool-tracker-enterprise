import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Search, Filter, Wrench, CheckCircle, AlertTriangle,
  ArrowRight, Upload, Download, QrCode, RotateCcw, CheckSquare
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const statusConfig = {
  available: { label: "Available", class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20", icon: CheckCircle },
  checked_out: { label: "Checked Out", class: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20", icon: ArrowRight },
  maintenance_required: { label: "Maintenance", class: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20", icon: AlertTriangle },
};

const defaultCategories = ["Power Tools", "Hand Tools", "Safety Equipment", "Electrical", "Plumbing", "Measuring", "Lifting", "General"];

export default function ToolCatalog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || "");
  const [filterCategory, setFilterCategory] = useState("");
  const [categories, setCategories] = useState(defaultCategories);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newTool, setNewTool] = useState({ asset_id: "", description: "", category: "General", model_name: "", serial_number: "", condition: "good", safety_tag_expiry: "", next_maintenance_date: "", notes: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [selectedTools, setSelectedTools] = useState([]);
  const [showBulkCheckout, setShowBulkCheckout] = useState(false);
  const [showBulkReturn, setShowBulkReturn] = useState(false);
  const [bulkData, setBulkData] = useState({ job_number: "", site: "", site_manager: "", expected_return_date: "", notes: "" });
  const [bulkReturnData, setBulkReturnData] = useState({ condition: "good", notes: "" });

  const fetchTools = useCallback(() => {
    const params = {};
    if (filterStatus) params.status = filterStatus;
    if (filterCategory) params.category = filterCategory;
    if (search) params.search = search;
    api.get('/tools', { params }).then(res => setTools(res.data)).catch(() => toast.error("Failed to load tools")).finally(() => setLoading(false));
  }, [filterStatus, filterCategory, search]);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  useEffect(() => {
    api.get('/categories').then(res => {
      const catNames = res.data.map(c => c.name || c);
      if (catNames.length > 0) setCategories(catNames);
    }).catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!newTool.asset_id || !newTool.description) { toast.error("Asset ID and description required"); return; }
    setAddLoading(true);
    try {
      await api.post('/tools', newTool);
      toast.success("Tool added");
      setShowAdd(false);
      setNewTool({ asset_id: "", description: "", category: "General", model_name: "", serial_number: "", condition: "good", safety_tag_expiry: "", next_maintenance_date: "", notes: "" });
      fetchTools();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add tool");
    } finally {
      setAddLoading(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/import/tools', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Imported ${res.data.imported} tools`);
      if (res.data.errors?.length) toast.error(`${res.data.errors.length} errors during import`);
      setShowImport(false);
      fetchTools();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/reports/export', { params: { format: 'csv' }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'tools_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Export downloaded");
    } catch (err) {
      toast.error("Export failed");
    }
  };

  const canManage = user?.role === "admin" || user?.role === "site_manager";

  const toggleSelect = (toolId) => {
    setSelectedTools(prev => prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId]);
  };

  const selectAllVisible = () => {
    const visibleIds = tools.map(t => t.id);
    const allSelected = visibleIds.every(id => selectedTools.includes(id));
    setSelectedTools(allSelected ? [] : visibleIds);
  };

  const handleBulkCheckout = async () => {
    if (!bulkData.job_number || !bulkData.site || !bulkData.site_manager || !bulkData.expected_return_date) {
      toast.error("Fill all required fields"); return;
    }
    try {
      const res = await api.post('/bulk-checkout', { tool_ids: selectedTools, ...bulkData });
      toast.success(`${res.data.success.length} tools checked out`);
      if (res.data.failed.length) toast.error(`${res.data.failed.length} failed: ${res.data.failed.map(f => f.reason).join(', ')}`);
      setShowBulkCheckout(false); setSelectedTools([]); fetchTools();
    } catch (err) { toast.error("Bulk checkout failed"); }
  };

  const handleBulkReturn = async () => {
    try {
      const res = await api.post('/bulk-return', { tool_ids: selectedTools, ...bulkReturnData });
      toast.success(`${res.data.success.length} tools returned`);
      if (res.data.failed.length) toast.error(`${res.data.failed.length} failed`);
      setShowBulkReturn(false); setSelectedTools([]); fetchTools();
    } catch (err) { toast.error("Bulk return failed"); }
  };

  const selectedAvailable = selectedTools.filter(id => tools.find(t => t.id === id)?.status === 'available');
  const selectedCheckedOut = selectedTools.filter(id => tools.find(t => t.id === id)?.status === 'checked_out');

  return (
    <div className="space-y-6" data-testid="tool-catalog-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">Tools</h1>
          <p className="text-muted-foreground text-sm mt-1">{tools.length} tools in catalog</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <>
              <Dialog open={showImport} onOpenChange={setShowImport}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-10" data-testid="import-tools-btn">
                    <Upload size={14} className="mr-2" /> Import
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-sm">
                  <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Import Tools</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Upload a CSV, Excel, or PDF file with columns: asset_id, description, category, model_name, serial_number, condition, safety_tag_expiry, next_maintenance_date, notes</p>
                    <Input data-testid="import-file-input" type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleImport} className="rounded-none border-2" />
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={handleExport} className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-10" data-testid="export-tools-btn">
                <Download size={14} className="mr-2" /> Export
              </Button>
              <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogTrigger asChild>
                  <Button className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="add-tool-btn">
                    <Plus size={14} className="mr-2" /> Add Tool
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-sm max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Add New Tool</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs uppercase tracking-wider font-bold">Asset ID *</Label>
                        <Input data-testid="tool-asset-id" className="rounded-none border-2 mt-1" placeholder="e.g. PWR-001"
                          value={newTool.asset_id} onChange={e => setNewTool({...newTool, asset_id: e.target.value})} />
                      </div>
                      <div>
                        <Label className="text-xs uppercase tracking-wider font-bold">Category</Label>
                        <Select value={newTool.category} onValueChange={v => setNewTool({...newTool, category: v})}>
                          <SelectTrigger className="rounded-none border-2 mt-1" data-testid="tool-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider font-bold">Description *</Label>
                      <Input data-testid="tool-description" className="rounded-none border-2 mt-1" placeholder="e.g. Makita 18V Impact Driver"
                        value={newTool.description} onChange={e => setNewTool({...newTool, description: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs uppercase tracking-wider font-bold">Model</Label>
                        <Input data-testid="tool-model" className="rounded-none border-2 mt-1" value={newTool.model_name} onChange={e => setNewTool({...newTool, model_name: e.target.value})} />
                      </div>
                      <div>
                        <Label className="text-xs uppercase tracking-wider font-bold">Serial Number</Label>
                        <Input data-testid="tool-serial" className="rounded-none border-2 mt-1" value={newTool.serial_number} onChange={e => setNewTool({...newTool, serial_number: e.target.value})} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs uppercase tracking-wider font-bold">Safety Tag Expiry</Label>
                        <Input data-testid="tool-tag-expiry" type="date" className="rounded-none border-2 mt-1" value={newTool.safety_tag_expiry} onChange={e => setNewTool({...newTool, safety_tag_expiry: e.target.value})} />
                      </div>
                      <div>
                        <Label className="text-xs uppercase tracking-wider font-bold">Next Maintenance</Label>
                        <Input data-testid="tool-maintenance-date" type="date" className="rounded-none border-2 mt-1" value={newTool.next_maintenance_date} onChange={e => setNewTool({...newTool, next_maintenance_date: e.target.value})} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider font-bold">Condition</Label>
                      <Select value={newTool.condition} onValueChange={v => setNewTool({...newTool, condition: v})}>
                        <SelectTrigger className="rounded-none border-2 mt-1" data-testid="tool-condition"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Good</SelectItem>
                          <SelectItem value="fair">Fair</SelectItem>
                          <SelectItem value="poor">Poor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider font-bold">Notes</Label>
                      <Textarea data-testid="tool-notes" className="rounded-none border-2 mt-1" rows={2} value={newTool.notes} onChange={e => setNewTool({...newTool, notes: e.target.value})} />
                    </div>
                    <Button onClick={handleAdd} disabled={addLoading} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="save-tool-btn">
                      {addLoading ? "Saving..." : "Save Tool"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="tool-search" className="pl-10 rounded-none border-2" placeholder="Search tools by ID, description, serial..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-44 rounded-none border-2" data-testid="filter-status"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="checked_out">Checked Out</SelectItem>
            <SelectItem value="maintenance_required">Maintenance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={v => setFilterCategory(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-44 rounded-none border-2" data-testid="filter-category"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Action Bar */}
      {selectedTools.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 border-2 border-[hsl(38,92%,50%)]/30 bg-[hsl(38,92%,50%)]/5" data-testid="bulk-action-bar">
          <span className="text-sm font-bold">{selectedTools.length} selected</span>
          {selectedAvailable.length > 0 && (
            <Dialog open={showBulkCheckout} onOpenChange={setShowBulkCheckout}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider" data-testid="bulk-checkout-btn">
                  <ArrowRight size={12} className="mr-1" /> Checkout {selectedAvailable.length}
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Bulk Checkout ({selectedAvailable.length} tools)</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Job Number *</Label><Input data-testid="bulk-job" className="rounded-none border-2 mt-1" value={bulkData.job_number} onChange={e => setBulkData({...bulkData, job_number: e.target.value})} /></div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Site *</Label><Input data-testid="bulk-site" className="rounded-none border-2 mt-1" value={bulkData.site} onChange={e => setBulkData({...bulkData, site: e.target.value})} /></div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Site Manager *</Label><Input data-testid="bulk-manager" className="rounded-none border-2 mt-1" value={bulkData.site_manager} onChange={e => setBulkData({...bulkData, site_manager: e.target.value})} /></div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Expected Return *</Label><Input data-testid="bulk-return-date" type="date" className="rounded-none border-2 mt-1" value={bulkData.expected_return_date} onChange={e => setBulkData({...bulkData, expected_return_date: e.target.value})} /></div>
                  <Button onClick={handleBulkCheckout} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-bulk-checkout-btn">Checkout {selectedAvailable.length} Tools</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {selectedCheckedOut.length > 0 && (
            <Dialog open={showBulkReturn} onOpenChange={setShowBulkReturn}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-none uppercase text-xs font-bold tracking-wider border-2" data-testid="bulk-return-btn">
                  <RotateCcw size={12} className="mr-1" /> Return {selectedCheckedOut.length}
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Bulk Return ({selectedCheckedOut.length} tools)</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">Condition</Label>
                    <Select value={bulkReturnData.condition} onValueChange={v => setBulkReturnData({...bulkReturnData, condition: v})}>
                      <SelectTrigger className="rounded-none border-2 mt-1" data-testid="bulk-return-condition"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="damaged">Damaged</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Notes</Label><Textarea data-testid="bulk-return-notes" className="rounded-none border-2 mt-1" rows={2} value={bulkReturnData.notes} onChange={e => setBulkReturnData({...bulkReturnData, notes: e.target.value})} /></div>
                  <Button onClick={handleBulkReturn} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-bulk-return-btn">Return {selectedCheckedOut.length} Tools</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="ghost" size="sm" className="rounded-none text-xs" onClick={() => setSelectedTools([])} data-testid="clear-selection-btn">Clear</Button>
        </div>
      )}

      {/* Tool List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-sm" />)}</div>
      ) : tools.length === 0 ? (
        <Card className="rounded-sm shadow-none border border-border" data-testid="no-tools-message">
          <CardContent className="py-12 text-center">
            <Wrench size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No tools found</p>
            <p className="text-sm text-muted-foreground mt-1">Add your first tool or import from a file</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Select All */}
          <div className="flex items-center gap-2 px-2 py-1">
            <Checkbox checked={tools.length > 0 && tools.every(t => selectedTools.includes(t.id))}
              onCheckedChange={selectAllVisible} data-testid="select-all-tools" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Select all</span>
          </div>
          {tools.map(tool => {
            const sc = statusConfig[tool.status] || statusConfig.available;
            const Icon = sc.icon;
            const isSelected = selectedTools.includes(tool.id);
            return (
              <Card
                key={tool.id}
                className={`rounded-sm shadow-none border cursor-pointer transition-all duration-150 hover:border-[hsl(38,92%,50%)]/50 hover:-translate-y-0.5 ${isSelected ? 'border-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/5' : 'border-border'}`}
                data-testid={`tool-card-${tool.asset_id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(tool.id)}
                      onClick={e => e.stopPropagation()} data-testid={`select-tool-${tool.asset_id}`} className="shrink-0" />
                    {tool.photo_url ? (
                      <img src={tool.photo_url.startsWith('/api') ? `${process.env.REACT_APP_BACKEND_URL}${tool.photo_url}` : tool.photo_url}
                        alt={tool.description} className="w-10 h-10 object-cover shrink-0" onClick={() => navigate(`/tools/${tool.id}`)} />
                    ) : (
                      <div className={`w-10 h-10 flex items-center justify-center shrink-0 ${
                        tool.status === 'available' ? 'bg-emerald-500/15 text-emerald-500' :
                        tool.status === 'maintenance_required' ? 'bg-rose-500/15 text-rose-500' :
                        'bg-blue-500/15 text-blue-500'
                      }`} onClick={() => navigate(`/tools/${tool.id}`)}>
                        <Icon size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0" onClick={() => navigate(`/tools/${tool.id}`)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-['JetBrains_Mono'] text-sm font-medium">{tool.asset_id}</span>
                        <Badge className={`${sc.class} rounded-full text-[10px] font-bold uppercase px-2 py-0`}>{sc.label}</Badge>
                        <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0">{tool.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{tool.description}</p>
                    </div>
                    <div className="hidden sm:block text-right shrink-0">
                      {tool.current_holder_name && (
                        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{tool.current_holder_name}</span></p>
                      )}
                      {tool.current_site && <p className="text-xs text-muted-foreground">{tool.current_site}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
