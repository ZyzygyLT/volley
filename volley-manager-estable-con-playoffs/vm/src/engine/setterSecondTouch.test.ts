import { describe, expect, it } from 'vitest';
import {
  evaluateSetterSecondTouch,
  type SetterSecondTouchSituation,
} from './setterSecondTouch';

const base: SetterSecondTouchSituation = {
  setterRow: 'front',
  takeoffZone: 'front',
  ballZoneAtContact: 'front',
  ballHeightAtContact: 'entirely-above-net',
  ballOrigin: 'other',
  contactInOwnPlayingSpace: true,
};

describe('legalidad del segundo toque ofensivo del colocador', () => {
  it('permite al colocador delantero atacar a cualquier altura', () => {
    expect(evaluateSetterSecondTouch(base)).toEqual({
      legal: true,
      reason: 'front-row-player',
    });
  });

  it('permite al colocador zaguero despegar detrás de la línea de ataque', () => {
    expect(evaluateSetterSecondTouch({
      ...base,
      setterRow: 'backrow',
      takeoffZone: 'back',
    })).toEqual({
      legal: true,
      reason: 'back-row-behind-attack-line',
    });
  });

  it('permite al zaguero en zona de frente si el balón no está completamente sobre la red', () => {
    expect(evaluateSetterSecondTouch({
      ...base,
      setterRow: 'backrow',
      takeoffZone: 'front',
      ballHeightAtContact: 'not-entirely-above-net',
    })).toEqual({
      legal: true,
      reason: 'back-row-front-zone-ball-not-entirely-above-net',
    });
  });

  it('prohíbe al zaguero atacar desde zona de frente con el balón completamente sobre la red', () => {
    expect(evaluateSetterSecondTouch({
      ...base,
      setterRow: 'backrow',
      takeoffZone: 'front',
    })).toEqual({
      legal: false,
      reason: 'back-row-front-zone-ball-above-net',
    });
  });

  it('prohíbe atacar directamente el saque rival alto en zona de frente', () => {
    expect(evaluateSetterSecondTouch({
      ...base,
      ballOrigin: 'opponent-service',
    })).toEqual({
      legal: false,
      reason: 'opponent-service-high-front-zone',
    });
  });

  it('aplica la restricción sobre el saque rival también al colocador zaguero', () => {
    expect(evaluateSetterSecondTouch({
      ...base,
      setterRow: 'backrow',
      takeoffZone: 'back',
      ballOrigin: 'opponent-service',
    })).toEqual({
      legal: false,
      reason: 'opponent-service-high-front-zone',
    });
  });

  it('no aplica la restricción del saque rival si el balón no está en zona de frente', () => {
    expect(evaluateSetterSecondTouch({
      ...base,
      ballOrigin: 'opponent-service',
      ballZoneAtContact: 'back',
    })).toEqual({
      legal: true,
      reason: 'front-row-player',
    });
  });

  it('rechaza un contacto fuera del espacio de juego propio', () => {
    expect(evaluateSetterSecondTouch({
      ...base,
      contactInOwnPlayingSpace: false,
    })).toEqual({
      legal: false,
      reason: 'contact-outside-own-playing-space',
    });
  });
});
