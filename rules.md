# RULES.md: Technical Logic Requirements

## 1. Core Data Structures

* **Hex System:** Use axial coordinates `(q, r)`. The board is a fixed set of 37 tiles (Radius 3). Each tile must have a unique `tileID` (0-36) used for tie-breaking and spawning.
* **Player State:** Track `Gold`, `SurvivalPoints (SP)`, `HeroPoints`, `VillainPoints`, `GoldProduction`, `Health (HP)`, `BarricadeFailRate`, `TrapSuccessRate`, and location (current HexCoordinate). Max HP = 3.
* **Structures:** * `Trap`: Owner, HexCoordinate. Limit: 2 per player.
* `Barricade`: Owner, Edge (between two Hexes). Limit: 5 per player.
* `Bait`: Owner, HexCoordinate. Limit: 1 per player. Removed at end of Night.



## 2. The "Night" (Round) Lifecycle

One **Night** consists of two distinct phases:

1. **Action Phase:** Players take turns (a turn consists of 1,2, or 3 Actions. If only 1 action is taken, the Player "passes" for the night and does not get another turn until the next Night begins).
2. **Zombie Phase:** Automated logic for movement, combat, and spawning.

## 3. Movement & Collision Logic

* **Player Move:** Costs 3 Gold. Cannot enter hex with Zombie, Player, Trap, or Bait. Can move through Barricades for additional 2 Gold (1 Gold is refunded to Barricade owner).
* **Zombie Movement (Step 1):**
* **Bait Pull:** If Bait is within 3 hexes, set target tile toward closest Bait. Tie-breaker: Bait on lowest `tileID`.
* **Random Move:** If No Bait within 3 hexes or not taking first step, set target tile in a random direction (using `ZombieMovementCard` logic).
* **Speed:** Nights 1-3 (1 step), 4-6 (2 steps), 7-9 (3 steps), 10+ (4 steps).


* **Conflict Resolution (Step 2):**
* **Barricade Hit:** Roll d6. 4+ = Barricade stays, Zombie stops, owner gains 1 HeroPoint. 1-3 = Barricade removed, Zombie moves in, owner gains 1 SP.
* **Trap Step:** Roll d6. 3+ = Zombie and Trap removed, owner gains 3 SP. 1-2 = Only Trap removed.
* **Player Contact:** Player loses 1 HP. If HP > 0, break to `EscapeMode` where Player gets a free move to an adjacent vacant hex. If no vacant hex or 0 HP, Player is eliminated.



## 4. Spawning Logic (Step 3)

1. Calculate `TotalSP = sum(all players SP)`.
2. `SpawnCount = floor(TotalSP / 15)`.
3. **Placement:** Iterate through `tileID` 0 to 36. Place one zombie in the first available "Open" hex (no Zombie, Player, Trap, or Bait). Repeat until `SpawnCount` is reached.

## 5. Income & Scoring (Step 4)

* **Gold Income:** `Current SP` + `GoldProduction`.
* **Villain Points:** +1 VillainPoint per Trap within 2 hexes of another player's unit at the end of each Night.
* **Final Score:** `max(SP + HeroPoints, SP + VillainPoints)`.

---
