import {
	type APIChatInputApplicationCommandInteractionData,
	type APIInteraction,
	InteractionResponseType,
	InteractionType,
} from 'discord-api-types/v10';
import {verifyKey} from 'discord-interactions';

// biome-ignore lint/suspicious/noExplicitAny: this is fine
type $TsFixMe = any;

type Env = {
	DISCORD_TOKEN: string;
	DISCORD_PUBLIC_KEY: string;
	DISCORD_APPLICATION_ID: string;
	DISCORD_GUILD_ID: string;
	DISCORD_CHANNEL_ID: string;
	DISCORD_ROLE_ID: string;
	DB: D1Database;
};

type Birthday = {
	user_id: string;
	birthday_month: number;
	birthday_day: number;
	active: number;
};

export default {
	async fetch(request, env, _ctx) {
		if (request.method !== 'POST') {
			return new Response(null, {status: 405});
		}

		const signature = request.headers.get('x-signature-ed25519');
		const timestamp = request.headers.get('x-signature-timestamp');
		if (!signature || !timestamp) {
			return new Response(null, {status: 401});
		}

		const body = await request.clone().arrayBuffer();
		const isValidRequest = verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
		if (!isValidRequest) {
			return new Response(null, {status: 401});
		}

		const interaction = await request.json<APIInteraction>();
		if (interaction.type === InteractionType.Ping) {
			return jsonResponse({type: InteractionType.Ping});
		}

		if (interaction.type === InteractionType.ApplicationCommand) {
			const commandData = interaction.data as APIChatInputApplicationCommandInteractionData;
			if (!interaction.member) {
				return new Response(null, {status: 403});
			}
			switch (commandData.name) {
				case 'ping': {
					const timestamp = new Date(Number(interaction.id) / 4194304 + 1420070400000);
					const responseTime = Date.now() - timestamp.getTime();
					return jsonResponse({
						type: InteractionResponseType.ChannelMessageWithSource,
						data: {content: `Pong! Took ${responseTime}ms`, flags: 64},
					});
				}
				case 'birthday': {
					return handleBirthdayCommand(commandData, interaction.member.user.id, env);
				}
				default: {
					return new Response(null, {status: 400});
				}
			}
		}

		return new Response(null, {status: 400});
	},

	async scheduled(_event, env, _ctx) {
		const {results} = await env.DB.prepare('SELECT * FROM birthdays').all<Birthday>();
		const today = new Date();
		const todayMonth = today.getMonth() + 1;
		const todayDay = today.getDate();
		const activeBirthdays = results.filter((birthday) => birthday.active);
		const currentBirthdays = results.filter(
			(birthday) => birthday.birthday_month === todayMonth && birthday.birthday_day === todayDay,
		);
		const inactiveBirthdays = activeBirthdays.filter(
			(birthday) => !currentBirthdays.find((currentBirthday) => currentBirthday.user_id === birthday.user_id),
		);
		for (const birthday of inactiveBirthdays) {
			const response = await fetch(
				`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${birthday.user_id}/roles/${env.DISCORD_ROLE_ID}`,
				{
					method: 'DELETE',
					headers: {Authorization: `Bot ${env.DISCORD_TOKEN}`},
				},
			);
			if (!response.ok) {
				console.error(await response.text());
			}
			const updateStmt = env.DB.prepare('UPDATE birthdays SET active = ? WHERE user_id = ?');
			await updateStmt.bind(false, birthday.user_id).run();
		}
		const newBirthdays = currentBirthdays.filter(
			(birthday) => !activeBirthdays.find((activeBirthday) => activeBirthday.user_id === birthday.user_id),
		);
		for (const birthday of newBirthdays) {
			let response = await fetch(
				`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${birthday.user_id}/roles/${env.DISCORD_ROLE_ID}`,
				{
					method: 'PUT',
					headers: {Authorization: `Bot ${env.DISCORD_TOKEN}`},
				},
			);
			if (!response.ok) {
				console.error(await response.text());
			}
			const updateStmt = env.DB.prepare('UPDATE birthdays SET active = ? WHERE user_id = ?');
			await updateStmt.bind(true, birthday.user_id).run();
			response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
				method: 'POST',
				headers: {
					Authorization: `Bot ${env.DISCORD_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					content: `<@${birthday.user_id}> Happy birthday! 🎉`,
				}),
			});
			if (!response.ok) {
				console.error(await response.text());
			}
		}
	},
} satisfies ExportedHandler<Env>;

function jsonResponse(body: object, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {'Content-Type': 'application/json'},
	});
}

async function handleBirthdayCommand(
	commandData: APIChatInputApplicationCommandInteractionData,
	userId: string,
	env: Env,
): Promise<Response> {
	if (!commandData.options) {
		return new Response(null, {status: 400});
	}

	const subcommand: $TsFixMe = commandData.options.find((option) => option.type === 1);
	if (!subcommand || !subcommand.options) {
		return new Response(null, {status: 400});
	}

	switch (subcommand.name) {
		case 'set': {
			const monthOption = subcommand.options.find((option: $TsFixMe) => option.name === 'month');
			const dayOption = subcommand.options.find((option: $TsFixMe) => option.name === 'day');
			if (!monthOption || !dayOption) {
				return new Response(null, {status: 400});
			}
			if (!isValidDate(monthOption.value, dayOption.value)) {
				return jsonResponse({
					type: InteractionResponseType.ChannelMessageWithSource,
					data: {
						content: 'Invalid date provided. Please enter a valid month and day.',
						flags: 64,
					},
				});
			}
			const insertStmt = env.DB.prepare('INSERT OR REPLACE INTO birthdays VALUES (?, ?, ?, ?)');
			await insertStmt.bind(userId, monthOption.value, dayOption.value, false).run();
			const response = await fetch(
				`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${env.DISCORD_ROLE_ID}`,
				{
					method: 'DELETE',
					headers: {Authorization: `Bot ${env.DISCORD_TOKEN}`},
				},
			);
			if (!response.ok) {
				console.error(await response.text());
			}
			return jsonResponse({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {content: 'Birthday set!', flags: 64},
			});
		}

		case 'unset': {
			const deleteStmt = env.DB.prepare('DELETE FROM birthdays WHERE user_id = ?');
			await deleteStmt.bind(userId).run();
			const response = await fetch(
				`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${env.DISCORD_ROLE_ID}`,
				{
					method: 'DELETE',
					headers: {Authorization: `Bot ${env.DISCORD_TOKEN}`},
				},
			);
			if (!response.ok) {
				console.error(await response.text());
			}
			return jsonResponse({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {content: 'Birthday unset!', flags: 64},
			});
		}

		default: {
			return new Response(null, {status: 400});
		}
	}
}

function isValidDate(month: number, day: number): boolean {
	const date = new Date(2024, month - 1, day); // Leap year (2024) to account for February 29th
	return date.getMonth() + 1 === month && date.getDate() === day;
}
