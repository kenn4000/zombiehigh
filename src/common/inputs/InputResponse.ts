import { CardName } from '../CardName';
import { PlayerId } from '../Types';

export type SelectHexResponse = {
  type: 'select_hex';
  hex: { q: number; r: number };
};

export type SelectCardResponse = {
  type: 'select_card';
  cardNames: CardName[];
};

export type SelectPlayerResponse = {
  type: 'select_player';
  playerId: PlayerId;
};

export type OrOptionsResponse = {
  type: 'or_options';
  index: number;
};

export type ConfirmResponse = {
  type: 'confirm';
};

export type InputResponse =
  | SelectHexResponse
  | SelectCardResponse
  | SelectPlayerResponse
  | OrOptionsResponse
  | ConfirmResponse;
