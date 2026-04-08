export type SupportedLanguage = "ar" | "en" | "mixed";

export type NaturalIntentType = "trip_planning" | "route_info" | "general_question" | "unclear";

export type TripIntentParseResult = {
  origin_id: string | null;
  destination_id: string | null;
  ambiguous: boolean;
  clarification_question: string | null;
  intent: NaturalIntentType;
  origin_candidates: string[];
  destination_candidates: string[];
  unknown_locations: string[];
  route_info_query: { route_name: string } | null;
  detected_language: SupportedLanguage;
};

export type ClarificationType =
  | "AWAITING_ORIGIN"
  | "AWAITING_DESTINATION"
  | "AWAITING_BOTH"
  | "AWAITING_DISAMBIGUATION";

export type NlpConversationRow = {
  conversation_id: string;
  trace_id: string;
  user_id: number | null;
  partial_origin_id: string | null;
  partial_destination_id: string | null;
  last_known_destination_id: string | null;
  clarification_type: ClarificationType | null;
  disambiguation_candidates: string[];
  expires_at: string;
};

export type NaturalActionResponse =
  | {
      action: "not_a_trip_request";
      message: string;
      traceId: string;
    }
  | {
      action: "show_map_picker";
      reason: string;
      message?: string;
      traceId: string;
    }
  | {
      action: "ask_clarification";
      question: string;
      conversation_id: string;
      traceId: string;
    }
  | {
      action: "show_route_info";
      traceId: string;
      data: {
        routeId: number;
        routeName: string;
        stops: Array<{
          sequence: number;
          lat: number;
          lng: number;
          label: string;
        }>;
      } | null;
    }
  | {
      action: "preview_points";
      traceId: string;
      conversation_id?: string;
      from: {
        lat: number;
        lng: number;
        label: string;
        landmark_id: string;
      };
      to: {
        lat: number;
        lng: number;
        label: string;
        landmark_id: string;
      };
    }
  | {
      action: "route_result";
      traceId: string;
      route: unknown;
      explanation: string;
    };
