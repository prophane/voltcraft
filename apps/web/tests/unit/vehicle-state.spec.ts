import { describe, expect, it } from 'vitest'
import { getVehicleComposedState, VEHICLE_STATES } from '../../src/lib/vehicle-state'

describe('getVehicleComposedState', () => {
  it('reports plugged when the vehicle is stationary, plugged, and not charging', () => {
    expect(
      getVehicleComposedState({
        isDriving: false,
        isCharging: false,
        isPluggedIn: true,
      }),
    ).toBe(VEHICLE_STATES.PLUGGED)
  })

  it('reports parked when the vehicle is stationary and not plugged', () => {
    expect(
      getVehicleComposedState({
        isDriving: false,
        isCharging: false,
        isPluggedIn: false,
      }),
    ).toBe(VEHICLE_STATES.PARKED)
  })
})