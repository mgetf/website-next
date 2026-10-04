export type PlacementPlayer = {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
};

export type PlacementEntry = {
  id: number;
  name: string;
  acronym: string | null;
  avatar: string | null;
  status: string;
  divisionId: number;
  players: PlacementPlayer[];
};

export type PlacementDivision = {
  id: number;
  name: string;
  signupCost: number;
};

export type PlacementColumn = PlacementDivision & {
  items: PlacementEntry[];
};

export type PlacementPaymentEffect = 'none' | 'reset-unpaid' | 'mark-exempt';

export type PlacementAssignment = {
  teamId: number;
  divisionId: number;
};

export type PlacementMove = {
  teamId: number;
  teamName: string;
  fromDivisionId: number;
  fromDivisionName: string;
  toDivisionId: number;
  toDivisionName: string;
  effect: PlacementPaymentEffect;
  status: string;
};

export type PlacementTeamContext = {
  id: number;
  name: string;
  seasonId: number | null;
  regionId: number | null;
  formatId: number;
  divisionId: number | null;
  status: string;
};

export type PlacementDivisionContext = {
  id: number;
  regionId: number;
  formatId: number;
  hidden: number;
};
