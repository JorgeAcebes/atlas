export interface ModalityProfileFlags {
  enable_peaks?: boolean | null;
  enable_countries?: boolean | null;
  enable_experiences?: boolean | null;
}

export interface EffectiveModalities {
  canShowPeaks: boolean;
  canShowCountries: boolean;
  canShowExperiences: boolean;
  hasBothModes: boolean;
}

/**
 * Enforces the strict modality hierarchy:
 * - Peaks & Countries default to enabled when unset.
 * - Experiences strictly requires Countries to be enabled.
 */
export function resolveEffectiveModalities(
  profile?: ModalityProfileFlags | null,
  isTargetProfile = false
): EffectiveModalities {
  if (!profile) {
    return {
      canShowPeaks: true,
      canShowCountries: true,
      canShowExperiences: false,
      hasBothModes: true,
    };
  }

  const canShowPeaks = profile.enable_peaks ?? true;
  const canShowCountries = profile.enable_countries ?? true;
  const canShowExperiences = !isTargetProfile && canShowCountries && Boolean(profile.enable_experiences);

  return {
    canShowPeaks,
    canShowCountries,
    canShowExperiences,
    hasBothModes: canShowPeaks && canShowCountries,
  };
}
