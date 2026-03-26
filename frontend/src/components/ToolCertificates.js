import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldCheck, Plus, FileUp, Trash2, ExternalLink, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const statusStyles = {
  valid: { class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20", icon: CheckCircle },
  expiring_soon: { class: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20", icon: Clock },
  expired: { class: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20", icon: AlertTriangle },
};

export function ToolCertificates({ toolId }) {
  const { user } = useAuth();
  const [certs, setCerts] = useState([]);
  const [certTypes, setCertTypes] = useState({ types: [], standards: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newCert, setNewCert] = useState({
    tool_id: toolId, certificate_type: "", certificate_number: "",
    issuer_name: "", issuer_company: "", issuer_license_number: "",
    nz_standard: "", issue_date: "", expiry_date: "", notes: ""
  });

  const fetchCerts = useCallback(() => {
    api.get(`/certificates?tool_id=${toolId}`).then(res => setCerts(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, [toolId]);

  useEffect(() => { fetchCerts(); }, [fetchCerts]);
  useEffect(() => { api.get('/certificates/types').then(res => setCertTypes(res.data)).catch(() => {}); }, []);

  const handleAdd = async () => {
    if (!newCert.certificate_type || !newCert.issuer_name || !newCert.issue_date || !newCert.expiry_date) {
      toast.error("Fill required fields: type, issuer, dates"); return;
    }
    try {
      await api.post('/certificates', { ...newCert, tool_id: toolId });
      toast.success("Certificate added");
      setShowAdd(false);
      setNewCert({ tool_id: toolId, certificate_type: "", certificate_number: "", issuer_name: "", issuer_company: "", issuer_license_number: "", nz_standard: "", issue_date: "", expiry_date: "", notes: "" });
      fetchCerts();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const handleDocUpload = async (certId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/certificates/${certId}/document`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success("Document uploaded");
      fetchCerts();
    } catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
  };

  const handleDelete = async (certId) => {
    if (!window.confirm("Delete this certificate?")) return;
    try {
      await api.delete(`/certificates/${certId}`);
      toast.success("Certificate deleted");
      fetchCerts();
    } catch (err) { toast.error("Delete failed"); }
  };

  const canManage = user?.role === "admin" || user?.role === "site_manager";

  return (
    <Card className="rounded-sm shadow-none border border-border" data-testid="certificates-section">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <ShieldCheck size={16} /> Compliance Certificates
          </CardTitle>
          {canManage && (
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-8" data-testid="add-certificate-btn">
                  <Plus size={12} className="mr-1" /> Add Certificate
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Add Certificate</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">Certificate Type *</Label>
                    <Select value={newCert.certificate_type} onValueChange={v => setNewCert({...newCert, certificate_type: v})}>
                      <SelectTrigger className="rounded-none border-2 mt-1" data-testid="cert-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {certTypes.types?.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">Certificate Number</Label>
                    <Input data-testid="cert-number" className="rounded-none border-2 mt-1" placeholder="e.g. INS-2026-00123"
                      value={newCert.certificate_number} onChange={e => setNewCert({...newCert, certificate_number: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs uppercase tracking-wider font-bold">Inspector Name *</Label>
                      <Input data-testid="cert-issuer" className="rounded-none border-2 mt-1" placeholder="Inspector name"
                        value={newCert.issuer_name} onChange={e => setNewCert({...newCert, issuer_name: e.target.value})} />
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider font-bold">Company</Label>
                      <Input data-testid="cert-company" className="rounded-none border-2 mt-1" placeholder="Inspection company"
                        value={newCert.issuer_company} onChange={e => setNewCert({...newCert, issuer_company: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">NZ License / Registration Number</Label>
                    <Input data-testid="cert-license" className="rounded-none border-2 mt-1" placeholder="License or registration number"
                      value={newCert.issuer_license_number} onChange={e => setNewCert({...newCert, issuer_license_number: e.target.value})} />
                    <p className="text-xs text-muted-foreground mt-1">Required where NZ law mandates licensed inspectors</p>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">NZ Standard Reference</Label>
                    <Select value={newCert.nz_standard} onValueChange={v => setNewCert({...newCert, nz_standard: v})}>
                      <SelectTrigger className="rounded-none border-2 mt-1" data-testid="cert-standard"><SelectValue placeholder="Select standard" /></SelectTrigger>
                      <SelectContent>
                        {certTypes.standards?.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs uppercase tracking-wider font-bold">Issue Date *</Label>
                      <Input data-testid="cert-issue-date" type="date" className="rounded-none border-2 mt-1"
                        value={newCert.issue_date} onChange={e => setNewCert({...newCert, issue_date: e.target.value})} />
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider font-bold">Expiry Date *</Label>
                      <Input data-testid="cert-expiry-date" type="date" className="rounded-none border-2 mt-1"
                        value={newCert.expiry_date} onChange={e => setNewCert({...newCert, expiry_date: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">Notes</Label>
                    <Textarea data-testid="cert-notes" className="rounded-none border-2 mt-1" rows={2}
                      value={newCert.notes} onChange={e => setNewCert({...newCert, notes: e.target.value})} />
                  </div>
                  <Button onClick={handleAdd} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="save-certificate-btn">
                    Save Certificate
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-sm" />)}</div>
        ) : certs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No compliance certificates recorded</p>
        ) : (
          <div className="space-y-3">
            {certs.map(cert => {
              const ss = statusStyles[cert.status] || statusStyles.valid;
              const Icon = ss.icon;
              return (
                <div key={cert.id} className="p-3 border border-border hover:border-[hsl(38,92%,50%)]/30 transition-colors" data-testid={`cert-card-${cert.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon size={14} className={cert.status === 'valid' ? 'text-emerald-500' : cert.status === 'expired' ? 'text-rose-500' : 'text-amber-500'} />
                        <span className="text-sm font-medium">{cert.certificate_type}</span>
                        <Badge className={`${ss.class} rounded-full text-[10px] font-bold uppercase px-2 py-0`}>
                          {cert.status?.replace('_', ' ')}
                        </Badge>
                      </div>
                      {cert.certificate_number && <p className="text-xs font-['JetBrains_Mono'] text-muted-foreground mt-1">#{cert.certificate_number}</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span>Inspector: <span className="text-foreground font-medium">{cert.issuer_name}</span></span>
                        {cert.issuer_company && <span>Company: <span className="text-foreground">{cert.issuer_company}</span></span>}
                        {cert.issuer_license_number && <span>License: <span className="text-foreground font-['JetBrains_Mono']">{cert.issuer_license_number}</span></span>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Issued: {new Date(cert.issue_date).toLocaleDateString('en-NZ')}</span>
                        <span className={cert.status === 'expired' ? 'text-rose-500 font-bold' : cert.status === 'expiring_soon' ? 'text-amber-500 font-bold' : ''}>
                          Expires: {new Date(cert.expiry_date).toLocaleDateString('en-NZ')}
                        </span>
                      </div>
                      {cert.nz_standard && <p className="text-xs text-muted-foreground mt-1">Standard: {cert.nz_standard}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {cert.document_url ? (
                        <a href={cert.document_url.startsWith('/api') ? `${process.env.REACT_APP_BACKEND_URL}${cert.document_url}` : cert.document_url}
                          target="_blank" rel="noopener noreferrer" className="inline-flex">
                          <Button variant="ghost" size="sm" className="rounded-none h-7 text-xs" data-testid={`view-cert-doc-${cert.id}`}>
                            <ExternalLink size={12} className="mr-1" /> View
                          </Button>
                        </a>
                      ) : canManage ? (
                        <label>
                          <Input type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="hidden"
                            onChange={e => e.target.files?.[0] && handleDocUpload(cert.id, e.target.files[0])} />
                          <Button variant="ghost" size="sm" className="rounded-none h-7 text-xs" asChild>
                            <span><FileUp size={12} className="mr-1" /> Upload</span>
                          </Button>
                        </label>
                      ) : null}
                      {canManage && (
                        <Button variant="ghost" size="sm" className="rounded-none h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(cert.id)} data-testid={`delete-cert-${cert.id}`}>
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
