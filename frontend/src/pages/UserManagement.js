import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  KeyRound,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  UserPlus,
  Users as UsersIcon,
  Wrench,
  XCircle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLE_BADGE = {
  admin: "border-rose-500/20 bg-rose-500/15 text-rose-600 dark:text-rose-400",
  site_manager: "border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  worker: "border-blue-500/20 bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const ROLE_LABELS = {
  admin: "Admin",
  site_manager: "Site Manager",
  worker: "Worker",
};

const ROLE_OPTIONS = [
  { value: "worker", label: "Worker / User" },
  { value: "site_manager", label: "Site Manager" },
  { value: "admin", label: "Admin" },
];

const EMPTY_NEW_USER = {
  name: "",
  email: "",
  password: "",
  role: "worker",
};

const EMPTY_INVITE_USER = {
  name: "",
  email: "",
  role: "worker",
};

const EMPTY_RESET_PASSWORD = {
  new_password: "",
  confirm_password: "",
};

function isValidEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || "").trim());
}

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normaliseName(value) {
  return String(value || "").trim();
}

function errorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

function userIsActive(user) {
  return user?.is_active !== false;
}

function getInitial(user) {
  const value = user?.name || user?.email || "U";
  return value.trim().charAt(0).toUpperCase();
}

function roleLabel(role) {
  return ROLE_LABELS[role] || String(role || "User").replace(/_/g, " ");
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
    <Card className="rounded-sm border-2 border-rose-500/30 bg-rose-500/5 shadow-none" data-testid="user-management-access-denied">
      <CardContent className="flex items-start gap-3 p-5">
        <ShieldAlert size={22} className="mt-0.5 shrink-0 text-rose-500" />
        <div>
          <p className="font-bold">Access denied</p>
          <p className="mt-1 text-sm text-muted-foreground">
            User management is available to administrators and site managers only.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, icon: Icon, tone = "default" }) {
  const toneClass = {
    default: "border-border bg-card text-muted-foreground",
    green: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-500",
    red: "border-rose-500/30 bg-rose-500/5 text-rose-500",
  }[tone];

  return (
    <Card className={`rounded-sm border-2 shadow-none ${toneClass}`}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 font-['Barlow_Condensed'] text-3xl font-black leading-none text-foreground">
            {value}
          </p>
        </div>
        <Icon size={24} />
      </CardContent>
    </Card>
  );
}

function LoadingList() {
  return (
    <div className="space-y-3" data-testid="users-loading">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-20 animate-pulse rounded-sm bg-muted" />
      ))}
    </div>
  );
}

function EmptyUsers({ hasFilters }) {
  return (
    <Card className="rounded-sm border border-border shadow-none" data-testid="users-empty">
      <CardContent className="py-12 text-center">
        <UsersIcon size={46} className="mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-bold">{hasFilters ? "No users match the current filters" : "No users found"}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {hasFilters
            ? "Clear search, role, or status filters to see more team members."
            : "Add your first worker, site manager, or administrator to start controlling tool access."}
        </p>
      </CardContent>
    </Card>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const [inviteUser, setInviteUser] = useState(EMPTY_INVITE_USER);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [editData, setEditData] = useState({ name: "", role: "", email: "" });
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [resetPasswordData, setResetPasswordData] = useState(EMPTY_RESET_PASSWORD);

  const [busyAction, setBusyAction] = useState("");
  const [errors, setErrors] = useState({});

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const canAccess = currentUser?.role === "admin" || currentUser?.role === "site_manager";
  const canAdminister = currentUser?.role === "admin";
  const canCreateUsers = currentUser?.role === "admin" || currentUser?.role === "site_manager";

  const availableCreateRoles = useMemo(() => {
    if (canAdminister) return ROLE_OPTIONS;
    return ROLE_OPTIONS.filter((role) => role.value === "worker");
  }, [canAdminister]);

  const stats = useMemo(() => {
    const active = users.filter(userIsActive).length;
    const inactive = users.length - active;
    const admins = users.filter((item) => item.role === "admin").length;
    const siteManagers = users.filter((item) => item.role === "site_manager").length;

    return {
      total: users.length,
      active,
      inactive,
      admins,
      siteManagers,
    };
  }, [users]);

  const hasFilters = Boolean(search || filterRole || filterStatus);

  const fetchUsers = useCallback(async ({ showRefresh = false } = {}) => {
    if (showRefresh) setRefreshing(true);

    const params = {};
    if (search.trim()) params.search = search.trim();
    if (filterRole) params.role = filterRole;
    if (filterStatus) params.status = filterStatus;

    try {
      const response = await api.get("/users", { params });
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to load users."));
      setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, filterRole, filterStatus]);

  useEffect(() => {
    if (canAccess) fetchUsers();
  }, [canAccess, fetchUsers]);

  const updateNewUser = (field, value) => {
    setNewUser((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`new_${field}`]: "" }));
  };

  const updateInviteUser = (field, value) => {
    setInviteUser((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`invite_${field}`]: "" }));
  };

  const updateEditUser = (field, value) => {
    setEditData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`edit_${field}`]: "" }));
  };

  const updateResetPassword = (field, value) => {
    setResetPasswordData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`reset_${field}`]: "" }));
  };

  const resetAddDialog = () => {
    setNewUser(EMPTY_NEW_USER);
    setErrors({});
    setShowAdd(false);
  };

  const resetInviteDialog = () => {
    setInviteUser(EMPTY_INVITE_USER);
    setErrors({});
    setShowInvite(false);
  };

  const closeResetPasswordDialog = () => {
    setResetPasswordUser(null);
    setResetPasswordData(EMPTY_RESET_PASSWORD);
    setErrors({});
  };

  const openResetPasswordDialog = (targetUser) => {
    setResetPasswordUser(targetUser);
    setResetPasswordData(EMPTY_RESET_PASSWORD);
    setErrors({});
  };

  const openEditDialog = (targetUser) => {
    setEditUser(targetUser);
    setEditData({
      name: targetUser?.name || "",
      role: targetUser?.role || "worker",
      email: targetUser?.email || "",
    });
    setErrors({});
  };

  const validateNewUser = () => {
    const nextErrors = {};

    if (!normaliseName(newUser.name)) nextErrors.new_name = "Name is required.";
    if (!newUser.email.trim()) nextErrors.new_email = "Email is required.";
    else if (!isValidEmail(newUser.email)) nextErrors.new_email = "Enter a valid email address.";
    if (newUser.password.length < 6) nextErrors.new_password = "Password must be at least 6 characters.";

    if (!canAdminister && newUser.role !== "worker") {
      nextErrors.new_role = "Site managers can only create worker accounts.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateInviteUser = () => {
    const nextErrors = {};

    if (!normaliseName(inviteUser.name)) nextErrors.invite_name = "Name is required.";
    if (!inviteUser.email.trim()) nextErrors.invite_email = "Email is required.";
    else if (!isValidEmail(inviteUser.email)) nextErrors.invite_email = "Enter a valid email address.";

    if (!canAdminister && inviteUser.role !== "worker") {
      nextErrors.invite_role = "Site managers can only invite worker accounts.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateEditUser = () => {
    const nextErrors = {};

    if (!normaliseName(editData.name)) nextErrors.edit_name = "Name is required.";
    if (!editData.email.trim()) nextErrors.edit_email = "Email is required.";
    else if (!isValidEmail(editData.email)) nextErrors.edit_email = "Enter a valid email address.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateResetPassword = () => {
    const nextErrors = {};

    if ((resetPasswordData.new_password || "").length < 6) {
      nextErrors.reset_new_password = "Password must be at least 6 characters.";
    }

    if (resetPasswordData.new_password !== resetPasswordData.confirm_password) {
      nextErrors.reset_confirm_password = "Passwords do not match.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleAdd = async () => {
    if (!validateNewUser()) return;

    setBusyAction("add");

    try {
      await api.post("/users", {
        name: normaliseName(newUser.name),
        email: normaliseEmail(newUser.email),
        password: newUser.password,
        role: newUser.role,
      });

      toast.success("User created");
      resetAddDialog();
      fetchUsers();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to create user."));
    } finally {
      setBusyAction("");
    }
  };

  const handleInvite = async () => {
    if (!validateInviteUser()) return;

    setBusyAction("invite");

    try {
      await api.post("/users/invite", {
        name: normaliseName(inviteUser.name),
        email: normaliseEmail(inviteUser.email),
        role: inviteUser.role,
      });

      toast.success("Invite email sent");
      resetInviteDialog();
      fetchUsers();
    } catch (error) {
      toast.error(errorMessage(error, "Invite failed. Check email settings and sender verification."));
    } finally {
      setBusyAction("");
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    if (!validateEditUser()) return;

    const updates = {};
    const nextName = normaliseName(editData.name);
    const nextEmail = normaliseEmail(editData.email);

    if (nextName !== editUser.name) updates.name = nextName;
    if (nextEmail !== editUser.email) updates.email = nextEmail;
    if (editData.role && editData.role !== editUser.role) updates.role = editData.role;

    if (Object.keys(updates).length === 0) {
      toast.error("No changes to save.");
      return;
    }

    if (editUser.id === currentUser?.id && updates.role && updates.role !== currentUser?.role) {
      toast.error("You cannot change your own role.");
      return;
    }

    setBusyAction("edit");

    try {
      await api.put(`/users/${editUser.id}`, updates);
      toast.success("User updated");
      setEditUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(errorMessage(error, "Update failed."));
    } finally {
      setBusyAction("");
    }
  };

  const handleDeactivate = async (targetUser) => {
    if (!targetUser?.id) return;

    if (targetUser.id === currentUser?.id) {
      toast.error("You cannot deactivate yourself.");
      return;
    }

    const confirmed = window.confirm(`Deactivate ${targetUser.name || targetUser.email}?`);
    if (!confirmed) return;

    setBusyAction(`deactivate-${targetUser.id}`);

    try {
      await api.delete(`/users/${targetUser.id}`);
      toast.success("User deactivated");
      fetchUsers();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to deactivate user."));
    } finally {
      setBusyAction("");
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser?.id) return;
    if (!validateResetPassword()) return;

    setBusyAction(`reset-password-${resetPasswordUser.id}`);

    try {
      await api.post(`/users/${resetPasswordUser.id}/reset-password`, {
        new_password: resetPasswordData.new_password,
      });
      toast.success(`Password reset for ${resetPasswordUser.name || resetPasswordUser.email}`);
      closeResetPasswordDialog();
    } catch (error) {
      toast.error(errorMessage(error, "Password reset failed."));
    } finally {
      setBusyAction("");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFilterRole("");
    setFilterStatus("");
  };

  if (!canAccess) return <AccessDenied />;

  return (
    <div className="space-y-6" data-testid="user-management-page">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Access control
          </p>
          <h1 className="mt-1 font-['Barlow_Condensed'] text-4xl font-black uppercase tracking-tight md:text-5xl">
            Users
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage administrators, site managers, and workers who can access Tool Tracker.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={() => fetchUsers({ showRefresh: true })}
            disabled={refreshing}
            data-testid="refresh-users-btn"
          >
            <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canCreateUsers && (
            <Dialog open={showInvite} onOpenChange={(open) => (open ? setShowInvite(true) : resetInviteDialog())}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
                  data-testid="invite-user-btn"
                >
                  <Mail size={14} className="mr-2" />
                  Invite User
                </Button>
              </DialogTrigger>

              <DialogContent className="rounded-sm">
                <DialogHeader>
                  <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
                    Invite User
                  </DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                  <p className="text-sm text-muted-foreground">
                    Sends a Tool Tracker invite email with a temporary password. The user must set their own password on first login.
                  </p>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Name</Label>
                    <Input
                      data-testid="invite-user-name"
                      className="mt-1 rounded-none border-2"
                      value={inviteUser.name}
                      onChange={(event) => updateInviteUser("name", event.target.value)}
                    />
                    <FieldError message={errors.invite_name} />
                  </div>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Email</Label>
                    <Input
                      data-testid="invite-user-email"
                      type="email"
                      className="mt-1 rounded-none border-2"
                      value={inviteUser.email}
                      onChange={(event) => updateInviteUser("email", event.target.value)}
                    />
                    <FieldError message={errors.invite_email} />
                  </div>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Role</Label>
                    <Select value={inviteUser.role} onValueChange={(value) => updateInviteUser("role", value)}>
                      <SelectTrigger className="mt-1 rounded-none border-2" data-testid="invite-user-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCreateRoles.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError message={errors.invite_role} />
                  </div>

                  <Button
                    onClick={handleInvite}
                    disabled={busyAction === "invite"}
                    className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                    data-testid="confirm-invite-user-btn"
                  >
                    {busyAction === "invite" ? "Sending..." : "Send Invite"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {canCreateUsers && (
            <Dialog open={showAdd} onOpenChange={(open) => (open ? setShowAdd(true) : resetAddDialog())}>
              <DialogTrigger asChild>
                <Button
                  className="h-10 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                  data-testid="add-user-btn"
                >
                  <UserPlus size={14} className="mr-2" />
                  Add User
                </Button>
              </DialogTrigger>

              <DialogContent className="rounded-sm">
                <DialogHeader>
                  <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
                    Add New User
                  </DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Name</Label>
                    <Input
                      data-testid="new-user-name"
                      className="mt-1 rounded-none border-2"
                      value={newUser.name}
                      onChange={(event) => updateNewUser("name", event.target.value)}
                    />
                    <FieldError message={errors.new_name} />
                  </div>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Email</Label>
                    <Input
                      data-testid="new-user-email"
                      type="email"
                      className="mt-1 rounded-none border-2"
                      value={newUser.email}
                      onChange={(event) => updateNewUser("email", event.target.value)}
                    />
                    <FieldError message={errors.new_email} />
                  </div>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Temporary Password</Label>
                    <Input
                      data-testid="new-user-password"
                      type="password"
                      className="mt-1 rounded-none border-2"
                      value={newUser.password}
                      onChange={(event) => updateNewUser("password", event.target.value)}
                    />
                    <FieldError message={errors.new_password} />
                  </div>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Role</Label>
                    <Select value={newUser.role} onValueChange={(value) => updateNewUser("role", value)}>
                      <SelectTrigger className="mt-1 rounded-none border-2" data-testid="new-user-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCreateRoles.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError message={errors.new_role} />
                  </div>

                  <Button
                    onClick={handleAdd}
                    disabled={busyAction === "add"}
                    className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                    data-testid="confirm-add-user-btn"
                  >
                    {busyAction === "add" ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total" value={stats.total} icon={UsersIcon} />
        <StatCard title="Active" value={stats.active} icon={CheckCircle} tone="green" />
        <StatCard title="Inactive" value={stats.inactive} icon={XCircle} tone="red" />
        <StatCard title="Admins" value={stats.admins} icon={Shield} tone="red" />
        <StatCard title="Managers" value={stats.siteManagers} icon={Wrench} tone="amber" />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="user-search"
            className="rounded-none border-2 pl-10"
            placeholder="Search by name or email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select value={filterRole} onValueChange={(value) => setFilterRole(value === "all" ? "" : value)}>
          <SelectTrigger className="rounded-none border-2" data-testid="filter-user-role">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="site_manager">Site Manager</SelectItem>
            <SelectItem value="worker">Worker</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value === "all" ? "" : value)}>
          <SelectTrigger className="rounded-none border-2" data-testid="filter-user-status">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
          onClick={clearFilters}
          disabled={!hasFilters}
          data-testid="clear-user-filters-btn"
        >
          Clear
        </Button>
      </section>

      <Dialog open={Boolean(editUser)} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
              Edit User
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Name</Label>
              <Input
                className="mt-1 rounded-none border-2"
                value={editData.name}
                onChange={(event) => updateEditUser("name", event.target.value)}
                data-testid="edit-user-name"
              />
              <FieldError message={errors.edit_name} />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Email</Label>
              <Input
                className="mt-1 rounded-none border-2"
                value={editData.email}
                onChange={(event) => updateEditUser("email", event.target.value)}
                data-testid="edit-user-email"
              />
              <FieldError message={errors.edit_email} />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Role</Label>
              <Select
                value={editData.role}
                onValueChange={(value) => updateEditUser("role", value)}
                disabled={!canAdminister || editUser?.id === currentUser?.id}
              >
                <SelectTrigger className="mt-1 rounded-none border-2" data-testid="edit-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editUser?.id === currentUser?.id && (
                <p className="mt-1 text-xs text-muted-foreground">
                  You cannot change your own role.
                </p>
              )}
            </div>

            <Button
              onClick={handleEdit}
              disabled={busyAction === "edit"}
              className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
              data-testid="confirm-edit-user-btn"
            >
              {busyAction === "edit" ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetPasswordUser)} onOpenChange={(open) => { if (!open) closeResetPasswordDialog(); }}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
              Reset Password
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Set a new temporary password for <span className="font-semibold text-foreground">{resetPasswordUser?.name || resetPasswordUser?.email}</span>.
            </p>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">New Password</Label>
              <Input
                type="password"
                className="mt-1 rounded-none border-2"
                value={resetPasswordData.new_password}
                onChange={(event) => updateResetPassword("new_password", event.target.value)}
                data-testid="reset-password-new"
              />
              <FieldError message={errors.reset_new_password} />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Confirm Password</Label>
              <Input
                type="password"
                className="mt-1 rounded-none border-2"
                value={resetPasswordData.confirm_password}
                onChange={(event) => updateResetPassword("confirm_password", event.target.value)}
                data-testid="reset-password-confirm"
              />
              <FieldError message={errors.reset_confirm_password} />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={closeResetPasswordDialog}
                className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
                data-testid="cancel-reset-password-btn"
              >
                Cancel
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={busyAction === `reset-password-${resetPasswordUser?.id}`}
                className="h-10 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                data-testid="confirm-reset-password-btn"
              >
                {busyAction === `reset-password-${resetPasswordUser?.id}` ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <LoadingList />
      ) : users.length === 0 ? (
        <EmptyUsers hasFilters={hasFilters} />
      ) : (
        <section className="space-y-2" data-testid="user-list">
          {users.map((item) => {
            const active = userIsActive(item);
            const isSelf = item.id === currentUser?.id;
            const canEditThisUser = canAdminister;
            const canResetPasswordThisUser = canAdminister && !isSelf && active;
            const canDeactivateThisUser = canAdminister && !isSelf && active;

            return (
              <Card
                key={item.id}
                className={`rounded-sm border border-border shadow-none transition-colors hover:border-[hsl(38,92%,50%)]/50 ${
                  !active ? "opacity-55" : ""
                }`}
                data-testid={`user-card-${item.email}`}
              >
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[hsl(38,92%,50%)] text-sm font-black text-black">
                      {getInitial(item)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold">{item.name || "Unnamed user"}</span>
                        {isSelf && (
                          <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
                            You
                          </Badge>
                        )}
                        <Badge className={`${ROLE_BADGE[item.role] || ROLE_BADGE.worker} rounded-full px-2 py-0 text-[10px] font-black uppercase`}>
                          {roleLabel(item.role)}
                        </Badge>
                        {!active && (
                          <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
                            Inactive
                          </Badge>
                        )}
                      </div>

                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{item.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {canEditThisUser && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none border-2 text-xs font-black uppercase tracking-wider"
                        data-testid={`edit-user-${item.email}`}
                        onClick={() => openEditDialog(item)}
                      >
                        <Pencil size={14} className="mr-1" />
                        Edit
                      </Button>
                    )}

                    {canResetPasswordThisUser && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none border-2 text-xs font-black uppercase tracking-wider"
                        data-testid={`reset-password-user-${item.email}`}
                        onClick={() => openResetPasswordDialog(item)}
                        disabled={busyAction === `reset-password-${item.id}`}
                      >
                        <KeyRound size={14} className="mr-1" />
                        Reset Password
                      </Button>
                    )}

                    {canDeactivateThisUser && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-none text-xs font-black uppercase tracking-wider text-destructive"
                        data-testid={`deactivate-user-${item.email}`}
                        onClick={() => handleDeactivate(item)}
                        disabled={busyAction === `deactivate-${item.id}`}
                      >
                        {busyAction === `deactivate-${item.id}` ? "Deactivating..." : "Deactivate"}
                      </Button>
                    )}
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
