import { expect } from 'chai';
import { resolveAssetPath } from '../src/client/assetPaths';

describe('asset path resolution', () => {
  it('uses the served card image folders for hero and locker cards', () => {
    expect(resolveAssetPath('nurse.png', 'hero')).to.equal('/card-art/herocard_assets/anita.jpg');
    expect(resolveAssetPath('charityfund.jpg', 'locker')).to.equal('/card-art/lockercard_assets/charity_fund.jpg');
  });

  it('uses the action-card art folder for generated action images', () => {
    expect(resolveAssetPath('janitor_n_action.jpg', 'action')).to.equal('/card-art/actioncard_assets/janitor_n_action.jpg');
  });

  it('uses the matching discounted game-card art folder and caps the discount at three', () => {
    expect(resolveAssetPath('attendance_sheet.jpg', 'game', 1)).to.equal('/card-art/gamecard_assets_1/attendance_sheet.jpg');
    expect(resolveAssetPath('attendance_sheet.jpg', 'game', 2)).to.equal('/card-art/gamecard_assets_2/attendance_sheet.jpg');
    expect(resolveAssetPath('attendance_sheet.jpg', 'game', 3)).to.equal('/card-art/gamecard_assets_3/attendance_sheet.jpg');
    expect(resolveAssetPath('attendance_sheet.jpg', 'game', 5)).to.equal('/card-art/gamecard_assets_3/attendance_sheet.jpg');
    expect(resolveAssetPath('nurse.png', 'hero', 3)).to.equal('/card-art/herocard_assets/anita.jpg');
  });
});
