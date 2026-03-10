export enum PlayerInputType {
  SELECT_HEX = 'select_hex',
  SELECT_CARD = 'select_card',
  SELECT_PLAYER = 'select_player',
  SELECT_LOCKER = 'select_locker',
  OR_OPTIONS = 'or_options',
  CONFIRM = 'confirm',
}

export type SelectHexInputModel = {
  type: PlayerInputType.SELECT_HEX;
  title: string;
  validHexKeys: ReadonlyArray<string>;
};

export type SelectCardInputModel = {
  type: PlayerInputType.SELECT_CARD;
  title: string;
  validCardNames: ReadonlyArray<string>;
  minCount: number;
  maxCount: number;
};

export type SelectPlayerInputModel = {
  type: PlayerInputType.SELECT_PLAYER;
  title: string;
  validPlayerIds: ReadonlyArray<string>;
};

export type OrOptionsInputModel = {
  type: PlayerInputType.OR_OPTIONS;
  title: string;
  options: ReadonlyArray<string>;
};

export type SelectLockerInputModel = {
  type: PlayerInputType.SELECT_LOCKER;
  title: string;
  lockerIds: ReadonlyArray<string>;
};

export type ConfirmInputModel = {
  type: PlayerInputType.CONFIRM;
  title: string;
};

export type PlayerInputModel =
  | SelectHexInputModel
  | SelectCardInputModel
  | SelectPlayerInputModel
  | SelectLockerInputModel
  | OrOptionsInputModel
  | ConfirmInputModel;
