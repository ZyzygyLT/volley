import { describe, expect, it } from 'vitest';
import {
  ATTACK_LINE_DISTANCE_FROM_NET_METERS,
  buildSetterSecondTouchSituation,
  type SetterSecondTouchGeometryInput,
} from './setterSecondTouchGeometry';

const base: SetterSecondTouchGeometryInput = {
  setterRow: 'backrow',
  takeoffPoint: { x: 4.5, depth: 3.01 },
  ballContactPoint: { x: 4.5, depth: 2.5 },
  ballBottomHeightMeters: 2.5,
  netHeightMeters: 2.43,
  ballOrigin: 'other',
  contactInOwnPlayingSpace: true,
};

describe('geometría del segundo toque del colocador', () => {
  it('clasifica el despegue estrictamente detrás de la línea de ataque como zaguero', () => {
    expect(buildSetterSecondTouchSituation(base).takeoffZone).toBe('back');
  });

  it('trata el contacto de despegue sobre la línea como zona de frente', () => {
    const situation = buildSetterSecondTouchSituation({
      ...base,
      takeoffPoint: { x: 4.5, depth: ATTACK_LINE_DISTANCE_FROM_NET_METERS },
    });

    expect(situation.takeoffZone).toBe('front');
  });

  it('clasifica el balón sobre la línea de ataque como zona de frente', () => {
    const situation = buildSetterSecondTouchSituation({
      ...base,
      ballContactPoint: { x: 4.5, depth: ATTACK_LINE_DISTANCE_FROM_NET_METERS },
    });

    expect(situation.ballZoneAtContact).toBe('front');
  });

  it('considera el balón completamente sobre la red solo si su borde inferior la supera', () => {
    expect(buildSetterSecondTouchSituation(base).ballHeightAtContact)
      .toBe('entirely-above-net');
    expect(buildSetterSecondTouchSituation({
      ...base,
      ballBottomHeightMeters: 2.43,
    }).ballHeightAtContact).toBe('not-entirely-above-net');
    expect(buildSetterSecondTouchSituation({
      ...base,
      ballBottomHeightMeters: 2.42,
    }).ballHeightAtContact).toBe('not-entirely-above-net');
  });

  it('usa la altura de red suministrada, no presupone categoría masculina', () => {
    expect(buildSetterSecondTouchSituation({
      ...base,
      netHeightMeters: 2.24,
    }).ballHeightAtContact).toBe('entirely-above-net');
    expect(buildSetterSecondTouchSituation({
      ...base,
      netHeightMeters: 2.24,
      ballBottomHeightMeters: 2.24,
    }).ballHeightAtContact).toBe('not-entirely-above-net');
  });

  it('rechaza coordenadas y alturas no válidas', () => {
    expect(() => buildSetterSecondTouchSituation({
      ...base,
      takeoffPoint: { x: Number.NaN, depth: 4 },
    })).toThrow(RangeError);
    expect(() => buildSetterSecondTouchSituation({
      ...base,
      ballBottomHeightMeters: -0.1,
    })).toThrow(RangeError);
    expect(() => buildSetterSecondTouchSituation({
      ...base,
      netHeightMeters: Number.POSITIVE_INFINITY,
    })).toThrow(RangeError);
  });

  it('preserva explícitamente el dato de espacio de juego propio', () => {
    expect(buildSetterSecondTouchSituation({
      ...base,
      contactInOwnPlayingSpace: false,
    }).contactInOwnPlayingSpace).toBe(false);
  });
});
