import { useReducer } from "react";
import {
  ACTION_ADD_PEER_CONNECTION,
  ACTION_ADD_PEER_MEDIA,
  ACTION_CLEANUP_PEER,
  ACTION_REMOVE_PEER_CONNECTION,
  ERROR_CONNECTION_OBJECT_NOT_PROVIDED,
  ERROR_PEER_CONNECTION_NOT_FOUND,
  ERROR_PEER_ID_MISSING,
  PEER_STATUS_ACTIVE,
  PEER_STATUS_INACTIVE,
  PEER_STATUS_PENDING_MEDIA,
} from "../constants";
import type { Peer } from "../Peer";

export type PeerState = {
  entities: Map<string, Peer>;
};

export function usePeerState(): [
  PeerState,
  React.Dispatch<{ type: string; payload: Peer }>
] {
  function peerReducer(
    state: PeerState,
    action: {
      type: string;
      payload?: {
        id?: string;
        connection?: RTCPeerConnection;
        media?: MediaStream;
        handlers?: Peer["handlers"];
      };
    }
  ): PeerState {
    const itemId = action.payload?.id;
    const item = itemId ? state.entities.get(itemId) : undefined;

    switch (action.type) {
      case ACTION_ADD_PEER_CONNECTION:
        if (!action.payload?.connection) {
          throw new Error(ERROR_CONNECTION_OBJECT_NOT_PROVIDED);
        }
        if (!action.payload?.id) {
          throw new Error(ERROR_PEER_ID_MISSING);
        }
        state.entities.set(action.payload.id, {
          ...action.payload,
          status: PEER_STATUS_PENDING_MEDIA,
        });
        break;
      case ACTION_ADD_PEER_MEDIA:
        if (!item || !itemId) {
          throw new Error(ERROR_PEER_CONNECTION_NOT_FOUND);
        }
        state.entities.set(itemId, {
          ...item,
          media: action.payload?.media,
          status: PEER_STATUS_ACTIVE,
        });
        break;
      case ACTION_REMOVE_PEER_CONNECTION:
        if (!item || !itemId) {
          throw new Error(ERROR_PEER_CONNECTION_NOT_FOUND);
        }
        state.entities.set(itemId, { ...item, status: PEER_STATUS_INACTIVE });
        break;
      case ACTION_CLEANUP_PEER:
        if (itemId) {
          state.entities.delete(itemId);
        }
        break;
      default:
        throw new Error("Action type not found");
    }

    return { ...state, entities: new Map(state.entities) };
  }

  return useReducer(peerReducer, { entities: new Map() });
}
