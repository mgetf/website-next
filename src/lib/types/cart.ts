import type { CheckoutItemPaymentConfig } from './checkout.js';

export interface CartLineView {
  id: number;
  teamId: number;
  teamName: string;
  teamAvatar: string | null;
  playerSteamId: string;
  playerName: string;
  playerAvatar: string | null;
  formatName: string;
  formatThemeKey: string;
  formatIconUrl: string | null;
  isIndividual: boolean;
  divisionName: string;
  regionName: string | null;
  seasonNum: number | null;
  seasonId: number;
  signupCost: number;
  leagueFees: number;
  totalCost: number;
  currency: string;
  currencySymbol: string;
  itemPaymentConfig: CheckoutItemPaymentConfig | null;
  reservedByOther: boolean;
}

export interface QuotedParticipation {
  teamId: number;
  playerSteamId: string;
  playerName: string;
  playerAvatar: string | null;
  teamName: string;
  teamAvatar: string | null;
  formatName: string;
  formatThemeKey: string;
  formatIconUrl: string | null;
  isIndividual: boolean;
  divisionName: string;
  regionName: string | null;
  seasonNum: number | null;
  seasonId: number;
  signupCost: number;
  leagueFees: number;
  totalCost: number;
  currency: string;
  currencySymbol: string;
  itemPaymentConfig: CheckoutItemPaymentConfig | null;
  itemOrderNumber?: string;
}
