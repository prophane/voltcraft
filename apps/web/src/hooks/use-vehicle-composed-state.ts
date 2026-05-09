import { useMemo } from 'react'
import { getVehicleComposedState, VEHICLE_STATE_LABELS, VEHICLE_STATE_TONES, type VehicleStateInput, type VehicleComposedState } from '@/lib/vehicle-state'

export interface UseVehicleStateResult {
  composedState: VehicleComposedState
  label: string
  tone: string
  isMoving: boolean
  isCharging: boolean
  isPlugged: boolean
  isParked: boolean
  isOnline: boolean
}

/**
 * Hook to derive and access composed vehicle state with FR labels and styling
 */
export function useVehicleComposedState(input: VehicleStateInput | undefined | null): UseVehicleStateResult {
  return useMemo(() => {
    const safeInput: VehicleStateInput = input ?? {}

    const composedState = getVehicleComposedState(safeInput)
    const label = VEHICLE_STATE_LABELS[composedState]
    const tone = VEHICLE_STATE_TONES[composedState]

    return {
      composedState,
      label,
      tone,
      isMoving: composedState === 'driving',
      isCharging: composedState === 'charging',
      isPlugged: composedState === 'plugged',
      isParked: composedState === 'parked',
      isOnline: composedState === 'online',
    }
  }, [input?.isDriving, input?.isCharging, input?.isPluggedIn, input?.vehicleState])
}
