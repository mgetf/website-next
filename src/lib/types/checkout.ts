export interface CheckoutUnpaidPlayer {
  steamId: string;
  name: string;
  avatar: string | null;
  signupCost: number;
  leagueFees: number;
  totalCost: number;
}

export interface CheckoutItemPaymentConfig {
  itemName: string;
  itemQuantity: number;
  itemAppId: number;
}

export interface CheckoutParticipation {
  teamId: number;
  teamName: string;
  teamAvatar: string | null;
  formatName: string;
  formatId: number;
  divisionName: string;
  divisionId: number;
  regionName: string | null;
  seasonNum: number | null;
  seasonId: number;
  signupCost: number;
  currency: string;
  currencySymbol: string;
  unpaidPlayers: CheckoutUnpaidPlayer[];
  itemPaymentConfig: CheckoutItemPaymentConfig | null;
}

export interface CheckoutPendingItemOrder {
  orderNumber: string;
  itemName: string;
  itemsRequired: number;
  expiresAt: string;
}

/** Wire shape sent from checkout UI to PayPal/item API routes. */
export interface CheckoutTeamSelection {
  teamId: number;
  paidForSteamIds: string[];
}
