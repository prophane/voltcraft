import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { Trash2, Plus } from 'lucide-react'

interface Geofence {
  id: number
  name: string
  latitude: number
  longitude: number
  radius: number
  costPerUnit?: number
  billingType?: string
}

export function GeofencesSection() {
  const qc = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', latitude: 0, longitude: 0, radius: 50, costPerUnit: 0 })

  const { data: geofences = [], isLoading } = useQuery({
    queryKey: ['geofences'],
    queryFn: async () => {
      const response = await api.get('/settings/geofences')
      return Array.isArray(response) ? response : []
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/settings/geofences', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['geofences'] })
      setForm({ name: '', latitude: 0, longitude: 0, radius: 50, costPerUnit: 0 })
      setIsCreating(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof form }) => api.patch(`/settings/geofences/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['geofences'] })
      setEditingId(null)
      setForm({ name: '', latitude: 0, longitude: 0, radius: 50, costPerUnit: 0 })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/geofences/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  })

  const handleEdit = (geofence: Geofence) => {
    setEditingId(geofence.id)
    setForm({
      name: geofence.name,
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      radius: geofence.radius,
      costPerUnit: geofence.costPerUnit ?? 0,
    })
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    setForm({ name: '', latitude: 0, longitude: 0, radius: 50, costPerUnit: 0 })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Lieux connus (Geofences)</CardTitle>
        {!isCreating && !editingId && (
          <Button
            size="sm"
            onClick={() => setIsCreating(true)}
            className="gap-2"
          >
            <Plus size={16} />
            Ajouter un lieu
          </Button>
        )}
      </CardHeader>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-text-muted">Chargement...</p>
        ) : geofences.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun lieu configuré</p>
        ) : (
          geofences.map((geofence: Geofence) => (
            editingId === geofence.id ? (
              <div key={geofence.id} className="rounded-lg border border-border-subtle bg-bg-overlay/40 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Nom</label>
                    <input
                      type="text"
                      className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Rayon (m)</label>
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                      value={form.radius}
                      onChange={(e) => setForm({ ...form, radius: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="-90"
                      max="90"
                      className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="-180"
                      max="180"
                      className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-text-secondary block mb-1">Prix kWh (€)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                      value={form.costPerUnit}
                      onChange={(e) => setForm({ ...form, costPerUnit: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={handleCancel}>Annuler</Button>
                  <Button size="sm" loading={updateMutation.isPending} onClick={handleSave}>Sauvegarder</Button>
                </div>
              </div>
            ) : (
              <div key={geofence.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-overlay/40 px-3 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">{geofence.name}</p>
                  <p className="text-xs text-text-muted">
                    {geofence.latitude.toFixed(4)}, {geofence.longitude.toFixed(4)} • rayon: {geofence.radius}m
                    {geofence.costPerUnit ? ` • €${geofence.costPerUnit.toFixed(3)}/kWh` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(geofence)}>Modifier</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-error hover:text-error"
                    loading={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(geofence.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            )
          ))
        )}

        {isCreating && (
          <div className="rounded-lg border border-border-subtle bg-bg-overlay/40 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Nom *</label>
                <input
                  type="text"
                  placeholder="ex: Maison, Bureau..."
                  className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Rayon (m)</label>
                <input
                  type="number"
                  min="10"
                  max="10000"
                  className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                  value={form.radius}
                  onChange={(e) => setForm({ ...form, radius: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Latitude *</label>
                <input
                  type="number"
                  step="0.0001"
                  min="-90"
                  max="90"
                  className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Longitude *</label>
                <input
                  type="number"
                  step="0.0001"
                  min="-180"
                  max="180"
                  className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-text-secondary block mb-1">Prix kWh (€)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className="w-full bg-bg-overlay border border-border rounded px-2 py-1 text-sm text-text-primary"
                  value={form.costPerUnit}
                  onChange={(e) => setForm({ ...form, costPerUnit: parseFloat(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={handleCancel}>Annuler</Button>
              <Button size="sm" loading={createMutation.isPending} onClick={handleSave} disabled={!form.name.trim()}>Ajouter le lieu</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
