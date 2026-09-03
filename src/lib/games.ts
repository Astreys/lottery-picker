/**
 * Game definitions. Everything the app knows about a lottery lives here —
 * adding a new game is a matter of appending one entry.
 */
export type GameId = 'lotto-max' | 'lotto-649' | 'daily-grand' | 'lottario' | 'ontario-49' | 'bc-49';

export interface Game {
	id: GameId;
	name: string;
	/** Path segment on lotto-8.com, e.g. listltoCAMAX.asp */
	source: string;
	/** How many main numbers are drawn */
	pick: number;
	/** Main numbers run 1..max */
	max: number;
	/** Label for the extra ball column, if the game has one */
	bonusLabel: string | null;
	/** The bonus ball is drawn from its own pool in some games (Daily Grand) */
	bonusMax: number | null;
	/** Roughly how many draws happen per week — used to phrase the window slider */
	drawsPerWeek: number;
}

export const GAMES: Game[] = [
	{
		id: 'lotto-max',
		name: 'Lotto Max',
		source: 'listltoCAMAX.asp',
		pick: 7,
		max: 52,
		bonusLabel: 'Bonus',
		bonusMax: null,
		drawsPerWeek: 2
	},
	{
		id: 'lotto-649',
		name: 'Lotto 6/49',
		source: 'listltoCA649.asp',
		pick: 6,
		max: 49,
		bonusLabel: 'Bonus',
		bonusMax: null,
		drawsPerWeek: 2
	},
	{
		id: 'daily-grand',
		name: 'Daily Grand',
		source: 'listltoCADG.asp',
		pick: 5,
		max: 49,
		bonusLabel: 'Grand Number',
		bonusMax: 7,
		drawsPerWeek: 2
	},
	{
		id: 'lottario',
		name: 'Lottario',
		source: 'listltoCALO45.asp',
		pick: 6,
		max: 45,
		bonusLabel: 'Bonus',
		bonusMax: null,
		drawsPerWeek: 1
	},
	{
		id: 'ontario-49',
		name: 'Ontario 49',
		source: 'listltoCAON49.asp',
		pick: 6,
		max: 49,
		bonusLabel: 'Bonus',
		bonusMax: null,
		drawsPerWeek: 2
	},
	{
		id: 'bc-49',
		name: 'BC/49',
		source: 'listltoCABC49.asp',
		pick: 6,
		max: 49,
		bonusLabel: 'Bonus',
		bonusMax: null,
		drawsPerWeek: 2
	}
];

export const byId = (id: string): Game | undefined => GAMES.find((g) => g.id === id);
