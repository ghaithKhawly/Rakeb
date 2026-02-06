export type LocationDTO = {
  lat: number;
  lng: number;
  label?: string;
};
export type Stop = {
  id: string;
  lat: number;
  lng: number;
};

export type BusEdge = {
  fromStopId: string;
  toStopId: string;
  busNumber: string;
};

export type Instruction ={
  type:'walk'|'bus';
  bus? : string;
  from: LocationDTO;
  to : LocationDTO
}