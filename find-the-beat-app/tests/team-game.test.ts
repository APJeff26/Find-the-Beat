import assert from "node:assert/strict";
import test from "node:test";
import {
  addTurnScore,
  calculateTurnPoints,
  createTeamGame,
  getWinner,
  switchTeam,
  undoLastScore,
} from "../modules/team/team-game.ts";

test("creates two named teams with zero totals", () => {
  const game = createTeamGame("Rhythm Rockets", "Beat Bears");
  assert.equal(game.teams.team1.name, "Rhythm Rockets");
  assert.equal(game.teams.team2.name, "Beat Bears");
  assert.equal(game.teams.team1.total, 0);
});

test("calculates points from accuracy and consistency", () => {
  assert.equal(calculateTurnPoints(80, 70), 75);
  assert.equal(calculateTurnPoints(81, 70), 76);
});

test("adds a score only to the active team", () => {
  const game = addTurnScore(createTeamGame("Red", "Blue"), 90, 70);
  assert.equal(game.teams.team1.total, 80);
  assert.equal(game.teams.team2.total, 0);
  assert.equal(game.turns.length, 1);
});

test("switches the active team", () => {
  const game = switchTeam(createTeamGame("Red", "Blue"));
  assert.equal(game.activeTeamId, "team2");
});

test("undo restores the previous total and active team", () => {
  let game = createTeamGame("Red", "Blue");
  game = switchTeam(game);
  game = addTurnScore(game, 90, 90);
  game = switchTeam(game);
  game = undoLastScore(game);
  assert.equal(game.teams.team2.total, 0);
  assert.equal(game.activeTeamId, "team2");
  assert.equal(game.turns.length, 0);
});

test("supports a tie and either winner", () => {
  assert.equal(getWinner(createTeamGame("Red", "Blue")), "tie");
  const team1Wins = addTurnScore(createTeamGame("Red", "Blue"), 100, 100);
  assert.equal(getWinner(team1Wins), "team1");
  const team2Wins = addTurnScore(switchTeam(createTeamGame("Red", "Blue")), 100, 100);
  assert.equal(getWinner(team2Wins), "team2");
});
