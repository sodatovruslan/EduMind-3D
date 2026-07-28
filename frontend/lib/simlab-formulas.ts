/**
 * Зеркало формул backend/app/services/simulation_engine.py для мгновенного
 * отклика 3D-сцены (температура/давление пересчитываются каждый кадр).
 * Авторитетный результат самой реакции (цвет/газ/осадок) всегда приходит
 * с бэкенда через POST /api/simulations/{id}/action — здесь только физика
 * визуализации.
 */
const GAS_CONSTANT_L_ATM = 0.0821; // л·атм/(моль·К)

export function idealGasPressure(moles: number, volumeL: number, temperatureK: number): number {
  if (volumeL <= 0 || temperatureK <= 0) return 0;
  return (moles * GAS_CONSTANT_L_ATM * temperatureK) / volumeL;
}

export function newtonCoolingTemperature(
  initialTempC: number,
  ambientTempC: number,
  elapsedSeconds: number,
  coolingRate = 0.15
): number {
  return ambientTempC + (initialTempC - ambientTempC) * Math.exp(-coolingRate * elapsedSeconds);
}

export function celsiusToKelvin(celsius: number): number {
  return celsius + 273.15;
}
