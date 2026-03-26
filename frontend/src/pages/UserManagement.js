import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Shield, Wrench, Users as UsersIcon, Pencil, Search } from "lucide-react";

const roleBadge = {
  admin: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  site_manager: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  worker: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20",
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "worker" });
  const [editData, setEditData] = useState({ name: "", role: "", email: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const fetchUsers = useCallback(() => {
    const params = {};
    if (search) params.search = search;
    if (filterRole) params.role = filterRole;
    if (filterStatus) params.status = filterStatus;
    api.get('/users', { params }).then(res => setUsers(res.data)).catch(() => toast.error("Failed to load users")).finally(() => setLoading(false));
  }, [search, filterRole, filterStatus]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) { toast.error("Fill all fields"); return; }
    setAddLoading(true);
    try {
      await api.post('/users', newUser);
      toast.success("User created");
      setShowAdd(false);
      setNewUser({ name: "", email: "", password: "", role: "worker" });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create user");
    } finally {
      setAddLoading(false);
    }
  };

  const handleEdit = async () => {
    const updates = {};
    if (editData.name && editData.name !== editUser.name) updates.name = editData.name;
    if (editData.role && editData.role !== editUser.role) updates.role = editData.role;
    if (editData.email && editData.email !== editUser.email) updates.email = editData.email;
    if (Object.keys(updates).length === 0) { toast.error("No changes"); return; }
    try {
      await api.put(`/users/${editUser.id}`, updates);
      toast.success("User updated");
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Update failed");
    }
  };

  const handleDeactivate = async (userId) => {
    if (userId === currentUser?.id) { toast.error("Cannot deactivate yourself"); return; }
    try {
      await api.delete(`/users/${userId}`);
      toast.success("User deactivated");
      fetchUsers();
    } catch (err) { toast.error("Failed"); }
  };

  if (currentUser?.role !== "admin" && currentUser?.role !== "site_manager") {
    return <p className="text-muted-foreground">Access denied</p>;
  }

  return (
    <div className="space-y-6" data-testid="user-management-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm mt-1">{users.length} team members</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="add-user-btn">
              <UserPlus size={14} className="mr-2" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Add New User</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs uppercase tracking-wider font-bold">Name</Label><Input data-testid="new-user-name" className="rounded-none border-2 mt-1" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} /></div>
              <div><Label className="text-xs uppercase tracking-wider font-bold">Email</Label><Input data-testid="new-user-email" type="email" className="rounded-none border-2 mt-1" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} /></div>
              <div><Label className="text-xs uppercase tracking-wider font-bold">Password</Label><Input data-testid="new-user-password" type="password" className="rounded-none border-2 mt-1" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} /></div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Role</Label>
                <Select value={newUser.role} onValueChange={v => setNewUser({...newUser, role: v})}>
                  <SelectTrigger className="rounded-none border-2 mt-1" data-testid="new-user-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Worker / User</SelectItem>
                    <SelectItem value="site_manager">Site Manager</SelectItem>
                    {currentUser?.role === "admin" && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={addLoading} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-add-user-btn">
                {addLoading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="user-search" className="pl-10 rounded-none border-2" placeholder="Search by name or email..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterRole} onValueChange={v => setFilterRole(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-40 rounded-none border-2" data-testid="filter-user-role"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="site_manager">Site Manager</SelectItem>
            <SelectItem value="worker">Worker</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-36 rounded-none border-2" data-testid="filter-user-status"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Edit User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-wider font-bold">Name</Label><Input className="rounded-none border-2 mt-1" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} data-testid="edit-user-name" /></div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Email</Label><Input className="rounded-none border-2 mt-1" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} data-testid="edit-user-email" /></div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-bold">Role</Label>
              <Select value={editData.role} onValueChange={v => setEditData({...editData, role: v})}>
                <SelectTrigger className="rounded-none border-2 mt-1" data-testid="edit-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">Worker / User</SelectItem>
                  <SelectItem value="site_manager">Site Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleEdit} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-edit-user-btn">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-sm" />)}</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id} className={`rounded-sm shadow-none border border-border ${!u.is_active ? 'opacity-50' : ''}`} data-testid={`user-card-${u.email}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-sm bg-[hsl(38,92%,50%)] flex items-center justify-center text-black font-bold text-sm shrink-0">
                  {u.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{u.name}</span>
                    <Badge className={`${roleBadge[u.role] || roleBadge.worker} rounded-full text-[10px] font-bold uppercase px-2 py-0`}>
                      {u.role?.replace('_', ' ')}
                    </Badge>
                    {!u.is_active && <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0">Inactive</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                </div>
                {currentUser?.role === "admin" && u.id !== currentUser?.id && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="rounded-none h-8 w-8 p-0" data-testid={`edit-user-${u.email}`}
                      onClick={() => { setEditUser(u); setEditData({ name: u.name, role: u.role, email: u.email }); }}>
                      <Pencil size={14} />
                    </Button>
                    {u.is_active && (
                      <Button variant="ghost" size="sm" className="rounded-none h-8 text-xs text-destructive" data-testid={`deactivate-user-${u.email}`}
                        onClick={() => handleDeactivate(u.id)}>
                        Deactivate
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
