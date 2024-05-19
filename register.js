import dotenv from "dotenv";
import assert from "node:assert";
import process from "node:process";

dotenv.config({ path: ".dev.vars" });

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

assert(token, "DISCORD_TOKEN is required");
assert(applicationId, "DISCORD_APPLICATION_ID is required");
assert(guildId, "DISCORD_GUILD_ID is required");

const response = await fetch(
	`https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
	{
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bot ${token}`,
		},
		method: "PUT",
		body: JSON.stringify([
			{
				name: "ping",
				description: "Replies with pong!",
			},
			{
				name: "birthday",
				description: "Set or unset your birthday.",
				options: [
					{
						name: "set",
						description: "Sets your birthday.",
						type: 1, // Type 1 indicates a subcommand
						options: [
							{
								name: "month",
								description: "Your birth month.",
								type: 4, // Type 4 indicates an INTEGER
								required: true,
								choices: [
									{ name: "January", value: 1 },
									{ name: "February", value: 2 },
									{ name: "March", value: 3 },
									{ name: "April", value: 4 },
									{ name: "May", value: 5 },
									{ name: "June", value: 6 },
									{ name: "July", value: 7 },
									{ name: "August", value: 8 },
									{ name: "September", value: 9 },
									{ name: "October", value: 10 },
									{ name: "November", value: 11 },
									{ name: "December", value: 12 },
								],
							},
							{
								name: "day",
								description: "Your birth day.",
								type: 4, // Type 4 indicates an INTEGER
								required: true,
								min_value: 1,
								max_value: 31,
							},
						],
					},
					{
						name: "unset",
						description: "Unsets your birthday.",
						type: 1, // Type 1 indicates a subcommand
					},
				],
			},
		]),
	},
);

if (!response.ok) {
	throw new Error(`Failed to register commands: ${response.statusText}`);
}

console.log("Successfully registered commands.");
