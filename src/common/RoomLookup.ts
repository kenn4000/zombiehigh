/**
 * Shared room-assignment lookup used by both the server (card playability,
 * player model) and the client (map overlay).
 * Rows A-J = r 0-9; columns 1-11 = q 0-10.
 */
export const TILE_TO_ROOM: Map<string, string> = (() => {
    const m = new Map<string, string>();
    const assign = (room: string, tiles: [number, number][]) => {
        for (const [q, r] of tiles) m.set(`${q},${r}`, room);
    };

    assign('science-lab', [[2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2]]);
    assign('cafeteria', [[7, 0], [8, 0], [9, 0], [7, 1], [8, 1], [9, 1], [10, 1], [7, 2], [10, 2]]);
    assign('auditorium', [[9, 3], [10, 3], [9, 4], [10, 4], [9, 5], [10, 5]]);
    assign('library', [[7, 8], [8, 8], [9, 8], [10, 8], [7, 9], [8, 9], [9, 9]]);
    assign('lobby', [[4, 8], [5, 8], [6, 8], [4, 9], [5, 9], [6, 9]]);
    assign('principals-office', [[0, 8], [1, 8], [2, 8], [3, 8], [1, 9], [2, 9]]);
    assign('janitors-closet', [[0, 6], [1, 6], [0, 7], [1, 7]]);
    assign('restrooms', [[0, 4], [1, 4], [0, 5], [1, 5]]);
    assign('tunnel', [[0, 3], [4, 0], [5, 0], [6, 0], [10, 6], [10, 7]]);
    assign('gymnasium', [
        [3, 3], [4, 3], [6, 3], [7, 3],
        [3, 4], [4, 4], [5, 4], [6, 4],
        [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5],
        [2, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
        [4, 7], [5, 7], [7, 7], [8, 7],
    ]);

    return m;
})();

/** Returns the room id for a tile. Falls back to 'gymnasium' for unlabelled interior tiles. */
export function getTileRoom(q: number, r: number): string {
    return TILE_TO_ROOM.get(`${q},${r}`) ?? 'gymnasium';
}
