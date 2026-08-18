import { useEffect, useRef, useState } from 'react'
import { Download, RotateCcw, DatabaseBackup, Save, History, Upload } from 'lucide-react'
import Modal from '../../components/Modal'
import ConfirmDialog from '../../components/ConfirmDialog'
import platformApi from '../../services/platformApi'
import { usePlatformStore } from '../../store/platformStore'
import { toast } from '../../components/Toast'
import type { PlatformTenant, PlatformBackup, PlatformPlan, PlatformSubscription, PlatformAuditEntry, SubscriptionStatus } from '../../types/platform'

interface Props {
  tenant: PlatformTenant | null
  plans: PlatformPlan[]
  onClose: () => void
  onChanged: () => void
}

function formatMoney(value: string | number | null | undefined, currency = 'FCFA'): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  if (isNaN(num)) return `0 ${currency}`
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + currency
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 Ko'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} Ko`
  return `${(kb / 1024).toFixed(1)} Mo`
}

const subStatusLabels: Record<SubscriptionStatus, string> = {
  trialing: 'Essai',
  active: 'Actif',
  past_due: 'Impayé',
  canceled: 'Annulé',
}

const subStatusColors: Record<SubscriptionStatus, string> = {
  trialing: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-gray-200 text-gray-600',
}

export default function TenantDetailModal({ tenant, plans, onClose, onChanged }: Props) {
  const [backups, setBackups] = useState<PlatformBackup[]>([])
  const [auditLog, setAuditLog] = useState<PlatformAuditEntry[]>([])
  const [subscription, setSubscription] = useState<PlatformSubscription | null>(null)
  const [subForm, setSubForm] = useState({ plan_id: '', status: 'trialing' as SubscriptionStatus, amount_monthly: '0', currency: 'FCFA', current_period_end: '' })
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [savingSub, setSavingSub] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<PlatformBackup | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadingRestore, setUploadingRestore] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!tenant) return
    try {
      const [backupsRes, auditRes, subRes] = await Promise.all([
        platformApi.get(`/tenants/${tenant.id}/backups`),
        platformApi.get(`/tenants/${tenant.id}/audit-log`),
        platformApi.get(`/tenants/${tenant.id}/subscription`),
      ])
      setBackups(backupsRes.data)
      setAuditLog(auditRes.data)
      setSubscription(subRes.data)
      if (subRes.data) {
        setSubForm({
          plan_id: subRes.data.plan_id || '',
          status: subRes.data.status,
          amount_monthly: subRes.data.amount_monthly,
          currency: subRes.data.currency,
          current_period_end: subRes.data.current_period_end ? subRes.data.current_period_end.slice(0, 10) : '',
        })
      }
    } catch {
      toast.error('Erreur lors du chargement des détails du tenant')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  if (!tenant) return null

  const triggerBackup = async () => {
    setLoadingBackup(true)
    try {
      await platformApi.post(`/tenants/${tenant.id}/backup`)
      toast.success('Sauvegarde lancée avec succès')
      load()
      onChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la sauvegarde')
    } finally {
      setLoadingBackup(false)
    }
  }

  const downloadBackup = (backup: PlatformBackup) => {
    const authToken = usePlatformStore.getState().token || ''
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    fetch(`${API_URL}/api/platform/backups/${backup.id}/download`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = backup.filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 200)
      })
      .catch(() => toast.error('Échec du téléchargement'))
  }

  const confirmRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await platformApi.post(`/tenants/${tenant.id}/backups/${restoreTarget.id}/restore`)
      toast.success('Restauration effectuée avec succès')
      load()
      onChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la restauration')
    } finally {
      setRestoring(false)
      setRestoreTarget(null)
    }
  }

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setUploadFile(file)
    e.target.value = ''
  }

  const confirmUploadRestore = async () => {
    if (!uploadFile) return
    setUploadingRestore(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      await platformApi.post(`/tenants/${tenant.id}/restore-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Restauration depuis le fichier effectuée avec succès')
      load()
      onChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la restauration depuis le fichier')
    } finally {
      setUploadingRestore(false)
      setUploadFile(null)
    }
  }

  const saveSubscription = async () => {
    setSavingSub(true)
    try {
      await platformApi.post(`/tenants/${tenant.id}/subscription`, {
        plan_id: subForm.plan_id || null,
        status: subForm.status,
        amount_monthly: parseFloat(subForm.amount_monthly) || 0,
        currency: subForm.currency,
        current_period_end: subForm.current_period_end || null,
      })
      toast.success('Abonnement mis à jour')
      load()
      onChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la mise à jour')
    } finally {
      setSavingSub(false)
    }
  }

  const onPlanChange = (planId: string) => {
    const plan = plans.find((p) => p.id === planId)
    setSubForm((f) => ({
      ...f,
      plan_id: planId,
      amount_monthly: plan ? plan.price_monthly : f.amount_monthly,
      currency: plan ? plan.currency : f.currency,
    }))
  }

  return (
    <>
      <Modal isOpen={!!tenant} onClose={onClose} title={`${tenant.name} — Détails`} size="2xl">
        <div className="space-y-6">
          {/* Header info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Slug : <span className="font-mono">{tenant.slug}</span></p>
              <p className="text-sm text-gray-500">Base : <span className="font-mono">{tenant.db_name}</span></p>
            </div>
            <span className={`badge ${tenant.status === 'active' ? 'bg-green-100 text-green-700' : tenant.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
              {tenant.status}
            </span>
          </div>

          {/* Subscription */}
          <div className="border border-gray-200 rounded-xl p-4">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              Abonnement
              {subscription && (
                <span className={`badge ${subStatusColors[subscription.status]}`}>{subStatusLabels[subscription.status]}</span>
              )}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Plan</label>
                <select
                  value={subForm.plan_id}
                  onChange={(e) => onPlanChange(e.target.value)}
                  className="input"
                >
                  <option value="">Aucun plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.price_monthly, p.currency)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Statut</label>
                <select
                  value={subForm.status}
                  onChange={(e) => setSubForm((f) => ({ ...f, status: e.target.value as SubscriptionStatus }))}
                  className="input"
                >
                  <option value="trialing">Essai</option>
                  <option value="active">Actif</option>
                  <option value="past_due">Impayé</option>
                  <option value="canceled">Annulé</option>
                </select>
              </div>
              <div>
                <label className="label">Montant mensuel</label>
                <input
                  type="number"
                  value={subForm.amount_monthly}
                  onChange={(e) => setSubForm((f) => ({ ...f, amount_monthly: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Devise</label>
                <input
                  value={subForm.currency}
                  onChange={(e) => setSubForm((f) => ({ ...f, currency: e.target.value }))}
                  className="input"
                />
              </div>
              <div className="col-span-2">
                <label className="label">Fin de période en cours</label>
                <input
                  type="date"
                  value={subForm.current_period_end}
                  onChange={(e) => setSubForm((f) => ({ ...f, current_period_end: e.target.value }))}
                  className="input"
                />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={saveSubscription} disabled={savingSub} className="btn-primary py-2">
                <Save size={14} />
                {savingSub ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>

          {/* Backups */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-800">Sauvegardes</h4>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".dump,.backup,.tar,.sql"
                  className="hidden"
                  onChange={onFileSelected}
                />
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary py-1.5 text-sm">
                  <Upload size={14} />
                  Restaurer depuis un fichier
                </button>
                <button onClick={triggerBackup} disabled={loadingBackup} className="btn-secondary py-1.5 text-sm">
                  <DatabaseBackup size={14} />
                  {loadingBackup ? 'Sauvegarde…' : 'Forcer un backup'}
                </button>
              </div>
            </div>
            {backups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune sauvegarde pour ce tenant</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{formatDateTime(b.created_at)}</p>
                      <p className="text-xs text-gray-400">
                        {formatBytes(b.size_bytes)} · {b.triggered_by} ·{' '}
                        <span className={b.status === 'completed' ? 'text-green-600' : 'text-red-500'}>
                          {b.status === 'completed' ? 'OK' : 'Échec'}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => downloadBackup(b)}
                        disabled={b.status !== 'completed'}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Télécharger (export) cette sauvegarde"
                      >
                        <Download size={14} />
                        Exporter
                      </button>
                      <button
                        onClick={() => setRestoreTarget(b)}
                        disabled={b.status !== 'completed'}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Restaurer cette sauvegarde sur ce tenant"
                      >
                        <RotateCcw size={14} />
                        Restaurer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit log */}
          <div className="border border-gray-200 rounded-xl p-4">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <History size={16} />
              Historique
            </h4>
            {auditLog.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">Aucune action enregistrée</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
                {auditLog.map((a) => (
                  <div key={a.id} className="flex justify-between py-1">
                    <span className="text-gray-700">{a.action}{a.details ? ` — ${a.details}` : ''}</span>
                    <span className="text-gray-400 text-xs shrink-0 ml-2">{formatDateTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={confirmRestore}
        title="Restaurer cette sauvegarde"
        message={`Cette action va remplacer toutes les données actuelles de "${tenant.name}" par celles de la sauvegarde du ${restoreTarget ? formatDateTime(restoreTarget.created_at) : ''}. Une sauvegarde de sécurité sera prise automatiquement avant la restauration. Continuer ?`}
        confirmLabel={restoring ? 'Restauration…' : 'Restaurer'}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!uploadFile}
        onClose={() => setUploadFile(null)}
        onConfirm={confirmUploadRestore}
        title="Restaurer depuis un fichier"
        message={`Cette action va remplacer toutes les données actuelles de "${tenant.name}" par le contenu du fichier "${uploadFile?.name}". Le fichier doit être un dump PostgreSQL au format personnalisé (pg_dump -Fc). Une sauvegarde de sécurité sera prise automatiquement avant la restauration. Continuer ?`}
        confirmLabel={uploadingRestore ? 'Restauration…' : 'Restaurer ce fichier'}
        variant="danger"
      />
    </>
  )
}
