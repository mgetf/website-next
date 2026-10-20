export interface CheckoutItemPaymentConfig {
  itemName: string;
  itemQuantity: number;
  itemAppId: number;
}

/** Wire shape sent from checkout UI to PayPal/item API routes. */
export interface CheckoutTeamSelection {
  teamId: number;
  paidForSteamIds: string[];
}
