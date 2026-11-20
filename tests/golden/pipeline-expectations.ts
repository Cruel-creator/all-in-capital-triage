// Section 10 goldens at the gate/bucket level. Flags and buckets are hard requirements; actions are "should reach".
export type PipelineExpectation = {
  app: string;
  mustTrip: ("G1" | "G2" | "G3" | "G4")[];
  mustNotTrip?: ("G1" | "G2" | "G3" | "G4")[];
  conflictWith?: string;
  bucket?: ("clear" | "flagged" | "outside_mandate")[];
  shouldReach: ("take_call" | "dig" | "pass")[];
  aditya?: boolean;
};

export const PIPELINE_EXPECTATIONS: PipelineExpectation[] = [
  { app: "Pumpwise", mustTrip: [], mustNotTrip: ["G1", "G2", "G4"], shouldReach: ["take_call"], aditya: true },
  { app: "GrainKind", mustTrip: [], mustNotTrip: ["G1", "G2"], shouldReach: ["take_call"] },
  { app: "Talkbook", mustTrip: ["G3"], conflictWith: "MeetRecord", bucket: ["flagged"], shouldReach: ["dig", "take_call", "pass"] },
  { app: "CAPilot", mustTrip: [], mustNotTrip: ["G1"], shouldReach: ["dig"] },
  { app: "StockSathi", mustTrip: ["G4", "G3"], conflictWith: "SuperK", bucket: ["flagged"], shouldReach: ["dig", "pass"] },
  { app: "CareCorner", mustTrip: [], mustNotTrip: ["G1"], bucket: ["flagged"], shouldReach: ["dig", "pass"] },
  { app: "Yatrika", mustTrip: [], mustNotTrip: ["G1"], shouldReach: ["dig", "pass"] },
  { app: "RentRoute", mustTrip: ["G2"], shouldReach: ["pass"] },
  { app: "EarnWise", mustTrip: ["G4"], shouldReach: ["pass"] },
  { app: "Settlr", mustTrip: ["G1"], bucket: ["outside_mandate"], shouldReach: ["pass", "dig"] },
];
