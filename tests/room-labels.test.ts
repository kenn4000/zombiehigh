import { expect } from 'chai';

import { getRoomLabel, normalizeRoomKey } from '../src/game/board/roomLabelUtils';

describe('room labels', () => {
  it('normalizes aliases and strips emoji from display labels', () => {
    expect(normalizeRoomKey('Science Lab')).to.equal('Science Lab');
    expect(normalizeRoomKey('science-lab')).to.equal('Science Lab');
    expect(normalizeRoomKey('Front Desk')).to.equal('Front Desk');
    expect(normalizeRoomKey('lobby')).to.equal('Front Desk');
    expect(normalizeRoomKey('Bathroom')).to.equal('Restroom');
    expect(normalizeRoomKey("Janitor's Closet")).to.equal("Janitor's Closet");
    expect(normalizeRoomKey('🧹 Janitor')).to.equal("Janitor's Closet");

    expect(getRoomLabel('Science Lab')).to.equal('Science Lab');
    expect(getRoomLabel('🧬 Science')).to.equal('Science Lab');
    expect(getRoomLabel('Front Desk')).to.equal('Front Desk');
    expect(getRoomLabel('Bathroom')).to.equal('Restroom');
    expect(getRoomLabel("🧹 Janitor")).to.equal("Janitor's Closet");
    expect(getRoomLabel('Hallway')).to.equal('Hallway');
  });
});
