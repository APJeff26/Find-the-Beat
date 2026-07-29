export type TeamId = "team1" | "team2";

export interface Team {
  id: TeamId;
  name: string;
  total: number;
}

export interface TeamTurn {
  teamId: TeamId;
  teamName: string;
  accuracy: number;
  consistency: number;
  points: number;
}

export interface TeamGame {
  teams: Record<TeamId, Team>;
  activeTeamId: TeamId;
  turns: readonly TeamTurn[];
}

const cleanName = (name: string, fallback: string) =>
  name.trim().slice(0, 20) || fallback;

export function createTeamGame(team1Name: string, team2Name: string): TeamGame {
  return {
    teams: {
      team1: { id: "team1", name: cleanName(team1Name, "Team 1"), total: 0 },
      team2: { id: "team2", name: cleanName(team2Name, "Team 2"), total: 0 },
    },
    activeTeamId: "team1",
    turns: [],
  };
}

export const otherTeamId = (teamId: TeamId): TeamId =>
  teamId === "team1" ? "team2" : "team1";

/** Points are a simple 0–100 average of the existing two score dimensions. */
export const calculateTurnPoints = (accuracy: number, consistency: number) =>
  Math.round((accuracy + consistency) / 2);

export function selectTeam(game: TeamGame, teamId: TeamId): TeamGame {
  return { ...game, activeTeamId: teamId };
}

export function switchTeam(game: TeamGame): TeamGame {
  return selectTeam(game, otherTeamId(game.activeTeamId));
}

export function addTurnScore(
  game: TeamGame,
  accuracy: number,
  consistency: number,
): TeamGame {
  const activeTeam = game.teams[game.activeTeamId];
  const points = calculateTurnPoints(accuracy, consistency);
  const turn: TeamTurn = {
    teamId: activeTeam.id,
    teamName: activeTeam.name,
    accuracy,
    consistency,
    points,
  };
  return {
    ...game,
    teams: {
      ...game.teams,
      [activeTeam.id]: { ...activeTeam, total: activeTeam.total + points },
    },
    turns: [...game.turns, turn],
  };
}

export function undoLastScore(game: TeamGame): TeamGame {
  const lastTurn = game.turns.at(-1);
  if (!lastTurn) return game;
  const team = game.teams[lastTurn.teamId];
  return {
    ...game,
    teams: {
      ...game.teams,
      [lastTurn.teamId]: {
        ...team,
        total: Math.max(0, team.total - lastTurn.points),
      },
    },
    activeTeamId: lastTurn.teamId,
    turns: game.turns.slice(0, -1),
  };
}

export function getWinner(game: TeamGame): TeamId | "tie" {
  const team1Total = game.teams.team1.total;
  const team2Total = game.teams.team2.total;
  if (team1Total === team2Total) return "tie";
  return team1Total > team2Total ? "team1" : "team2";
}
