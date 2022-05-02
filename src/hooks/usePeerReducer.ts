import { useReducer, Dispatch } from "react";
import { Peer } from "../Peer";

type State = Record<string, Peer>;
type Action = {
  type: "add" | "update" | "remove";
  payload: Peer;
};

function peerReducer(state: State, action: Action) {
  switch (action.type) {
    case "add":
      return {
        ...state,
        [action.payload.id as string]: action.payload,
      };
    case "update":
      return {
        ...state,
        [action.payload.id as string]: {
          ...state[action.payload.id as string],
          ...action.payload,
        },
      };
    case "remove":
      const updated = { ...state };
      delete updated[action.payload.id as string];
      return updated;
    default:
      return state;
  }
}

export const usePeerReducer = (
  initialState: State
): [State, Dispatch<Action>] => useReducer(peerReducer, initialState);
