/** One in-game item option shown next to a region's money fee. */
export type SignupFeeItem = {
  name: string;
  quantityLabel: string;
  iconUrl: string | null;
};

/** One open-signup region's configured fee for a format. */
export type SignupFeeRegion = {
  regionId: number;
  name: string;
  abbr: string;
  flagCode: string;
  kind: 'free' | 'paid';
  moneyLabel: string | null;
  itemLabel: string | null;
  items: SignupFeeItem[];
};

/** Per-region fees for hub cards and signup forms. */
export type SignupFeeSummary = {
  regions: SignupFeeRegion[];
};
