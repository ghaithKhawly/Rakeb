export type CrowdingTendency = "low" | "medium" | "high";

export type BusRouteDTO = {
  id: number;
  name: string;
  type: "bus" | string;
  avg_speed_kmh: number | null;
  base_price: number | null;
  frequency_minutes: number | null;
  crowding_tendency: CrowdingTendency | null;
  created_at: string | null;
};

export type GetBusesQuery = {
  name?: string;
  crowdingTendency?: CrowdingTendency;
  minSpeedKmh?: number;
  maxSpeedKmh?: number;
  limit?: number;
  offset?: number;
};

export type GetBusQuery = {
  id: number;
};
export type DeleteBusQuery = {
  id: number;
};
